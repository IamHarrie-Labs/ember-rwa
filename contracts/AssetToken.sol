// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {EmberRegistry} from "./EmberRegistry.sol";

/// @notice Whole-asset ownership. tokenId is the registry assetId, so the token and the
///         claim are the same identifier and cannot drift apart.
///
/// The transfer hook is the entire enforcement surface. It asks the registry whether the
/// asset's evidence is still fresh and reverts if it is not. There is no allowlist, no
/// pause, and no privileged transfer path — including for this contract's deployer.
contract AssetToken is ERC721 {
    EmberRegistry public immutable registry;

    event AssetMinted(bytes32 indexed assetId, address indexed to);
    event AssetRedeemed(bytes32 indexed assetId, address indexed from);

    error NotIssuer();
    error NotAdmitted();
    error EvidenceNotFresh(bytes32 assetId);
    error NotRedeemable(bytes32 assetId);

    constructor(address registry_) ERC721("Ember Asset", "EMBR") {
        registry = EmberRegistry(payable(registry_));
    }

    /// @notice Mintable only by the issuer, and only once the underwriter has written a
    ///         burn time. An unverified claim has no token.
    function mint(bytes32 assetId) external {
        EmberRegistry.Asset memory a = registry.getAsset(assetId);
        if (msg.sender != a.issuer) revert NotIssuer();
        if (a.burnTime == 0) revert NotAdmitted();

        _safeMint(msg.sender, uint256(assetId));
        emit AssetMinted(assetId, msg.sender);
    }

    /// @notice Burn a failed asset to unlock escrowed revenue and the issuer bond.
    function redeem(bytes32 assetId) external {
        if (registry.stateOf(assetId) != EmberRegistry.State.Redeemable) {
            revert NotRedeemable(assetId);
        }
        address holder = ownerOf(uint256(assetId));
        require(msg.sender == holder, "not holder");

        _burn(uint256(assetId));
        emit AssetRedeemed(assetId, holder);
    }

    /// @dev Mints and burns are permitted; ordinary transfers require fresh evidence.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            bytes32 assetId = bytes32(tokenId);
            if (!registry.tradable(assetId)) revert EvidenceNotFresh(assetId);
        }
        return super._update(to, tokenId, auth);
    }
}
