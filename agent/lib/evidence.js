const dns = require("node:dns");
const { ethers } = require("ethers");
const { evidenceHash } = require("./canonical");

// Pinned resolvers rather than whatever the host machine is configured with, so the
// evidence a third party reproduces is the evidence we saw.
const RESOLVERS = ["1.1.1.1", "8.8.8.8"];
const TXT_PREFIX = "ember=";
// Measured 2026-08-24: rdap.org's redirect chain alone can take ~6.4s, which was flapping
// assets to Stale on marginal timing rather than genuine unavailability. 8s left almost no
// margin; 15s gives real-world RDAP latency room without weakening fail-closed behavior --
// a request that's actually down still times out and still produces Stale, correctly.
const HTTP_TIMEOUT_MS = 15000;

function resolver() {
  const r = new dns.promises.Resolver({ timeout: 5000, tries: 2 });
  r.setServers(RESOLVERS);
  return r;
}

/// The control record an owner publishes. Signed by the issuer wallet over the domain it
/// is claiming, so the record proves both "this wallet asked for it" and "whoever holds
/// this zone put it there". A judge can verify it with `dig TXT` and ethers.verifyMessage,
/// without our software in the loop.
function controlMessage(domain, issuer) {
  return `ember:${domain.toLowerCase()}:${issuer.toLowerCase()}`;
}

function expectedRecord(signature) {
  return `${TXT_PREFIX}${signature}`;
}

async function readTxt(domain) {
  try {
    // Each TXT record arrives as an array of ≤255-byte chunks; joining is part of the
    // protocol, not a transformation of the evidence.
    const records = await resolver().resolveTxt(domain);
    return { ok: true, records: records.map((chunks) => chunks.join("")) };
  } catch (e) {
    return { ok: false, error: e.code || String(e.message), records: [] };
  }
}

async function readNs(domain) {
  try {
    const ns = await resolver().resolveNs(domain);
    return { ok: true, nameservers: ns.map((n) => n.toLowerCase()).sort() };
  } catch (e) {
    return { ok: false, error: e.code || String(e.message), nameservers: [] };
  }
}

async function readRdap(domain) {
  const url = `https://rdap.org/domain/${encodeURIComponent(domain)}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/rdap+json" },
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, status: res.status, url };

    const body = await res.json();
    const events = (body.events || []).map((e) => ({
      action: e.eventAction,
      date: e.eventDate,
    }));
    const expiration = events.find((e) => e.action === "expiration")?.date || null;
    return {
      ok: true,
      status: res.status,
      url,
      handle: body.handle || null,
      status_flags: (body.status || []).slice().sort(),
      events,
      expiration,
    };
  } catch (e) {
    return { ok: false, url, error: String(e.message) };
  }
}

async function readHttp(domain) {
  const url = `https://${domain}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal, redirect: "manual" });
    clearTimeout(timer);
    return {
      ok: true,
      url,
      status: res.status,
      location: res.headers.get("location") || null,
      server: res.headers.get("server") || null,
      contentType: res.headers.get("content-type") || null,
    };
  } catch (e) {
    // An unreachable site is a fact, not an error. It feeds the break judgment; it does
    // not on its own stop the asset from being verified as owned.
    return { ok: false, url, error: String(e.message) };
  }
}

/// Collects everything, in parallel, and returns the raw bundle plus its digest.
///
/// `readers` is injectable so an end-to-end harness can drive the real bundle assembly,
/// hashing and evaluation against a controlled zone — the only way to test "the operator
/// deleted the TXT record" without deleting a real one.
/// `nowSec` lets the caller supply the clock. The proof cycle passes chain time, because
/// the verifier validates `observedAt` against `block.timestamp` — see cycle.js.
async function collect(domain, readers = {}, nowSec) {
  const r = { readTxt, readNs, readRdap, readHttp, ...readers };
  const observedAt = nowSec ?? Math.floor(Date.now() / 1000);
  const [txt, ns, rdap, http] = await Promise.all([
    r.readTxt(domain),
    r.readNs(domain),
    r.readRdap(domain),
    r.readHttp(domain),
  ]);

  const bundle = {
    domain: domain.toLowerCase(),
    observedAt,
    resolvers: RESOLVERS,
    dns: { txt, ns },
    rdap,
    http,
  };

  return { bundle, hash: evidenceHash(bundle), observedAt };
}

/// Deterministic evaluation. No model, no judgment, no discretion — this decides only
/// whether a valid proof exists, and a proof either exists or it does not.
///
/// Anything ambiguous (nameservers moved, site now redirects elsewhere, content changed
/// character) is deliberately NOT decided here. Those facts are recorded in the bundle
/// for the break proposer to weigh, because they are judgments and judgments never
/// travel down the fast path.
function evaluate(bundle, { issuer, expectedSignature }) {
  const reasons = [];
  let present = false;
  let signerMatches = false;
  let signature = null;

  if (expectedSignature) {
    // A signature is already known — e.g. from `npm run prove`. Check for that exact record.
    present = bundle.dns.txt.records.includes(expectedRecord(expectedSignature));
    if (!present) reasons.push("control TXT record absent");
    if (present) {
      try {
        const recovered = ethers.verifyMessage(
          controlMessage(bundle.domain, issuer),
          expectedSignature
        );
        signerMatches = recovered.toLowerCase() === issuer.toLowerCase();
        signature = signerMatches ? expectedSignature : null;
        if (!signerMatches) reasons.push(`TXT signature recovers to ${recovered}, not the issuer`);
      } catch (e) {
        reasons.push(`TXT signature malformed: ${e.message}`);
      }
    }
  } else {
    // Self-serve path: no signature known ahead of time, e.g. an asset registered through
    // the site rather than the CLI. Any ember= TXT record that recovers to the on-chain
    // issuer proves control — the same check a third party can run by hand with `dig` and
    // `ethers.verifyMessage`, just without a pre-shared expectation to compare against.
    const candidates = bundle.dns.txt.records.filter((r) => r.startsWith(TXT_PREFIX));
    if (candidates.length === 0) reasons.push("control TXT record absent");
    for (const record of candidates) {
      const candidateSig = record.slice(TXT_PREFIX.length);
      try {
        const recovered = ethers.verifyMessage(controlMessage(bundle.domain, issuer), candidateSig);
        if (recovered.toLowerCase() === issuer.toLowerCase()) {
          present = true;
          signerMatches = true;
          signature = candidateSig;
          break;
        }
      } catch {
        // Not a valid signature — try the next TXT record, if any.
      }
    }
    if (candidates.length > 0 && !signerMatches) {
      reasons.push("no ember= TXT record recovers to the on-chain issuer");
    }
  }

  let notExpired = false;
  if (!bundle.rdap.ok) {
    reasons.push("RDAP unavailable");
  } else if (!bundle.rdap.expiration) {
    reasons.push("RDAP reports no expiration date");
  } else {
    notExpired = Date.parse(bundle.rdap.expiration) > Date.now();
    if (!notExpired) reasons.push(`registration expired ${bundle.rdap.expiration}`);
  }

  return { ok: present && signerMatches && notExpired, reasons, signature };
}

module.exports = { collect, evaluate, controlMessage, expectedRecord, TXT_PREFIX };
