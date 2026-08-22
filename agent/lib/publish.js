// Publishes the agent's evidence into web/public/evidence so the site can read it.
//
// The chain holds keccak(domain) and a burn time. Everything a reader needs to *check* that
// — the plaintext domain, the underwriting memo, the dissent, the model provenance, and the
// per-attestation history with its transaction hashes — lives off-chain in files this agent
// writes. Publishing them is what turns "trust the dashboard" into "here is the record, and
// every row links to the explorer".
//
// Static files rather than an API: the site is deployed to Vercel where no agent process
// exists, and a static index is also the artifact a judge can curl directly.
const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("./chain");

// Resolved per call rather than at import so a test can redirect both without touching the
// repo's real evidence directory or the committed site data.
const evidenceDir = () => process.env.EVIDENCE_DIR || path.join(ROOT, "evidence");
const outDir = () => process.env.EVIDENCE_OUT || path.join(ROOT, "web", "public", "evidence");
/// Scoped per network — mainnet and testnet attestations must never land in the same
/// history file, or the published cycle-health stats silently mix real and test activity.
const historyFile = () => `history.${process.env.NETWORK || "botchain"}.jsonl`;

/// Keep the published history bounded — the site renders a timeline, not an archive.
const MAX_ROWS_PER_ASSET = 40;
const DAY_MS = 86400000;

function readHistory() {
  const p = path.join(evidenceDir(), historyFile());
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function readMemos() {
  const dir = path.join(evidenceDir(), "memos");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/// Gas is recorded once per asset per batch, so the same transaction appears on several
/// rows. Summing naively would multiply a batched cycle's cost by its batch size.
function gasInWindow(rows, sinceMs) {
  const seen = new Set();
  let total = 0n;
  for (const r of rows) {
    if (r.event !== "attested" || !r.txHash || !r.gasUsed) continue;
    if (Date.parse(r.at) < sinceMs) continue;
    if (seen.has(r.txHash)) continue;
    seen.add(r.txHash);
    total += BigInt(r.gasUsed);
  }
  return { gas: total.toString(), transactions: seen.size };
}

function publish({ quiet = false } = {}) {
  const rows = readHistory();
  const memos = readMemos();

  fs.mkdirSync(path.join(outDir(), "memos"), { recursive: true });
  fs.mkdirSync(path.join(outDir(), "history"), { recursive: true });

  const assets = {};

  for (const memo of memos) {
    if (!memo.assetId) continue;
    fs.writeFileSync(
      path.join(outDir(), "memos", `${memo.assetId}.json`),
      JSON.stringify(memo, null, 2)
    );
    assets[memo.assetId] = {
      domain: memo.domain,
      grade: memo.grade,
      burnTime: memo.burnTime,
      engine: memo.engine,
      evidenceHash: memo.evidenceHash,
      memo: `memos/${memo.assetId}.json`,
      history: `history/${memo.assetId}.json`,
      attestations: 0,
      lastAttestAt: null,
    };
  }

  // Newest first — the timeline reads top-down from "just now".
  const byAsset = {};
  for (const r of rows) {
    if (!r.assetId) continue;
    (byAsset[r.assetId] ||= []).push(r);
  }

  for (const [assetId, list] of Object.entries(byAsset)) {
    const sorted = [...list].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const attested = sorted.filter((r) => r.event === "attested");

    const timeline = sorted.slice(0, MAX_ROWS_PER_ASSET).map((r) => ({
      at: r.at,
      observedAt: r.observedAt ?? null,
      // A failed check writes nothing on-chain. Showing it is the point: the gap in the
      // record is what makes the asset go out.
      verdict: r.event === "attested" ? "valid" : "no proof",
      reasons: r.reasons ?? null,
      evidenceHash: r.evidenceHash ?? null,
      txHash: r.txHash ?? null,
      block: r.block ?? null,
      gasUsed: r.gasUsed ?? null,
      batchSize: r.batchSize ?? null,
    }));

    fs.writeFileSync(
      path.join(outDir(), "history", `${assetId}.json`),
      JSON.stringify({ assetId, updatedAt: new Date().toISOString(), timeline }, null, 2)
    );

    assets[assetId] ||= {
      domain: list[0]?.domain ?? null,
      memo: null,
      history: `history/${assetId}.json`,
    };
    assets[assetId].attestations = attested.length;
    assets[assetId].lastAttestAt = attested[0]?.at ?? null;
  }

  const attestedRows = rows.filter((r) => r.event === "attested");
  const lastAttest = attestedRows.reduce(
    (acc, r) => (!acc || Date.parse(r.at) > Date.parse(acc) ? r.at : acc),
    null
  );

  const index = {
    updatedAt: new Date().toISOString(),
    cycle: {
      lastAttestAt: lastAttest,
      attestations: new Set(attestedRows.map((r) => r.txHash).filter(Boolean)).size,
      assetAttestations: attestedRows.length,
      failures: rows.filter((r) => r.event === "evidence_failed").length,
      submissionFailures: rows.filter((r) => r.event === "submission_failed").length,
      last24h: gasInWindow(rows, Date.now() - DAY_MS),
    },
    assets,
  };

  fs.writeFileSync(path.join(outDir(), "index.json"), JSON.stringify(index, null, 2));

  if (!quiet) {
    const n = Object.keys(assets).length;
    console.log(
      `published ${n} asset(s), ${index.cycle.assetAttestations} attestation row(s) -> web/public/evidence`
    );
  }
  return index;
}

module.exports = { publish, outDir };

if (require.main === module) publish();
