const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const State = {
  None: 0n,
  Pending: 1n,
  Live: 2n,
  Degraded: 3n,
  Stale: 4n,
  Broken: 5n,
  Redeemable: 6n,
};

const KIND = ethers.keccak256(ethers.toUtf8Bytes("domain"));
const IDENTIFIER = ethers.keccak256(ethers.toUtf8Bytes("example.com"));
const BURN_TIME = 90n;

async function signObservation(signer, verifierAddress, assetId, ok, observedAt, evidenceHash) {
  const domain = {
    name: "Ember",
    version: "1",
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: verifierAddress,
  };
  const types = {
    Observation: [
      { name: "assetId", type: "bytes32" },
      { name: "identifier", type: "bytes32" },
      { name: "ok", type: "bool" },
      { name: "observedAt", type: "uint64" },
      { name: "evidenceHash", type: "bytes32" },
    ],
  };
  const value = { assetId, identifier: IDENTIFIER, ok, observedAt, evidenceHash };
  const signature = await signer.signTypedData(domain, types, value);
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["bool", "uint64", "bytes32", "bytes"],
    [ok, observedAt, evidenceHash, signature]
  );
}

describe("proof decay", function () {
  let registry, verifier, owner, underwriter, proposer, arbiter, issuer, relayer, signer;

  beforeEach(async function () {
    [owner, underwriter, proposer, arbiter, issuer, relayer, signer] = await ethers.getSigners();

    const Verifier = await ethers.getContractFactory("SignedAttestationVerifier");
    verifier = await Verifier.deploy(signer.address);

    const Registry = await ethers.getContractFactory("EmberRegistry");
    registry = await Registry.deploy(underwriter.address, proposer.address, arbiter.address);

    await registry.connect(issuer).register(KIND, IDENTIFIER, "ipfs://pending");
  });

  function assetId() {
    return ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [KIND, IDENTIFIER]);
  }

  async function admit() {
    await registry
      .connect(underwriter)
      .admit(assetId(), await verifier.getAddress(), BURN_TIME, "ipfs://memo");
  }

  async function attest(from = relayer) {
    const observedAt = BigInt(await time.latest()) + 1n;
    const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes(`raw-dns-rdap-${observedAt}`));
    const proof = await signObservation(
      signer,
      await verifier.getAddress(),
      assetId(),
      true,
      observedAt,
      evidenceHash
    );
    return registry.connect(from).attest(assetId(), proof);
  }

  it("is Pending before the underwriter writes a burn time", async function () {
    expect(await registry.stateOf(assetId())).to.equal(State.Pending);
    expect(await registry.tradable(assetId())).to.equal(false);
  });

  it("decays Live -> Degraded -> Stale with nobody sending a transaction", async function () {
    await admit();
    expect(await registry.stateOf(assetId())).to.equal(State.Live);
    expect(await registry.tradable(assetId())).to.equal(true);

    // Past one burn time: still tradable, but flagged.
    await time.increase(Number(BURN_TIME) + 5);
    expect(await registry.stateOf(assetId())).to.equal(State.Degraded);
    expect(await registry.tradable(assetId())).to.equal(true);

    // Past the decay window: no transaction was sent by anyone, and it is now untradable.
    await time.increase(Number(BURN_TIME));
    expect(await registry.stateOf(assetId())).to.equal(State.Stale);
    expect(await registry.tradable(assetId())).to.equal(false);
    expect(await registry.timeRemaining(assetId())).to.equal(0n);
  });

  it("a fresh proof restores a Stale asset", async function () {
    await admit();
    await time.increase(Number(BURN_TIME) * 3);
    expect(await registry.stateOf(assetId())).to.equal(State.Stale);

    await attest();
    expect(await registry.stateOf(assetId())).to.equal(State.Live);
  });

  it("accepts a relayed proof from any address", async function () {
    await admit();
    await time.increase(Number(BURN_TIME) * 3);
    // relayer is not the issuer, the signer, the underwriter, or the owner.
    await expect(attest(relayer)).to.emit(registry, "Attested");
    expect(await registry.stateOf(assetId())).to.equal(State.Live);
  });

  it("rejects a proof signed by an unknown key", async function () {
    await admit();
    const observedAt = BigInt(await time.latest()) + 1n;
    const proof = await signObservation(
      issuer, // not on the allowlist
      await verifier.getAddress(),
      assetId(),
      true,
      observedAt,
      ethers.ZeroHash
    );
    await expect(registry.connect(relayer).attest(assetId(), proof)).to.be.revertedWithCustomError(
      verifier,
      "UnknownSigner"
    );
  });

  it("rejects replay of an observation that is not newer", async function () {
    await admit();
    await time.increase(Number(BURN_TIME));
    const observedAt = BigInt(await time.latest());
    const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("raw"));
    const proof = await signObservation(
      signer,
      await verifier.getAddress(),
      assetId(),
      true,
      observedAt,
      evidenceHash
    );
    await registry.connect(relayer).attest(assetId(), proof);
    await expect(
      registry.connect(relayer).attest(assetId(), proof)
    ).to.be.revertedWithCustomError(registry, "ObservationNotNewer");
  });

  it("rejects a stockpiled signature once it ages out", async function () {
    await admit();
    const observedAt = BigInt(await time.latest()) + 1n;
    const proof = await signObservation(
      signer,
      await verifier.getAddress(),
      assetId(),
      true,
      observedAt,
      ethers.ZeroHash
    );
    await time.increase(11 * 60); // past maxObservationAge
    await expect(registry.connect(relayer).attest(assetId(), proof)).to.be.revertedWithCustomError(
      verifier,
      "ObservationTooOld"
    );
  });

  it("has no path for the owner to freeze or extend an asset", async function () {
    await admit();
    const iface = registry.interface;
    const names = iface.fragments.filter((f) => f.type === "function").map((f) => f.name);
    for (const forbidden of ["pause", "freeze", "setState", "setLastAttestedAt", "extend"]) {
      expect(names).to.not.include(forbidden);
    }
    // The owner cannot renew an asset without a valid proof, same as anyone else.
    await time.increase(Number(BURN_TIME) * 3);
    expect(await registry.stateOf(assetId())).to.equal(State.Stale);
  });
});

describe("the break path", function () {
  let registry, verifier, underwriter, proposer, arbiter, issuer, other;

  const id = () => ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [KIND, IDENTIFIER]);

  beforeEach(async function () {
    [, underwriter, proposer, arbiter, issuer, other] = await ethers.getSigners();
    const Verifier = await ethers.getContractFactory("SignedAttestationVerifier");
    verifier = await Verifier.deploy(other.address);
    const Registry = await ethers.getContractFactory("EmberRegistry");
    registry = await Registry.deploy(underwriter.address, proposer.address, arbiter.address);
    await registry.connect(issuer).register(KIND, IDENTIFIER, "ipfs://pending");
    await registry
      .connect(underwriter)
      .admit(id(), await verifier.getAddress(), BURN_TIME, "ipfs://memo");
  });

  it("cannot be finalized before the challenge window closes", async function () {
    await registry.connect(proposer).proposeBreak(id(), ethers.ZeroHash);
    await expect(registry.connect(other).finalizeBreak(id())).to.be.revertedWithCustomError(
      registry,
      "ChallengeWindowOpen"
    );
    expect(await registry.stateOf(id())).to.not.equal(State.Broken);
  });

  it("finalizes to Broken only after the window, and anyone may finalize", async function () {
    await registry.connect(proposer).proposeBreak(id(), ethers.ZeroHash);
    await time.increase(3601);
    await registry.connect(other).finalizeBreak(id());
    expect(await registry.stateOf(id())).to.equal(State.Broken);
    expect(await registry.tradable(id())).to.equal(false);
  });

  it("a contested break cannot be finalized unilaterally", async function () {
    await registry.connect(proposer).proposeBreak(id(), ethers.ZeroHash);
    await registry.connect(issuer).contestBreak(id());
    await time.increase(3601);
    await expect(registry.connect(other).finalizeBreak(id())).to.be.revertedWithCustomError(
      registry,
      "BreakWasContested"
    );
  });

  it("the proposer alone cannot freeze an asset", async function () {
    await registry.connect(proposer).proposeBreak(id(), ethers.ZeroHash);
    expect(await registry.tradable(id())).to.equal(true);
  });
});
