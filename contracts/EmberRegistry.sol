// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IEvidenceVerifier} from "./interfaces/IEvidenceVerifier.sol";

/// @title EmberRegistry
/// @notice An ember dies unless it is fed.
///
/// State is derived, never set. There is no freeze function anywhere in this contract,
/// and its absence is the design. An asset stops trading because the time since its last
/// valid proof exceeded its burn window — which happens on its own, costs nobody a
/// transaction, and cannot be prevented by any party including this contract's owner.
///
/// Invariant: no asset may trade unless its supporting evidence is still fresh.
contract EmberRegistry is Ownable, ReentrancyGuard {
    enum State {
        None,
        Pending, // registered, not yet underwritten
        Live, // age <= burnTime
        Degraded, // age <= 2 * burnTime, dimming
        Stale, // burnt out
        Broken, // claim finalized invalid
        Redeemable // wind-down
    }

    struct Asset {
        address issuer;
        address verifier;
        bytes32 kind; // keccak256("domain")
        bytes32 identifier; // keccak256("example.com")
        uint64 burnTime; // seconds one proof buys; written by the underwriter
        uint64 lastAttestedAt;
        uint64 breakProposedAt;
        bool contested;
        bool broken;
        bool redeemable;
        bytes32 lastEvidenceHash;
        bytes32 breakReasonHash;
        string evidenceURI; // underwriting memo + published evidence bundles
    }

    /// @notice Address permitted to admit assets and write their burn time. This is the
    ///         underwriter agent. It can set how long a proof lasts; it cannot freeze anything.
    address public underwriter;

    /// @notice Address permitted to propose that a claim is materially broken. Proposals
    ///         are time-delayed and contestable — an LLM can never instantly freeze an asset.
    address public breakProposer;

    /// @notice Resolves contested breaks in v1. The one remaining trusted role, named
    ///         rather than hidden. Roadmap: staked jury.
    address public arbiter;

    uint64 public challengeWindow = 1 hours;
    uint64 public minBurnTime = 30 seconds;
    uint64 public maxBurnTime = 30 days;

    /// @notice Paid to whoever relays a proof for an asset that actually needed one.
    uint256 public relayReward = 0;
    uint256 public rewardPool;

    mapping(bytes32 => Asset) private _assets;
    bytes32[] public assetIds;

    event AssetRegistered(
        bytes32 indexed assetId, address indexed issuer, bytes32 kind, bytes32 identifier
    );
    event AssetAdmitted(
        bytes32 indexed assetId, address verifier, uint64 burnTime, string evidenceURI
    );
    event Attested(
        bytes32 indexed assetId,
        address indexed relayer,
        uint64 observedAt,
        bytes32 evidenceHash,
        uint256 reward
    );
    event BreakProposed(bytes32 indexed assetId, bytes32 reasonHash, uint64 proposedAt);
    event BreakContested(bytes32 indexed assetId, address indexed by);
    event BreakFinalized(bytes32 indexed assetId);
    event BreakDismissed(bytes32 indexed assetId);
    event MarkedRedeemable(bytes32 indexed assetId);
    event RolesSet(address underwriter, address breakProposer, address arbiter);
    event RewardsFunded(address indexed from, uint256 amount);
    event RelayRewardSet(uint256 amount);

    error NotUnderwriter();
    error NotBreakProposer();
    error NotArbiter();
    error NotIssuer();
    error UnknownAsset();
    error AlreadyRegistered();
    error AlreadyAdmitted();
    error NotAdmitted();
    error BurnTimeOutOfRange(uint64 burnTime);
    error EvidenceRejected();
    error ObservationNotNewer(uint64 observedAt, uint64 lastAttestedAt);
    error NoBreakProposed();
    error ChallengeWindowOpen();
    error BreakWasContested();
    error AssetIsBroken();

    constructor(address underwriter_, address breakProposer_, address arbiter_)
        Ownable(msg.sender)
    {
        underwriter = underwriter_;
        breakProposer = breakProposer_;
        arbiter = arbiter_;
        emit RolesSet(underwriter_, breakProposer_, arbiter_);
    }

    // ---------------------------------------------------------------- state derivation

    /// @notice The whole protocol in one function. Nothing sets this; it is computed.
    function stateOf(bytes32 assetId) public view returns (State) {
        Asset storage a = _assets[assetId];
        if (a.issuer == address(0)) return State.None;
        if (a.redeemable) return State.Redeemable;
        if (a.broken) return State.Broken;
        if (a.burnTime == 0) return State.Pending;

        uint64 age = uint64(block.timestamp) - a.lastAttestedAt;
        if (age <= a.burnTime) return State.Live;
        if (age <= 2 * a.burnTime) return State.Degraded;
        return State.Stale;
    }

    /// @notice Read by AssetToken's transfer hook.
    function tradable(bytes32 assetId) external view returns (bool) {
        State s = stateOf(assetId);
        return s == State.Live || s == State.Degraded;
    }

    /// @notice Seconds until this asset burns out, 0 if it already has.
    function timeRemaining(bytes32 assetId) external view returns (uint64) {
        Asset storage a = _assets[assetId];
        if (a.burnTime == 0) return 0;
        uint64 deadline = a.lastAttestedAt + 2 * a.burnTime;
        if (block.timestamp >= deadline) return 0;
        return deadline - uint64(block.timestamp);
    }

    function getAsset(bytes32 assetId) external view returns (Asset memory) {
        return _assets[assetId];
    }

    function assetCount() external view returns (uint256) {
        return assetIds.length;
    }

    function computeAssetId(bytes32 kind, bytes32 identifier) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(kind, identifier));
    }

    // ---------------------------------------------------------------------- lifecycle

    /// @notice Anyone can register an asset. Registration asserts nothing; it opens a file.
    function register(bytes32 kind, bytes32 identifier, string calldata evidenceURI)
        external
        returns (bytes32 assetId)
    {
        assetId = computeAssetId(kind, identifier);
        if (_assets[assetId].issuer != address(0)) revert AlreadyRegistered();

        Asset storage a = _assets[assetId];
        a.issuer = msg.sender;
        a.kind = kind;
        a.identifier = identifier;
        a.evidenceURI = evidenceURI;
        assetIds.push(assetId);

        emit AssetRegistered(assetId, msg.sender, kind, identifier);
    }

    /// @notice The underwriter's on-chain act: choose the verifier and write the burn time.
    /// @dev A clean, aged, stable asset earns a long burn time — one proof carries it for
    ///      hours. A thin or volatile one burns fast and must be fed constantly. This is
    ///      model judgment written into a business parameter that governs the asset for
    ///      its entire life, and deterministic once written.
    function admit(bytes32 assetId, address verifier, uint64 burnTime, string calldata evidenceURI)
        external
    {
        if (msg.sender != underwriter) revert NotUnderwriter();
        Asset storage a = _assets[assetId];
        if (a.issuer == address(0)) revert UnknownAsset();
        if (a.burnTime != 0) revert AlreadyAdmitted();
        if (burnTime < minBurnTime || burnTime > maxBurnTime) revert BurnTimeOutOfRange(burnTime);

        a.verifier = verifier;
        a.burnTime = burnTime;
        a.evidenceURI = evidenceURI;
        // Admission is itself the first proof point; the ember is lit now.
        a.lastAttestedAt = uint64(block.timestamp);

        emit AssetAdmitted(assetId, verifier, burnTime, evidenceURI);
    }

    // ------------------------------------------------------------------ the proof cycle

    /// @notice Permissionless. Anyone holding a valid proof can feed an asset.
    /// @dev The registry does not care who relays, only whether the proof validates. This
    ///      is what keeps a dead relayer from bricking the protocol.
    function attest(bytes32 assetId, bytes calldata proof) external nonReentrant {
        _attest(assetId, proof);
    }

    /// @notice Feed every asset the cycle covers in one transaction.
    /// @dev The 21,000 gas transaction base and the signature-recovery overhead amortize
    ///      across the batch, which is what keeps a per-minute cycle affordable. One bad
    ///      proof reverts the batch — the cycle resubmits without it rather than letting a
    ///      single failing asset silently skip its turn.
    function attestMany(bytes32[] calldata ids, bytes[] calldata proofs) external nonReentrant {
        require(ids.length == proofs.length, "length mismatch");
        for (uint256 i = 0; i < ids.length; ++i) {
            _attest(ids[i], proofs[i]);
        }
    }

    function _attest(bytes32 assetId, bytes calldata proof) internal {
        Asset storage a = _assets[assetId];
        if (a.issuer == address(0)) revert UnknownAsset();
        if (a.burnTime == 0) revert NotAdmitted();
        if (a.broken) revert AssetIsBroken();

        (bool ok, uint64 observedAt, bytes32 evidenceHash) =
            IEvidenceVerifier(a.verifier).verify(assetId, a.identifier, proof);
        if (!ok) revert EvidenceRejected();
        if (observedAt <= a.lastAttestedAt) {
            revert ObservationNotNewer(observedAt, a.lastAttestedAt);
        }

        // A fresh proof also clears a pending break proposal: the evidence answered it.
        if (a.breakProposedAt != 0) {
            a.breakProposedAt = 0;
            a.contested = false;
            emit BreakDismissed(assetId);
        }

        // Reward only assets that genuinely needed feeding, so the pool cannot be drained
        // by spamming proofs at an asset that is already burning bright.
        uint256 reward = 0;
        if (
            relayReward > 0 && rewardPool >= relayReward
                && block.timestamp - a.lastAttestedAt > a.burnTime / 2
        ) {
            reward = relayReward;
            rewardPool -= reward;
        }

        a.lastAttestedAt = observedAt;
        a.lastEvidenceHash = evidenceHash;

        emit Attested(assetId, msg.sender, observedAt, evidenceHash, reward);

        if (reward > 0) {
            (bool sent,) = msg.sender.call{value: reward}("");
            if (!sent) {
                rewardPool += reward;
            }
        }
    }

    // ------------------------------------------------------------------ the break path

    /// @notice Propose that a claim is materially invalid. Delayed and contestable.
    function proposeBreak(bytes32 assetId, bytes32 reasonHash) external {
        if (msg.sender != breakProposer) revert NotBreakProposer();
        Asset storage a = _assets[assetId];
        if (a.issuer == address(0)) revert UnknownAsset();
        if (a.burnTime == 0) revert NotAdmitted();

        a.breakProposedAt = uint64(block.timestamp);
        a.breakReasonHash = reasonHash;
        a.contested = false;

        emit BreakProposed(assetId, reasonHash, a.breakProposedAt);
    }

    function contestBreak(bytes32 assetId) external {
        Asset storage a = _assets[assetId];
        if (msg.sender != a.issuer) revert NotIssuer();
        if (a.breakProposedAt == 0) revert NoBreakProposed();
        a.contested = true;
        emit BreakContested(assetId, msg.sender);
    }

    /// @notice Anyone may finalize an uncontested break once the window has closed.
    function finalizeBreak(bytes32 assetId) external {
        Asset storage a = _assets[assetId];
        if (a.breakProposedAt == 0) revert NoBreakProposed();
        if (a.contested) revert BreakWasContested();
        if (block.timestamp < a.breakProposedAt + challengeWindow) revert ChallengeWindowOpen();

        a.broken = true;
        emit BreakFinalized(assetId);
    }

    /// @notice v1 resolution for contested breaks. Named, not hidden.
    function resolveContest(bytes32 assetId, bool upholdBreak) external {
        if (msg.sender != arbiter) revert NotArbiter();
        Asset storage a = _assets[assetId];
        if (a.breakProposedAt == 0) revert NoBreakProposed();

        if (upholdBreak) {
            a.broken = true;
            emit BreakFinalized(assetId);
        } else {
            a.breakProposedAt = 0;
            a.contested = false;
            emit BreakDismissed(assetId);
        }
    }

    /// @notice Opens the wind-down path. Only reachable from a genuinely failed asset.
    function markRedeemable(bytes32 assetId) external {
        Asset storage a = _assets[assetId];
        if (a.issuer == address(0)) revert UnknownAsset();
        State s = stateOf(assetId);
        require(s == State.Broken || s == State.Stale, "asset is not failed");
        require(msg.sender == a.issuer || msg.sender == arbiter, "not authorized");
        a.redeemable = true;
        emit MarkedRedeemable(assetId);
    }

    // ------------------------------------------------------------------------ admin

    /// @dev Deliberately absent: any function that pauses, freezes, or extends an asset's
    ///      clock. Owner powers cover roles, parameters and the reward pool only.

    function setRoles(address underwriter_, address breakProposer_, address arbiter_)
        external
        onlyOwner
    {
        underwriter = underwriter_;
        breakProposer = breakProposer_;
        arbiter = arbiter_;
        emit RolesSet(underwriter_, breakProposer_, arbiter_);
    }

    function setChallengeWindow(uint64 seconds_) external onlyOwner {
        challengeWindow = seconds_;
    }

    function setBurnTimeBounds(uint64 min_, uint64 max_) external onlyOwner {
        require(min_ > 0 && min_ <= max_, "bad bounds");
        minBurnTime = min_;
        maxBurnTime = max_;
    }

    function setRelayReward(uint256 amount) external onlyOwner {
        relayReward = amount;
        emit RelayRewardSet(amount);
    }

    function fundRewards() external payable {
        rewardPool += msg.value;
        emit RewardsFunded(msg.sender, msg.value);
    }

    receive() external payable {
        rewardPool += msg.value;
        emit RewardsFunded(msg.sender, msg.value);
    }
}
