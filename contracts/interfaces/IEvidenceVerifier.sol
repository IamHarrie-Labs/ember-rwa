// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Validates a proof that an asset's real-world evidence was observed intact.
/// @dev The verifier layer is where asset classes plug in. Domains verify DNS/RDAP
///      observations; a future revenue class verifies zkTLS session proofs; a DNSSEC
///      implementation verifies RRSIG chains on-chain with no trusted party at all.
///      Verifiers are stateless and never write. Replay protection lives in the
///      registry, which only accepts observations newer than the one it already has.
interface IEvidenceVerifier {
    /// @param assetId   registry identifier the proof is claimed to be about
    /// @param identifier hash of the real-world identifier (e.g. keccak256("example.com"))
    /// @param proof     opaque, verifier-specific encoding
    /// @return ok           whether the evidence was observed intact
    /// @return observedAt   unix time the observation was made
    /// @return evidenceHash hash of the raw upstream responses, not the parsed summary
    function verify(bytes32 assetId, bytes32 identifier, bytes calldata proof)
        external
        view
        returns (bool ok, uint64 observedAt, bytes32 evidenceHash);

    /// @notice Human-readable label, e.g. "signed-attestation" or "dnssec".
    function verifierKind() external view returns (string memory);
}
