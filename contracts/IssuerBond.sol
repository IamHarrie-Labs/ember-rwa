// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EmberRegistry} from "./EmberRegistry.sol";
import {AssetToken} from "./AssetToken.sol";

/// @notice Skin in the game for the issuer.
///
/// Verification detects that an asset went bad; it cannot by itself make a holder whole.
/// Without a bond, an issuer can sell, keep the proceeds, and still control the domain at
/// the registrar. The bond makes the issuer's incentive the asset *continuing* to be real
/// rather than merely appearing real at the moment of sale.
///
/// Slashing is permissionless and mechanical: once the registry reports Broken, anyone can
/// send the bond to the current holder. Nobody has to be persuaded.
contract IssuerBond is ReentrancyGuard {
    EmberRegistry public immutable registry;
    AssetToken public immutable token;

    mapping(bytes32 => uint256) public bondOf;
    mapping(bytes32 => bool) public slashed;

    event BondPosted(bytes32 indexed assetId, address indexed issuer, uint256 amount);
    event BondSlashed(bytes32 indexed assetId, address indexed to, uint256 amount);
    event BondReleased(bytes32 indexed assetId, address indexed to, uint256 amount);

    error NotIssuer();
    error NoBond();
    error AlreadySlashed();
    error AssetNotBroken();
    error HolderAtRisk();

    constructor(address registry_, address token_) {
        registry = EmberRegistry(payable(registry_));
        token = AssetToken(token_);
    }

    function postBond(bytes32 assetId) external payable {
        EmberRegistry.Asset memory a = registry.getAsset(assetId);
        if (msg.sender != a.issuer) revert NotIssuer();
        bondOf[assetId] += msg.value;
        emit BondPosted(assetId, msg.sender, msg.value);
    }

    /// @notice Anyone may slash a broken asset's bond to its holder.
    function slash(bytes32 assetId) external nonReentrant {
        if (slashed[assetId]) revert AlreadySlashed();
        if (registry.stateOf(assetId) != EmberRegistry.State.Broken) revert AssetNotBroken();

        uint256 amount = bondOf[assetId];
        if (amount == 0) revert NoBond();

        address holder = token.ownerOf(uint256(assetId));
        slashed[assetId] = true;
        bondOf[assetId] = 0;

        (bool sent,) = holder.call{value: amount}("");
        require(sent, "payout failed");
        emit BondSlashed(assetId, holder, amount);
    }

    /// @notice The issuer can only recover a bond while no outside holder is exposed —
    ///         either the token was never sold, or it has been burned on redemption.
    function releaseBond(bytes32 assetId) external nonReentrant {
        EmberRegistry.Asset memory a = registry.getAsset(assetId);
        if (msg.sender != a.issuer) revert NotIssuer();
        if (slashed[assetId]) revert AlreadySlashed();

        uint256 amount = bondOf[assetId];
        if (amount == 0) revert NoBond();

        address holder = _holderOrZero(assetId);
        if (holder != address(0) && holder != a.issuer) revert HolderAtRisk();

        bondOf[assetId] = 0;
        (bool sent,) = msg.sender.call{value: amount}("");
        require(sent, "payout failed");
        emit BondReleased(assetId, msg.sender, amount);
    }

    function _holderOrZero(bytes32 assetId) internal view returns (address) {
        try token.ownerOf(uint256(assetId)) returns (address owner) {
            return owner;
        } catch {
            return address(0);
        }
    }
}
