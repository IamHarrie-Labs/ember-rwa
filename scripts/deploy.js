const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log(`network   ${network.name} (chainId ${network.config.chainId})`);
  console.log(`deployer  ${deployer.address}`);
  console.log(`balance   ${ethers.formatEther(balance)} BOT\n`);

  // The verifier signing key is hot — it runs inside the proof cycle. Keep it separate
  // from the deployer so a compromised cycle host cannot touch roles or the reward pool.
  const verifierSigner = process.env.VERIFIER_KEY
    ? new ethers.Wallet(process.env.VERIFIER_KEY).address
    : deployer.address;

  const SignedVerifier = await ethers.getContractFactory("SignedAttestationVerifier");
  const verifier = await SignedVerifier.deploy(verifierSigner);
  await verifier.waitForDeployment();
  console.log(`SignedAttestationVerifier  ${await verifier.getAddress()}`);

  const Registry = await ethers.getContractFactory("EmberRegistry");
  const registry = await Registry.deploy(
    deployer.address, // underwriter agent
    deployer.address, // break proposer
    deployer.address // arbiter (v1, named in the docs rather than hidden)
  );
  await registry.waitForDeployment();
  console.log(`EmberRegistry              ${await registry.getAddress()}`);

  const Token = await ethers.getContractFactory("AssetToken");
  const token = await Token.deploy(await registry.getAddress());
  await token.waitForDeployment();
  console.log(`AssetToken                 ${await token.getAddress()}`);

  const Bond = await ethers.getContractFactory("IssuerBond");
  const bond = await Bond.deploy(await registry.getAddress(), await token.getAddress());
  await bond.waitForDeployment();
  console.log(`IssuerBond                 ${await bond.getAddress()}`);

  const Escrow = await ethers.getContractFactory("RevenueEscrow");
  const escrow = await Escrow.deploy(await registry.getAddress(), await token.getAddress());
  await escrow.waitForDeployment();
  console.log(`RevenueEscrow              ${await escrow.getAddress()}`);

  // Fund the permissionless relay path. Without this, `relayReward` and `rewardPool` are
  // both zero: anyone *can* relay a proof, but nobody is paid to, and "the fallback is
  // permissionless, not a promise" would be half true. Set REWARD_POOL=0 to skip.
  // relayReward must clear the measured gas cost of attest() (79,660 gas, ~0.0016 BOT at
  // 20 gwei) or no rational relayer ever calls it — 0.0005 previously left the incentive
  // negative.
  const relayReward = ethers.parseEther(process.env.RELAY_REWARD || "0.002");
  const rewardPool = ethers.parseEther(process.env.REWARD_POOL || "0.2");

  if (rewardPool > 0n) {
    if ((await ethers.provider.getBalance(deployer.address)) < rewardPool * 2n) {
      console.log(`\n! skipping reward pool — deployer balance is too low to fund ${ethers.formatEther(rewardPool)} BOT safely`);
    } else {
      await (await registry.setRelayReward(relayReward)).wait();
      await (await registry.fundRewards({ value: rewardPool })).wait();
      console.log(
        `\nrelay reward   ${ethers.formatEther(relayReward)} BOT per proof` +
          `\nreward pool    ${ethers.formatEther(rewardPool)} BOT ` +
          `(${rewardPool / relayReward} relayed proofs)`
      );
    }
  }

  const out = {
    network: network.name,
    chainId: Number(network.config.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    verifierSigner,
    contracts: {
      SignedAttestationVerifier: await verifier.getAddress(),
      EmberRegistry: await registry.getAddress(),
      AssetToken: await token.getAddress(),
      IssuerBond: await bond.getAddress(),
      RevenueEscrow: await escrow.getAddress(),
    },
  };

  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${network.name}.json`), JSON.stringify(out, null, 2));
  console.log(`\nwrote deployments/${network.name}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
