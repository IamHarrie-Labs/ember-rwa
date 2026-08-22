// Minimal read surface. Hand-written rather than imported from artifacts so the frontend
// has no build dependency on the contracts package.
export const REGISTRY_ABI = [
  "function assetCount() view returns (uint256)",
  "function assetIds(uint256) view returns (bytes32)",
  "function stateOf(bytes32) view returns (uint8)",
  "function tradable(bytes32) view returns (bool)",
  "function timeRemaining(bytes32) view returns (uint64)",
  "function challengeWindow() view returns (uint64)",
  "function getAsset(bytes32) view returns (tuple(address issuer,address verifier,bytes32 kind,bytes32 identifier,uint64 burnTime,uint64 lastAttestedAt,uint64 breakProposedAt,bool contested,bool broken,bool redeemable,bytes32 lastEvidenceHash,bytes32 breakReasonHash,string evidenceURI))",
] as const;

export const TOKEN_ABI = [
  "function ownerOf(uint256) view returns (address)",
  "function redeem(bytes32 assetId) external",
] as const;

export const ESCROW_ABI = [
  "function accrued(bytes32) view returns (uint256)",
  "function claim(bytes32 assetId) external",
  "function release(bytes32 assetId) external",
] as const;

/// Index matches the on-chain enum exactly.
export const STATES = [
  "None",
  "Pending",
  "Live",
  "Degraded",
  "Stale",
  "Broken",
  "Redeemable",
] as const;

export type StateName = (typeof STATES)[number];
