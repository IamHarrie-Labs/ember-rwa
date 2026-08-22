// Measures real gas for the proof cycle and prices it against BOT Chain mainnet
// conditions. Numbers reported in the submission come from here, not from estimates.
const { ethers } = require("hardhat");

const GAS_PRICE_WEI = 20n * 10n ** 9n; // measured on mainnet: baseFee 0, priority 20 gwei
const KIND = ethers.keccak256(ethers.toUtf8Bytes("domain"));

async function main() {
  const [deployer, underwriter, proposer, arbiter, issuer, relayer, signer] =
    await ethers.getSigners();

  const verifier = await (
    await ethers.getContractFactory("SignedAttestationVerifier")
  ).deploy(signer.address);
  const registry = await (
    await ethers.getContractFactory("EmberRegistry")
  ).deploy(underwriter.address, proposer.address, arbiter.address);

  const verifierAddr = await verifier.getAddress();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  const ids = [];
  for (const name of ["alpha.com", "beta.xyz", "gamma.io"]) {
    const identifier = ethers.keccak256(ethers.toUtf8Bytes(name));
    await registry.connect(issuer).register(KIND, identifier, "ipfs://pending");
    const id = ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [KIND, identifier]);
    await registry.connect(underwriter).admit(id, verifierAddr, 3600, "ipfs://memo");
    ids.push({ id, identifier });
  }

  async function proofFor({ id, identifier }, offset) {
    const observedAt = BigInt((await ethers.provider.getBlock("latest")).timestamp) + BigInt(offset);
    const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes(`raw-${id}-${observedAt}`));
    const signature = await signer.signTypedData(
      { name: "Ember", version: "1", chainId, verifyingContract: verifierAddr },
      {
        Observation: [
          { name: "assetId", type: "bytes32" },
          { name: "identifier", type: "bytes32" },
          { name: "ok", type: "bool" },
          { name: "observedAt", type: "uint64" },
          { name: "evidenceHash", type: "bytes32" },
        ],
      },
      { assetId: id, identifier, ok: true, observedAt, evidenceHash }
    );
    return ethers.AbiCoder.defaultAbiCoder().encode(
      ["bool", "uint64", "bytes32", "bytes"],
      [true, observedAt, evidenceHash, signature]
    );
  }

  const single = await (
    await registry.connect(relayer).attest(ids[0].id, await proofFor(ids[0], 1))
  ).wait();

  const proofs = [];
  for (const a of ids) proofs.push(await proofFor(a, 5));
  const batch = await (
    await registry.connect(relayer).attestMany(
      ids.map((a) => a.id),
      proofs
    )
  ).wait();

  const cost = (gas) => Number(ethers.formatEther(gas * GAS_PRICE_WEI));
  const perAssetBatched = batch.gasUsed / BigInt(ids.length);

  console.log(`\ngas price assumed        ${GAS_PRICE_WEI / 10n ** 9n} gwei (measured on mainnet)\n`);
  console.log(`attest, single asset     ${single.gasUsed} gas   ${cost(single.gasUsed).toFixed(6)} BOT`);
  console.log(`attestMany, ${ids.length} assets      ${batch.gasUsed} gas   ${cost(batch.gasUsed).toFixed(6)} BOT`);
  console.log(`  -> per asset batched   ${perAssetBatched} gas   ${cost(perAssetBatched).toFixed(6)} BOT`);
  console.log(
    `  -> batching saves        ${(100 - (Number(perAssetBatched) / Number(single.gasUsed)) * 100).toFixed(1)}%`
  );

  console.log(`\nwhat 1 BOT buys:`);
  const perCycle = (assets) => (assets === 1 ? single.gasUsed : perAssetBatched * BigInt(assets));
  for (const assets of [1, 3]) {
    const c = cost(perCycle(assets));
    const cycles = Math.floor(1 / c);
    console.log(
      `  ${assets} asset(s): ${cycles} cycles  ` +
        `= ${((cycles * 60) / 3600).toFixed(1)}h at 60s  ` +
        `| ${((cycles * 3600) / 86400).toFixed(0)}d at 1h  ` +
        `| ${((cycles * 10800) / 86400).toFixed(0)}d at 3h`
    );
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
