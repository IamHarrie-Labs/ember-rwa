// The proof cycle. Feeds the embers.
//
//   node agent/cycle.js            run continuously
//   node agent/cycle.js --once     one pass, then exit
//   node agent/cycle.js --dry      collect and evaluate, write nothing on-chain
//
// What this process can and cannot do is the point of the design. It can produce fresh
// proofs, which keep assets tradable. It cannot freeze anything, cannot extend a clock,
// and cannot assert liveness it did not observe. If it dies, every asset it was feeding
// goes out on schedule — the failure mode is refusing to assert, never asserting falsely.
const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");
require("dotenv").config();

const { collect, evaluate } = require("./lib/evidence");
const { publish } = require("./lib/publish");
const {
  ROOT,
  STATE,
  provider,
  signerWallet,
  contracts,
  signObservation,
  identifierOf,
  assetIdOf,
  discoverDomains,
} = require("./lib/chain");

const ONCE = process.argv.includes("--once");
const DRY = process.argv.includes("--dry");
const POLL_MS = Number(process.env.CYCLE_INTERVAL_SECONDS || 30) * 1000;

// Resolved per call so an end-to-end harness can redirect the record to a temp directory
// instead of appending test rows to the real history.
const evidenceDir = () => process.env.EVIDENCE_DIR || path.join(ROOT, "evidence");
/// Scoped per network — mainnet and testnet attestations must never land in the same
/// history file, or the published cycle-health stats silently mix real and test activity.
const historyFile = () => `history.${process.env.NETWORK || "botchain"}.jsonl`;

/// Static file for CLI-onboarded demo assets, merged with whatever the registry itself
/// reveals about self-serve ones (see discoverDomains). Neither list on its own is
/// complete: the file predates the on-chain convention, and the chain never stores a
/// domain string for anything registered before that convention existed.
async function loadAssets(registry) {
  const p = path.join(__dirname, "assets.json");
  const fromFile = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : [];
  const discovered = await discoverDomains(registry);

  const seen = new Set(fromFile.map((a) => a.domain.toLowerCase()));
  for (const d of discovered) {
    if (!seen.has(d.domain)) {
      fromFile.push({ domain: d.domain });
      seen.add(d.domain);
    }
  }
  return fromFile;
}

function record(entry) {
  fs.mkdirSync(evidenceDir(), { recursive: true });
  fs.appendFileSync(path.join(evidenceDir(), historyFile()), JSON.stringify(entry) + "\n");
}

function saveBundle(assetId, bundle) {
  const dir = path.join(evidenceDir(), "bundles", assetId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${bundle.observedAt}.json`), JSON.stringify(bundle, null, 2));
}

const ts = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (...a) => console.log(`[${ts()}]`, ...a);

/// An asset is due once it is past half its burn time. Feeding earlier wastes gas and
/// earns no relay reward; feeding later risks a missed cycle taking it out entirely.
function isDue(nowSec, lastAttestedAt, burnTime) {
  return nowSec - Number(lastAttestedAt) > Number(burnTime) / 2;
}

async function pass(ctx) {
  const { registry, verifierAddress, wallet, chainId, assets } = ctx;
  // Both injectable: a harness drives a controlled zone and a controlled clock, because
  // "the operator deleted the TXT record three minutes ago" is otherwise untestable.
  const gather = ctx.collect || collect;
  const nowSec = ctx.nowSec ? ctx.nowSec() : Math.floor(Date.now() / 1000);

  // The verifier checks observedAt against block.timestamp, so the chain's clock is the
  // authority. Signing observations from an unsynced local clock produces proofs rejected
  // as too old or too far in the future — which on the dashboard is indistinguishable from
  // an asset genuinely going bad. Read the chain's time once per pass and observe against
  // that instead.
  let chainSec = nowSec;
  try {
    const provider = ctx.provider || registry.runner?.provider;
    const block = provider && (await provider.getBlock("latest"));
    if (block) {
      chainSec = block.timestamp;
      const skew = Math.abs(Math.floor(Date.now() / 1000) - chainSec);
      if (skew > 30) {
        log(`! local clock is ${skew}s from chain time — observing against chain time`);
      }
    }
  } catch (e) {
    log(`! could not read chain time (${e.shortMessage || e.message}) — using local clock`);
  }

  const batch = [];
  const skipped = [];

  for (const entry of assets) {
    const domain = entry.domain.toLowerCase();
    const assetId = assetIdOf(domain);

    let onchain;
    try {
      onchain = await registry.getAsset(assetId);
    } catch (e) {
      log(`! ${domain}  registry read failed: ${e.message}`);
      continue;
    }

    if (onchain.issuer === ethers.ZeroAddress) {
      log(`- ${domain}  not registered on-chain, skipping`);
      continue;
    }
    if (onchain.burnTime === 0n) {
      log(`- ${domain}  registered but not yet admitted by the underwriter`);
      continue;
    }

    const state = STATE[Number(await registry.stateOf(assetId))];
    const remaining = Number(await registry.timeRemaining(assetId));
    const due = isDue(nowSec, onchain.lastAttestedAt, onchain.burnTime);

    if (!due) {
      log(`  ${domain}  ${state}  ${remaining}s left  (not due)`);
      continue;
    }

    const { bundle, hash, observedAt } = await gather(domain, chainSec);
    saveBundle(assetId, bundle);

    // No expectedSignature: this recovers the signer from whatever ember= TXT record is
    // actually published and checks it against the on-chain issuer, so it works the same
    // way whether the asset was onboarded via the CLI or registered by a stranger's wallet.
    const verdict = evaluate(bundle, { issuer: onchain.issuer });

    if (!verdict.ok) {
      // Deliberately silent on-chain. We do not write a negative; we simply stop writing,
      // and the asset goes out on its own schedule. That is the whole mechanism.
      log(`✕ ${domain}  ${state}  evidence failed: ${verdict.reasons.join("; ")}`);
      skipped.push({ domain, assetId, reasons: verdict.reasons, evidenceHash: hash });
      record({
        at: new Date().toISOString(),
        domain,
        assetId,
        event: "evidence_failed",
        reasons: verdict.reasons,
        evidenceHash: hash,
        observedAt,
      });
      continue;
    }

    const proof = await signObservation(wallet, verifierAddress, chainId, {
      assetId,
      identifier: identifierOf(domain),
      ok: true,
      observedAt,
      evidenceHash: hash,
    });

    batch.push({ domain, assetId, proof, evidenceHash: hash, observedAt, state, remaining });
  }

  if (batch.length === 0) {
    if (skipped.length > 0) log(`nothing submitted — ${skipped.length} asset(s) failing evidence`);
    return;
  }

  const names = batch.map((b) => b.domain).join(", ");
  if (DRY) {
    log(`~ dry run, would attest ${batch.length}: ${names}`);
    for (const b of batch) log(`    ${b.domain} evidence ${b.evidenceHash}`);
    return;
  }

  try {
    await submit(registry, batch);
  } catch (e) {
    if (batch.length === 1) {
      recordSubmissionFailure(batch, e);
      log(`! submission failed: ${e.shortMessage || e.message}`);
      return;
    }

    // attestMany is atomic, so one unusable proof — a repeated observedAt after a retry, a
    // skewed clock, an asset admitted moments ago — would otherwise starve every other
    // asset in the cycle. Fall back to feeding them one at a time: the bad asset fails
    // alone and goes out honestly, the rest keep burning.
    log(`! batch of ${batch.length} reverted (${e.shortMessage || e.message}) — retrying singly`);
    recordSubmissionFailure(batch, e, "batch_failed");

    for (const b of batch) {
      try {
        await submit(registry, [b]);
      } catch (inner) {
        recordSubmissionFailure([b], inner);
        log(`  ! ${b.domain} failed alone: ${inner.shortMessage || inner.message}`);
      }
    }
  }
}

async function submit(registry, batch) {
  const tx =
    batch.length === 1
      ? await registry.attest(batch[0].assetId, batch[0].proof)
      : await registry.attestMany(
          batch.map((b) => b.assetId),
          batch.map((b) => b.proof)
        );
  const receipt = await tx.wait();

  log(
    `✓ fed ${batch.length} (${batch.map((b) => b.domain).join(", ")})  gas ${receipt.gasUsed}  ` +
      `${ethers.formatEther(receipt.gasUsed * receipt.gasPrice)} BOT  ${receipt.hash}`
  );

  for (const b of batch) {
    record({
      at: new Date().toISOString(),
      domain: b.domain,
      assetId: b.assetId,
      event: "attested",
      observedAt: b.observedAt,
      evidenceHash: b.evidenceHash,
      txHash: receipt.hash,
      block: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      batchSize: batch.length,
    });
  }
  return receipt;
}

/// A failed submission is not a failed asset. The evidence was good; the write was not.
/// The next pass retries, and if writes keep failing the assets go out honestly.
function recordSubmissionFailure(batch, e, event = "submission_failed") {
  record({
    at: new Date().toISOString(),
    event,
    error: e.shortMessage || e.message,
    assets: batch.map((b) => b.domain),
  });
}

/// This process is meant to run unattended for days. Every failure inside a pass — a bad
/// RDAP response, a reverted batch, chain-time drift — is already caught and logged at the
/// point it happens, by design (see the header comment). But a stray TCP reset on a kept-
/// alive socket lands as an uncaught exception *outside* any of those awaits, on Node's own
/// event loop, and kills the whole process before it can even log why. Log it and keep
/// running instead: a crashed cycle silently stops feeding every asset it holds, which is a
/// worse failure than the network blip that caused it.
function surviveTransientErrors() {
  const survive = (kind) => (err) => {
    log(`! ${kind}: ${err?.code || err?.message || err} — cycle continues`);
  };
  process.on("uncaughtException", survive("uncaught exception"));
  process.on("unhandledRejection", survive("unhandled rejection"));
}

async function main() {
  surviveTransientErrors();
  const p = provider();
  const wallet = signerWallet(p);
  const { registry, verifierAddress, deployment } = contracts(wallet);
  const net = await p.getNetwork();
  const assets = await loadAssets(registry);

  log(`network    ${net.name} (chainId ${net.chainId})`);
  log(`registry   ${deployment.contracts.EmberRegistry}`);
  log(`verifier   ${verifierAddress}`);
  log(`signer     ${wallet.address}`);
  log(`balance    ${ethers.formatEther(await p.getBalance(wallet.address))} BOT`);
  log(`tracking   ${assets.map((a) => a.domain).join(", ")}`);
  log(`poll       every ${POLL_MS / 1000}s${DRY ? "  (dry run)" : ""}`);
  console.log("");

  const ctx = { registry, verifierAddress, wallet, chainId: net.chainId, assets };

  await pass(ctx);
  publish({ quiet: true });
  if (ONCE) return;

  // Fixed interval rather than setInterval so a slow pass cannot overlap the next one.
  for (;;) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    try {
      // Re-discovered every pass so an asset registered through the site gets fed on the
      // next cycle rather than requiring a process restart.
      ctx.assets = await loadAssets(registry);
      await pass(ctx);
      // Republish every pass so the site's timeline and cycle health track the record
      // rather than the last deploy.
      publish({ quiet: true });
    } catch (e) {
      log(`! pass failed: ${e.message}`);
    }
  }
}

module.exports = { pass, isDue };

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
