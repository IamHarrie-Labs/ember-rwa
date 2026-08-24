// Standalone deploy for RevenueEscrowV2 — reads the existing registry/token addresses
// from deployments/<network>.json rather than redeploying anything. Neither contract
// needs to know this exists; it is a second, independent revenue path.
const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  const existing = JSON.parse(fs.readFileSync(file, "utf8"));

  console.log(`network   ${network.name} (chainId ${network.config.chainId})`);
  console.log(`deployer  ${deployer.address}`);
  console.log(`registry  ${existing.contracts.EmberRegistry}`);
  console.log(`token     ${existing.contracts.AssetToken}`);

  const Escrow = await ethers.getContractFactory("RevenueEscrowV2");
  const escrow = await Escrow.deploy(existing.contracts.EmberRegistry, existing.contracts.AssetToken);
  await escrow.waitForDeployment();
  const address = await escrow.getAddress();
  console.log(`\nRevenueEscrowV2  ${address}`);

  existing.contracts.RevenueEscrowV2 = address;
  fs.writeFileSync(file, JSON.stringify(existing, null, 2));
  console.log(`wrote deployments/${network.name}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
