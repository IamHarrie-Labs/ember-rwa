const { ethers } = require("ethers");

/// Canonical JSON: object keys sorted recursively, no insignificant whitespace.
/// The evidence hash written on-chain must be reproducible by a third party who
/// re-fetches the same upstream responses, so serialization cannot depend on the order
/// keys happened to be inserted in.
function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
}

/// Hash of the RAW upstream responses, not of our parsed conclusions. Anyone can re-run
/// the lookups, canonicalize, and check they arrive at the same digest.
function evidenceHash(bundle) {
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalize(bundle)));
}

module.exports = { canonicalize, evidenceHash };
