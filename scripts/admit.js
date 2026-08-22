// Registers every domain in agent/assets.json, then runs the real, already-tested
// `node agent/underwrite.js <domain>` for each one — the same path exercised by hand
// earlier, now just looped across the batch instead of reimplemented.
//
//   npx hardhat run scripts/admit.js --network bohr
const { network: hardhatNetwork } = require("hardhat");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const { ethers } = require("ethers");
const { KIND_DOMAIN, identifierOf, assetIdOf, contracts } = require("../agent/lib/chain");

async function main() {
  const assets = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "agent", "assets.json"), "utf8")
  );

  const wallet = new ethers.Wallet(
    process.env.DEPLOYER_KEY,
    new ethers.JsonRpcProvider(hardhatNetwork.config.url, hardhatNetwork.config.chainId, {
      staticNetwork: true,
    })
  );
  const { registry, deployment } = contracts(wallet, hardhatNetwork.name);

  console.log(`network   ${hardhatNetwork.name}`);
  console.log(`registry  ${deployment.contracts.EmberRegistry}\n`);

  for (const { domain } of assets) {
    const assetId = assetIdOf(domain);
    const onchain = await registry.getAsset(assetId);

    if (onchain.issuer === ethers.ZeroAddress) {
      console.log(`${domain}: registering...`);
      const tx = await registry.register(KIND_DOMAIN, identifierOf(domain), "ipfs://pending");
      await tx.wait();
    } else {
      console.log(`${domain}: already registered (${onchain.issuer})`);
    }

    const asset = await registry.getAsset(assetId);
    if (asset.burnTime !== 0n) {
      console.log(`${domain}: already admitted, burnTime ${asset.burnTime}s — skipping\n`);
      continue;
    }

    console.log(`${domain}: underwriting...`);
    try {
      execFileSync("node", ["agent/underwrite.js", domain], {
        cwd: path.join(__dirname, ".."),
        env: { ...process.env, NETWORK: hardhatNetwork.name },
        stdio: "inherit",
      });
    } catch (e) {
      console.log(`${domain}: underwrite failed (${e.message}) — continuing to the next asset\n`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
