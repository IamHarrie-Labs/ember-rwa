// End-to-end: the real agent code against the real contracts.
//
// Everything here is production code except the zone and the clock. The proof cycle, the
// EIP-712 signing, the deterministic evaluation, the registry, the transfer hook and the
// publisher are all the shipping implementations — so this catches the class of bug unit
// tests cannot: ABI drift, signature encoding mismatches, and publish-shape regressions.
//
// The zone is injectable because "the operator deleted the TXT record" is the single most
// important behaviour in the system and there is no other way to test it.
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// Redirect the agent's record and the published site data before either module resolves a
// path, so a test run never touches the real evidence directory or the committed site data.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "ember-e2e-"));
process.env.EVIDENCE_DIR = path.join(TMP, "evidence");
process.env.EVIDENCE_OUT = path.join(TMP, "site");

const { pass } = require("../agent/cycle");
const { collect, controlMessage, expectedRecord } = require("../agent/lib/evidence");
const { evidenceHash } = require("../agent/lib/canonical");
const { publish } = require("../agent/lib/publish");
const { assetIdOf, identifierOf, KIND_DOMAIN, STATE } = require("../agent/lib/chain");

after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const DOMAIN_A = "harness-a.test";
const DOMAIN_B = "harness-b.test";
const BURN_TIME = 300n;

/// pass() narrates. Useful in production, noise in a test run.
async function quiet(fn) {
  const log = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
  }
}

describe("end to end: cycle, contracts and publisher", function () {
  let registry, verifier, token, deployer, underwriter, proposer, arbiter, issuer, relayer, signer;
  let chainId, zone, ctx;

  const idA = assetIdOf(DOMAIN_A);
  const idB = assetIdOf(DOMAIN_B);

  /// A controlled zone. Flipping `txt` is the on-stage deletion.
  function readersFor(domain) {
    const z = zone[domain];
    return {
      readTxt: async () => ({
        ok: true,
        records: z.txt ? [expectedRecord(z.signature), "v=spf1 -all"] : ["v=spf1 -all"],
      }),
      readNs: async () => ({ ok: true, nameservers: ["ns1.harness.test"] }),
      readRdap: async () => ({
        ok: true,
        status: 200,
        url: "rdap://harness",
        handle: "HARNESS",
        status_flags: ["client transfer prohibited"],
        events: [{ action: "registration", date: "2015-01-01T00:00:00Z" }],
        expiration: z.expiration,
      }),
      readHttp: async () => ({ ok: true, url: `https://${domain}`, status: 200 }),
    };
  }

  /// Real bundle assembly and real hashing; only the readers and the timestamp are ours.
  /// observedAt must track chain time because the verifier rejects observations older than
  /// ten minutes, and hardhat's clock is moved forward by the tests.
  async function fakeCollect(domain) {
    const { bundle } = await collect(domain, readersFor(domain));
    // `pin` simulates a skewed clock: the agent signs a timestamp the registry has already
    // accepted, which is the realistic way a valid-looking proof gets rejected on-chain.
    bundle.observedAt = zone[domain].pin ?? (await time.latest()) + 1;
    return { bundle, hash: evidenceHash(bundle), observedAt: bundle.observedAt };
  }

  async function runPass() {
    ctx.nowSec = () => Math.floor(Date.now() / 1000);
    const chainNow = await time.latest();
    // isDue compares against chain time, which the tests move independently of wall clock.
    ctx.nowSec = () => chainNow;
    return quiet(() => pass(ctx));
  }

  const stateOf = async (id) => STATE[Number(await registry.stateOf(id))];

  beforeEach(async function () {
    [deployer, underwriter, proposer, arbiter, issuer, relayer, signer] =
      await ethers.getSigners();
    chainId = (await ethers.provider.getNetwork()).chainId;

    verifier = await (
      await ethers.getContractFactory("SignedAttestationVerifier")
    ).deploy(signer.address);
    registry = await (
      await ethers.getContractFactory("EmberRegistry")
    ).deploy(underwriter.address, proposer.address, arbiter.address);
    token = await (
      await ethers.getContractFactory("AssetToken")
    ).deploy(await registry.getAddress());

    const expiration = new Date(Date.now() + 400 * 86400000).toISOString();
    zone = {};
    for (const domain of [DOMAIN_A, DOMAIN_B]) {
      zone[domain] = {
        txt: true,
        expiration,
        signature: await issuer.signMessage(controlMessage(domain, issuer.address)),
      };
      await registry
        .connect(issuer)
        .register(KIND_DOMAIN, identifierOf(domain), "ipfs://pending");
      await registry
        .connect(underwriter)
        .admit(assetIdOf(domain), await verifier.getAddress(), BURN_TIME, "ipfs://memo");
    }

    fs.rmSync(process.env.EVIDENCE_DIR, { recursive: true, force: true });
    fs.rmSync(process.env.EVIDENCE_OUT, { recursive: true, force: true });

    ctx = {
      // Relayed by an address that is neither the issuer, the signer, nor the owner.
      registry: registry.connect(relayer),
      verifierAddress: await verifier.getAddress(),
      wallet: signer,
      chainId,
      assets: [
        { domain: DOMAIN_A, signature: zone[DOMAIN_A].signature },
        { domain: DOMAIN_B, signature: zone[DOMAIN_B].signature },
      ],
      collect: fakeCollect,
    };
  });

  it("feeds both assets in one batched transaction", async function () {
    await time.increase(Number(BURN_TIME)); // past half the burn time, so both are due
    await runPass();

    expect(await stateOf(idA)).to.equal("Live");
    expect(await stateOf(idB)).to.equal("Live");

    const rows = readHistory();
    const attested = rows.filter((r) => r.event === "attested");
    expect(attested).to.have.length(2);
    // One transaction, two rows — this is the batching claim, asserted rather than stated.
    expect(new Set(attested.map((r) => r.txHash)).size).to.equal(1);
    expect(attested[0].batchSize).to.equal(2);
  });

  it("decays to Stale and blocks transfers when the record disappears", async function () {
    await time.increase(Number(BURN_TIME));
    await runPass();

    await token.connect(issuer).mint(idA);
    await token.connect(issuer).transferFrom(issuer.address, relayer.address, BigInt(idA));
    expect(await token.ownerOf(BigInt(idA))).to.equal(relayer.address);

    // The operator deletes the TXT record.
    zone[DOMAIN_A].txt = false;

    await time.increase(Number(BURN_TIME));
    await runPass();

    // Nothing was written for A — the cycle refuses to assert what it did not observe.
    const failed = readHistory().filter(
      (r) => r.event === "evidence_failed" && r.domain === DOMAIN_A
    );
    expect(failed).to.have.length(1);
    expect(failed[0].reasons.join()).to.contain("absent");

    // B, still published, was fed in the same pass.
    expect(await stateOf(idB)).to.equal("Live");
    expect(await stateOf(idA)).to.equal("Degraded");

    await time.increase(Number(BURN_TIME) + 5);
    expect(await stateOf(idA)).to.equal("Stale");

    await expect(
      token.connect(relayer).transferFrom(relayer.address, issuer.address, BigInt(idA))
    ).to.be.revertedWithCustomError(token, "EvidenceNotFresh");
  });

  it("recovers when the record is restored", async function () {
    zone[DOMAIN_A].txt = false;
    await time.increase(Number(BURN_TIME) * 2 + 5);
    expect(await stateOf(idA)).to.equal("Stale");

    zone[DOMAIN_A].txt = true;
    await runPass();
    expect(await stateOf(idA)).to.equal("Live");
  });

  it("refuses to write when the registration has lapsed", async function () {
    zone[DOMAIN_A].expiration = new Date(Date.now() - 86400000).toISOString();
    await time.increase(Number(BURN_TIME));
    await runPass();

    const rows = readHistory().filter((r) => r.domain === DOMAIN_A);
    expect(rows[rows.length - 1].event).to.equal("evidence_failed");
    expect(rows[rows.length - 1].reasons.join()).to.contain("expired");
  });

  // attestMany is atomic, so one unusable proof would revert the write for every asset in
  // the cycle. The pass falls back to feeding them individually: the bad asset fails alone.
  it("one bad observation does not starve the rest of the batch", async function () {
    await time.increase(Number(BURN_TIME));
    await runPass();

    const beforeA = (await registry.getAsset(idA)).lastAttestedAt;
    const beforeB = (await registry.getAsset(idB)).lastAttestedAt;

    // Only A is skewed — it re-signs a timestamp the registry has already accepted.
    // B's proof is perfectly valid.
    zone[DOMAIN_A].pin = Number(beforeA);

    await time.increase(Number(BURN_TIME));
    await runPass();

    const rows = readHistory();
    // The batch reverted and was recorded as such...
    expect(rows.some((r) => r.event === "batch_failed")).to.equal(true);
    // ...then A failed alone on the retry.
    expect(rows.some((r) => r.event === "submission_failed")).to.equal(true);

    // B kept its cycle despite sharing a batch with a broken asset.
    expect((await registry.getAsset(idB)).lastAttestedAt).to.be.greaterThan(beforeB);
    expect(await stateOf(idB)).to.equal("Live");

    // A did not, and goes out honestly.
    expect((await registry.getAsset(idA)).lastAttestedAt).to.equal(beforeA);
    expect(await stateOf(idA)).to.equal("Degraded");
  });

  it("publishes an index and timeline the site can read", async function () {
    await time.increase(Number(BURN_TIME));
    await runPass();

    const index = publish({ quiet: true });

    expect(index.assets[idA]).to.exist;
    expect(index.assets[idA].attestations).to.equal(1);
    expect(index.cycle.assetAttestations).to.equal(2);
    // Two assets, one transaction: gas must be counted once, not twice.
    expect(index.cycle.attestations).to.equal(1);
    expect(index.cycle.last24h.transactions).to.equal(1);

    const timeline = JSON.parse(
      fs.readFileSync(path.join(process.env.EVIDENCE_OUT, "history", `${idA}.json`), "utf8")
    );
    expect(timeline.timeline[0].verdict).to.equal("valid");
    expect(timeline.timeline[0].txHash).to.match(/^0x[0-9a-f]{64}$/i);
    expect(timeline.timeline[0].evidenceHash).to.match(/^0x[0-9a-f]{64}$/i);
  });

  it("publishes the failure as a row with no transaction", async function () {
    zone[DOMAIN_A].txt = false;
    await time.increase(Number(BURN_TIME));
    await runPass();
    publish({ quiet: true });

    const timeline = JSON.parse(
      fs.readFileSync(path.join(process.env.EVIDENCE_OUT, "history", `${idA}.json`), "utf8")
    );
    expect(timeline.timeline[0].verdict).to.equal("no proof");
    expect(timeline.timeline[0].txHash).to.equal(null);
  });
});

function readHistory() {
  const p = path.join(process.env.EVIDENCE_DIR, "history.jsonl");
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}
