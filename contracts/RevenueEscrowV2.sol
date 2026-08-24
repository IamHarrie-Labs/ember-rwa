// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EmberRegistry} from "./EmberRegistry.sol";
import {AssetToken} from "./AssetToken.sol";

/// @notice RevenueEscrow, with one addition: a slice of every deposit routes automatically
///         into the registry's relay reward pool, so permissionless relay stays funded by
///         the system's own revenue instead of needing a manual top-up.
///
/// This is a second, standalone contract rather than a migration of RevenueEscrow — neither
/// EmberRegistry nor AssetToken hold a reference to "the" escrow, so nothing about the
/// already-deployed contracts needed to change for this to exist alongside them.
contract RevenueEscrowV2 is ReentrancyGuard, Ownable {
    EmberRegistry public immutable registry;
    AssetToken public immutable token;

    /// 5% by default. Ownable, but capped — the owner can tune it, never past the ceiling
    /// below, so a compromised or careless owner key can shrink payouts but never zero them.
    uint16 public feeBps = 500;
    uint16 public constant MAX_FEE_BPS = 2000;

    mapping(bytes32 => uint256) public accrued;

    event RevenueDeposited(bytes32 indexed assetId, address indexed from, uint256 net, uint256 feeRouted);
    event RevenueClaimed(bytes32 indexed assetId, address indexed to, uint256 amount);
    event EscrowReleased(bytes32 indexed assetId, address indexed to, uint256 amount);
    event FeeBpsSet(uint16 bps);

    error NothingAccrued();
    error EvidenceNotFresh(bytes32 assetId);
    error NotHolder();
    error NotRedeemable(bytes32 assetId);
    error FeeTooHigh();

    constructor(address registry_, address token_) Ownable(msg.sender) {
        registry = EmberRegistry(payable(registry_));
        token = AssetToken(token_);
    }

    /// @notice Anyone can pay revenue in. The fee slice routes to the reward pool in the
    ///         same transaction; the rest accrues to the asset exactly as in V1.
    function deposit(bytes32 assetId) external payable {
        uint256 fee = (msg.value * feeBps) / 10_000;
        uint256 net = msg.value - fee;
        accrued[assetId] += net;
        if (fee > 0) registry.fundRewards{value: fee}();
        emit RevenueDeposited(assetId, msg.sender, net, fee);
    }

    /// @notice Claimable by the holder only while the asset's evidence is fresh.
    function claim(bytes32 assetId) external nonReentrant {
        if (!registry.tradable(assetId)) revert EvidenceNotFresh(assetId);
        if (token.ownerOf(uint256(assetId)) != msg.sender) revert NotHolder();

        uint256 amount = accrued[assetId];
        if (amount == 0) revert NothingAccrued();
        accrued[assetId] = 0;

        (bool sent,) = msg.sender.call{value: amount}("");
        require(sent, "payout failed");
        emit RevenueClaimed(assetId, msg.sender, amount);
    }

    /// @notice Wind-down. Escrowed revenue goes to the holder who carried the failure.
    function release(bytes32 assetId) external nonReentrant {
        if (registry.stateOf(assetId) != EmberRegistry.State.Redeemable) {
            revert NotRedeemable(assetId);
        }
        address holder = token.ownerOf(uint256(assetId));
        if (msg.sender != holder) revert NotHolder();

        uint256 amount = accrued[assetId];
        if (amount == 0) revert NothingAccrued();
        accrued[assetId] = 0;

        (bool sent,) = holder.call{value: amount}("");
        require(sent, "payout failed");
        emit EscrowReleased(assetId, holder, amount);
    }

    function setFeeBps(uint16 bps) external onlyOwner {
        if (bps > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = bps;
        emit FeeBpsSet(bps);
    }
}
