const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");
require("dotenv").config();

const ROOT = path.join(__dirname, "..", "..");
const KIND_DOMAIN = ethers.keccak256(ethers.toUtf8Bytes("domain"));

function abiOf(name) {
  const p = path.join(ROOT, "artifacts", "contracts", `${name}.sol`, `${name}.json`);
  if (!fs.existsSync(p)) throw new Error(`missing artifact for ${name} — run: npm run build`);
  return JSON.parse(fs.readFileSync(p, "utf8")).abi;
}

function deployment(network = process.env.NETWORK || "botchain") {
  const p = path.join(ROOT, "deployments", `${network}.json`);
  if (!fs.existsSync(p)) throw new Error(`no deployment for ${network} — run: npm run deploy:${network}`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/// One entry per chain the agent can run against. NETWORK selects it, and the deployment
/// file, RPC and explorer all follow from that single choice.
const NETWORKS = {
  botchain: {
    chainId: 677,
    rpc: () => process.env.BOTCHAIN_RPC_URL || "https://rpc.botchain.ai",
    explorer: "https://scan.botchain.ai",
  },
  bohr: {
    chainId: 968,
    rpc: () => process.env.BOHR_RPC_URL || "https://rpc.bohr.life",
    explorer: "https://scan.bohr.life",
  },
};

const NETWORK = process.env.NETWORK || "botchain";

function network(name = NETWORK) {
  const n = NETWORKS[name];
  if (!n) throw new Error(`unknown NETWORK "${name}" — expected one of ${Object.keys(NETWORKS)}`);
  return { name, ...n, rpc: n.rpc() };
}

function provider(name = NETWORK) {
  const n = network(name);
  return new ethers.JsonRpcProvider(n.rpc, n.chainId, {
    // The chain produces a block every 0.75s; the default 4s poll would make the agent
    // look sluggish next to its own countdown.
    staticNetwork: true,
    pollingInterval: 1000,
  });
}

/// The signing key and the relaying key are deliberately the same wallet in v1 but do not
/// have to be: signing is permissioned, relaying is not. Anyone can carry our signature.
function signerWallet(p) {
  const key = process.env.VERIFIER_KEY || process.env.DEPLOYER_KEY;
  if (!key) throw new Error("set VERIFIER_KEY in .env");
  return new ethers.Wallet(key, p);
}

function contracts(runner, network) {
  const d = deployment(network);
  return {
    deployment: d,
    registry: new ethers.Contract(d.contracts.EmberRegistry, abiOf("EmberRegistry"), runner),
    verifierAddress: d.contracts.SignedAttestationVerifier,
  };
}

const OBSERVATION_TYPES = {
  Observation: [
    { name: "assetId", type: "bytes32" },
    { name: "identifier", type: "bytes32" },
    { name: "ok", type: "bool" },
    { name: "observedAt", type: "uint64" },
    { name: "evidenceHash", type: "bytes32" },
  ],
};

async function signObservation(wallet, verifyingContract, chainId, obs) {
  const signature = await wallet.signTypedData(
    { name: "Ember", version: "1", chainId, verifyingContract },
    OBSERVATION_TYPES,
    obs
  );
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["bool", "uint64", "bytes32", "bytes"],
    [obs.ok, obs.observedAt, obs.evidenceHash, signature]
  );
}

const identifierOf = (domain) => ethers.keccak256(ethers.toUtf8Bytes(domain.toLowerCase()));
const assetIdOf = (domain) =>
  ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [KIND_DOMAIN, identifierOf(domain)]);

const STATE = ["None", "Pending", "Live", "Degraded", "Stale", "Broken", "Redeemable"];

module.exports = {
  ROOT,
  KIND_DOMAIN,
  STATE,
  NETWORK,
  network,
  abiOf,
  deployment,
  provider,
  signerWallet,
  contracts,
  signObservation,
  identifierOf,
  assetIdOf,
};
