// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EmberRegistry} from "./EmberRegistry.sol";
import {AssetToken} from "./AssetToken.sol";

/// @notice Revenue follows the same rule as ownership: it moves only while the evidence
///         backing the asset is fresh.
///
/// Deposits accrue to whoever holds the asset. Claiming requires the asset to be in a
/// tradable state, so revenue from an asset whose evidence has lapsed sits in escrow
/// rather than paying out against a claim that may no longer be true. On redemption the
/// escrow releases to the holder who took the loss.
contract RevenueEscrow is ReentrancyGuard {
    EmberRegistry public immutable registry;
    AssetToken public immutable token;

    mapping(bytes32 => uint256) public accrued;

    event RevenueDeposited(bytes32 indexed assetId, address indexed from, uint256 amount);
    event RevenueClaimed(bytes32 indexed assetId, address indexed to, uint256 amount);
    event EscrowReleased(bytes32 indexed assetId, address indexed to, uint256 amount);

    error NothingAccrued();
    error EvidenceNotFresh(bytes32 assetId);
    error NotHolder();
    error NotRedeemable(bytes32 assetId);

    constructor(address registry_, address token_) {
        registry = EmberRegistry(payable(registry_));
        token = AssetToken(token_);
    }

    /// @notice Anyone can pay revenue in — a lessee, a parking service, the issuer.
    function deposit(bytes32 assetId) external payable {
        accrued[assetId] += msg.value;
        emit RevenueDeposited(assetId, msg.sender, msg.value);
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
    /// @dev Callable before the holder burns the token in AssetToken.redeem().
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
}
