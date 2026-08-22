const { expect } = require("chai");
const { ethers } = require("ethers");
const { canonicalize, evidenceHash } = require("../agent/lib/canonical");
const { evaluate, controlMessage, expectedRecord } = require("../agent/lib/evidence");

const DOMAIN = "example.com";

async function fixture({ txtPresent = true, signer, issuer, expiration = "2030-01-01T00:00:00Z" } = {}) {
  const wallet = signer || ethers.Wallet.createRandom();
  const issuerAddress = issuer || wallet.address;
  const signature = await wallet.signMessage(controlMessage(DOMAIN, issuerAddress));

  const bundle = {
    domain: DOMAIN,
    observedAt: Math.floor(Date.now() / 1000),
    resolvers: ["1.1.1.1"],
    dns: {
      txt: { ok: true, records: txtPresent ? [expectedRecord(signature), "v=spf1 -all"] : ["v=spf1 -all"] },
      ns: { ok: true, nameservers: ["ns1.example.net"] },
    },
    rdap: { ok: true, status: 200, expiration, status_flags: ["client transfer prohibited"] },
    http: { ok: true, status: 200 },
  };

  return { bundle, signature, issuerAddress };
}

describe("evidence hashing", function () {
  it("is independent of key insertion order", function () {
    const a = { b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } };
    const b = { a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 };
    expect(canonicalize(a)).to.equal(canonicalize(b));
    expect(evidenceHash(a)).to.equal(evidenceHash(b));
  });

  it("changes when any raw response changes", function () {
    const base = { dns: { txt: ["a"] } };
    const altered = { dns: { txt: ["b"] } };
    expect(evidenceHash(base)).to.not.equal(evidenceHash(altered));
  });
});

describe("deterministic evaluation", function () {
  it("passes when the record is present, signed by the issuer, and unexpired", async function () {
    const { bundle, signature, issuerAddress } = await fixture();
    const v = evaluate(bundle, { issuer: issuerAddress, expectedSignature: signature });
    expect(v.ok).to.equal(true);
    expect(v.reasons).to.deep.equal([]);
  });

  it("fails the moment the TXT record is removed", async function () {
    const { bundle, signature, issuerAddress } = await fixture({ txtPresent: false });
    const v = evaluate(bundle, { issuer: issuerAddress, expectedSignature: signature });
    expect(v.ok).to.equal(false);
    expect(v.reasons.join()).to.contain("absent");
  });

  it("rejects a record signed by a wallet that is not the issuer", async function () {
    const impostor = ethers.Wallet.createRandom();
    const realIssuer = ethers.Wallet.createRandom().address;
    const { bundle, signature } = await fixture({ signer: impostor, issuer: impostor.address });
    const v = evaluate(bundle, { issuer: realIssuer, expectedSignature: signature });
    expect(v.ok).to.equal(false);
  });

  it("fails on an expired registration even with a valid control record", async function () {
    const { bundle, signature, issuerAddress } = await fixture({ expiration: "2020-01-01T00:00:00Z" });
    const v = evaluate(bundle, { issuer: issuerAddress, expectedSignature: signature });
    expect(v.ok).to.equal(false);
    expect(v.reasons.join()).to.contain("expired");
  });

  it("fails closed when RDAP is unreachable", async function () {
    const { bundle, signature, issuerAddress } = await fixture();
    bundle.rdap = { ok: false, error: "timeout" };
    const v = evaluate(bundle, { issuer: issuerAddress, expectedSignature: signature });
    expect(v.ok).to.equal(false);
  });

  it("does not decide on ambiguous signals — those are judgments, not facts", async function () {
    const { bundle, signature, issuerAddress } = await fixture();
    // Nameservers changed and the site now redirects elsewhere. Both are recorded in the
    // bundle for the break proposer to weigh; neither stops a valid proof.
    bundle.dns.ns.nameservers = ["ns1.somewhere-else.net"];
    bundle.http = { ok: true, status: 302, location: "https://parked.example" };
    const v = evaluate(bundle, { issuer: issuerAddress, expectedSignature: signature });
    expect(v.ok).to.equal(true);
  });
});
