// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IEvidenceVerifier} from "../interfaces/IEvidenceVerifier.sol";

/// @notice v1 baseline verifier: an allowlisted key signs what it observed off-chain.
///
/// Signing is permissioned. **Submission is not.** Anyone holding a valid signature can
/// relay it and collect the registry's relay reward, so the protocol does not brick when
/// the primary relayer goes down — the worst case is that assets decay to Stale, which
/// is a refusal to assert liveness rather than a false assertion of it.
///
/// This verifier is the fallback. DnssecVerifier removes the signer entirely.
contract SignedAttestationVerifier is IEvidenceVerifier, EIP712, Ownable {
    /// @dev `ok` is carried in the signed payload so a signer can attest to a negative
    ///      observation explicitly, rather than only by staying silent.
    bytes32 private constant OBSERVATION_TYPEHASH = keccak256(
        "Observation(bytes32 assetId,bytes32 identifier,bool ok,uint64 observedAt,bytes32 evidenceHash)"
    );

    /// @notice Signatures older than this are rejected outright, independent of the
    ///         asset's burn time, so a stockpiled signature cannot revive a dead asset.
    uint64 public maxObservationAge = 10 minutes;

    /// @notice Tolerance for clock skew between the signer and the chain.
    uint64 public constant FUTURE_TOLERANCE = 60;

    mapping(address => bool) public isSigner;

    event SignerSet(address indexed signer, bool allowed);
    event MaxObservationAgeSet(uint64 seconds_);

    error UnknownSigner(address signer);
    error ObservationTooOld(uint64 observedAt);
    error ObservationInFuture(uint64 observedAt);

    constructor(address initialSigner)
        EIP712("Ember", "1")
        Ownable(msg.sender)
    {
        isSigner[initialSigner] = true;
        emit SignerSet(initialSigner, true);
    }

    function setSigner(address signer, bool allowed) external onlyOwner {
        isSigner[signer] = allowed;
        emit SignerSet(signer, allowed);
    }

    function setMaxObservationAge(uint64 seconds_) external onlyOwner {
        maxObservationAge = seconds_;
        emit MaxObservationAgeSet(seconds_);
    }

    function verifierKind() external pure returns (string memory) {
        return "signed-attestation";
    }

    /// @param proof abi.encode(bool ok, uint64 observedAt, bytes32 evidenceHash, bytes signature)
    function verify(bytes32 assetId, bytes32 identifier, bytes calldata proof)
        external
        view
        returns (bool ok, uint64 observedAt, bytes32 evidenceHash)
    {
        bytes memory signature;
        (ok, observedAt, evidenceHash, signature) =
            abi.decode(proof, (bool, uint64, bytes32, bytes));

        if (observedAt > block.timestamp + FUTURE_TOLERANCE) {
            revert ObservationInFuture(observedAt);
        }
        if (block.timestamp > observedAt + maxObservationAge) {
            revert ObservationTooOld(observedAt);
        }

        address signer = ECDSA.recover(
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        OBSERVATION_TYPEHASH, assetId, identifier, ok, observedAt, evidenceHash
                    )
                )
            ),
            signature
        );
        if (!isSigner[signer]) revert UnknownSigner(signer);
    }
}
