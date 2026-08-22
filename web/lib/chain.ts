import { Contract, JsonRpcProvider, keccak256, solidityPackedKeccak256, toUtf8Bytes } from "ethers";
import { REGISTRY_ABI, TOKEN_ABI, ESCROW_ABI, STATES, type StateName } from "./abi";

// Overridable so the same build can point at testnet (968) while it's the only chain with
// real on-chain data. Defaults to mainnet.
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 677);
export const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.botchain.ai";
export const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER || "https://scan.botchain.ai";
export const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || "";
export const TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_ADDRESS || "";
export const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS || "";
export const GITHUB_URL = process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com";

/// Rendered in the footer. An address that is not set renders as "not deployed" rather than
/// as a plausible-looking placeholder — the whole site's claim is that everything on it is
/// checkable, and a fake address is the fastest way to lose that.
export const CONTRACTS: { name: string; address: string }[] = [
  { name: "EmberRegistry", address: REGISTRY_ADDRESS },
  { name: "AssetToken", address: process.env.NEXT_PUBLIC_TOKEN_ADDRESS || "" },
  { name: "SignedAttestationVerifier", address: process.env.NEXT_PUBLIC_VERIFIER_ADDRESS || "" },
  { name: "IssuerBond", address: process.env.NEXT_PUBLIC_BOND_ADDRESS || "" },
  { name: "RevenueEscrow", address: process.env.NEXT_PUBLIC_ESCROW_ADDRESS || "" },
];

export const CHAIN_PARAMS = {
  chainId: CHAIN_ID_HEX,
  chainName: "BOT Chain",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: [RPC_URL],
  blockExplorerUrls: [EXPLORER],
};

export type Asset = {
  id: string;
  issuer: string;
  burnTime: number;
  lastAttestedAt: number;
  broken: boolean;
  redeemable: boolean;
  evidenceURI: string;
  lastEvidenceHash: string;
  state: StateName;
  /** Seconds left in the decay window at the moment of the read. */
  remaining: number;
  /** Wall-clock ms when this snapshot was taken, so the client can tick without re-reading. */
  readAt: number;
};

export function readProvider() {
  // staticNetwork avoids an extra eth_chainId round trip on every call.
  return new JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true });
}

export function registry(runner: any) {
  if (!REGISTRY_ADDRESS) throw new Error("NEXT_PUBLIC_REGISTRY_ADDRESS is not set");
  return new Contract(REGISTRY_ADDRESS, REGISTRY_ABI, runner);
}

/// `runner` is a Provider for reads or a Signer for the two owner-only actions the UI can
/// actually perform: redeeming a failed asset and claiming accrued revenue.
export function tokenContract(runner: any) {
  if (!TOKEN_ADDRESS) throw new Error("NEXT_PUBLIC_TOKEN_ADDRESS is not set");
  return new Contract(TOKEN_ADDRESS, TOKEN_ABI, runner);
}

export function escrowContract(runner: any) {
  if (!ESCROW_ADDRESS) throw new Error("NEXT_PUBLIC_ESCROW_ADDRESS is not set");
  return new Contract(ESCROW_ADDRESS, ESCROW_ABI, runner);
}

/// null means "not minted yet" (ownerOf reverts on a nonexistent token) rather than an error.
export async function fetchHolder(id: string): Promise<string | null> {
  try {
    return await tokenContract(readProvider()).ownerOf(id);
  } catch {
    return null;
  }
}

export async function fetchAccrued(id: string): Promise<bigint> {
  try {
    return await escrowContract(readProvider()).accrued(id);
  } catch {
    return 0n;
  }
}

async function readAsset(reg: Contract, id: string): Promise<Asset> {
  const [raw, state, remaining] = await Promise.all([
    reg.getAsset(id),
    reg.stateOf(id),
    reg.timeRemaining(id),
  ]);

  return {
    id,
    issuer: raw.issuer,
    burnTime: Number(raw.burnTime),
    lastAttestedAt: Number(raw.lastAttestedAt),
    broken: raw.broken,
    redeemable: raw.redeemable,
    evidenceURI: raw.evidenceURI,
    lastEvidenceHash: raw.lastEvidenceHash,
    state: STATES[Number(state)] ?? "None",
    remaining: Number(remaining),
    readAt: Date.now(),
  };
}

/// The public RPC caps eth_getLogs at roughly a 1,000-block span, so nothing here reads
/// events. Every value on this page is a view call against current state — which is also
/// the stronger position: the page shows what the chain says right now, not a replay.
export async function fetchAssets(): Promise<Asset[]> {
  const provider = readProvider();
  const reg = registry(provider);

  const count = Number(await reg.assetCount());
  if (count === 0) return [];

  const ids: string[] = await Promise.all(
    Array.from({ length: count }, (_, i) => reg.assetIds(i))
  );
  return Promise.all(ids.map((id) => readAsset(reg, id)));
}

export async function fetchAsset(id: string): Promise<Asset> {
  return readAsset(registry(readProvider()), id);
}

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addressUrl = (address: string) => `${EXPLORER}/address/${address}`;

/// Mirrors contracts/EmberRegistry.sol's computeAssetId and agent/lib/chain.js exactly —
/// all three must agree byte-for-byte, since the frontend registers assets the agent and
/// contract then have to recognize by the same id.
export const KIND_DOMAIN = keccak256(toUtf8Bytes("domain"));
export const identifierOf = (domain: string) => keccak256(toUtf8Bytes(domain.toLowerCase()));
export const assetIdOf = (domain: string) =>
  solidityPackedKeccak256(["bytes32", "bytes32"], [KIND_DOMAIN, identifierOf(domain)]);

/// The registry only stores keccak256(domain) on-chain — never the plaintext. Self-serve
/// registration carries the domain back out through evidenceURI, the one free-text field
/// register() already accepts, so agent/lib/chain.js#discoverDomains can find it later
/// without a hand-maintained list. Keep this in sync with DOMAIN_URI_PREFIX there.
export const DOMAIN_URI_PREFIX = "domain:";
export const controlMessage = (domain: string, issuer: string) =>
  `ember:${domain.toLowerCase()}:${issuer.toLowerCase()}`;
