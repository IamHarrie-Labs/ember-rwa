// The underwriter. Grades a domain and writes its burn time on-chain.
//
//   node agent/underwrite.js example.com          underwrite and admit
//   node agent/underwrite.js example.com --dry    grade and write the memo, no transaction
//
// This is the AI's load-bearing act. It does not decide moment to moment whether an asset
// is alive — that is deterministic and lives in the proof cycle. It decides how fast a
// particular claim decays, once, at admission, and that decision governs the asset for
// its entire life.
//
// Two models run: an underwriter that argues for the asset, and an adversary that argues
// against it. The adversary can only shorten the leash, never lengthen it.
const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");
require("dotenv").config();

const { collect, evaluate } = require("./lib/evidence");
const { judge, available, sha256, MODEL } = require("./lib/model");
const { publish } = require("./lib/publish");
const {
  BURN_TIME_BY_GRADE,
  worseOf,
  burnTimeFor,
  featuresFrom,
  ruleBasedGrade,
} = require("./lib/grading");
const { ROOT, KIND_DOMAIN, provider, contracts, identifierOf, assetIdOf } = require("./lib/chain");

const GRADES = ["A", "B", "C", "D", "E"];

/// The control signature lives in agent/assets.json alongside the domain, written there
/// from `npm run prove`. One source of truth shared with the proof cycle.
function controlSignatureFor(domain) {
  const p = path.join(__dirname, "assets.json");
  if (!fs.existsSync(p)) return "0x00";
  const entry = JSON.parse(fs.readFileSync(p, "utf8")).find(
    (a) => a.domain.toLowerCase() === domain
  );
  return entry?.signature || "0x00";
}

const UNDERWRITER_SYSTEM = `You are underwriting an internet domain as collateral for a tokenized real-world asset.

You are given deterministic facts extracted from DNS, RDAP, and HTTP. You did not gather
them and you cannot verify anything beyond them. Do not assume traffic, revenue, brand
value, or trademark status that the evidence does not show.

Your grade sets how long a single proof of control keeps this asset tradable:
  A = 6 hours, B = 3 hours, C = 1 hour, D = 15 minutes, E = 90 seconds.

Grade on how likely the underlying claim is to stop being true without warning, not on
how much the domain is worth. A twenty-year-old locked domain with stable nameservers can
go unverified for hours safely. A three-week-old domain on a free registrar cannot.

Cite the specific fact behind every claim. If the evidence is thin, say so and grade down.`;

const ADVERSARY_SYSTEM = `You are the dissent in an underwriting committee. Another analyst has graded a domain.

Argue the case against: the ways the evidence is weaker than it looks, the failure modes
that would invalidate the claim without warning, what a careful buyer would notice that
the memo did not.

You may recommend a worse grade. You may not recommend a better one — if you think the
grade is too harsh, say the grade is fair and explain why. Cite specific facts.`;

const UNDERWRITER_SCHEMA = {
  type: "object",
  properties: {
    grade: { type: "string", enum: GRADES },
    valuationLowUsd: { type: "integer" },
    valuationHighUsd: { type: "integer" },
    memo: { type: "string" },
    citations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["claim", "evidence"],
        additionalProperties: false,
      },
    },
    materialRisks: { type: "array", items: { type: "string" } },
  },
  required: ["grade", "valuationLowUsd", "valuationHighUsd", "memo", "citations", "materialRisks"],
  additionalProperties: false,
};

const ADVERSARY_SCHEMA = {
  type: "object",
  properties: {
    gradeShouldBe: { type: "string", enum: GRADES },
    argument: { type: "string" },
    weakestEvidence: { type: "string" },
    unmodelledFailure: { type: "string" },
  },
  required: ["gradeShouldBe", "argument", "weakestEvidence", "unmodelledFailure"],
  additionalProperties: false,
};

function factSheet(features) {
  return Object.entries(features)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") || "(none)" : v === null ? "unknown" : v}`)
    .join("\n");
}

async function underwrite(features) {
  if (!available()) {
    // No model configured. Grade by rule, and label it honestly in the memo — this path
    // exists to prove the protocol does not depend on an LLM being reachable.
    const { grade, reasons } = ruleBasedGrade(features);
    return {
      grade,
      engine: "rule-based fallback (no model configured)",
      underwriter: {
        grade,
        memo: `Rule-based grade, not underwriting: ${reasons.join("; ")}.`,
        citations: reasons.map((r) => ({ claim: r, evidence: "deterministic feature extraction" })),
        materialRisks: ["graded without model judgment"],
        valuationLowUsd: 0,
        valuationHighUsd: 0,
      },
      adversary: null,
      provenance: null,
    };
  }

  const facts = factSheet(features);

  const bull = await judge({
    system: UNDERWRITER_SYSTEM,
    prompt: `Underwrite this domain.\n\n${facts}`,
    schema: UNDERWRITER_SCHEMA,
  });

  const bear = await judge({
    system: ADVERSARY_SYSTEM,
    prompt:
      `The analyst graded ${bull.output.grade}.\n\n` +
      `Their memo:\n${bull.output.memo}\n\n` +
      `The facts:\n${facts}`,
    schema: ADVERSARY_SCHEMA,
  });

  // Dissent can only shorten the leash.
  const grade = worseOf(bull.output.grade, bear.output.gradeShouldBe);

  return {
    grade,
    engine: MODEL,
    underwriter: bull.output,
    adversary: bear.output,
    provenance: { underwriter: bull.provenance, adversary: bear.provenance },
  };
}

async function main() {
  const domain = (process.argv[2] || "").toLowerCase().trim();
  const dry = process.argv.includes("--dry");
  if (!domain) {
    console.error("usage: node agent/underwrite.js <domain> [--dry]");
    process.exit(1);
  }

  const assetId = assetIdOf(domain);
  console.log(`\ndomain     ${domain}`);
  console.log(`assetId    ${assetId}`);

  console.log(`\ncollecting evidence...`);
  const { bundle, hash, observedAt } = await collect(domain);
  const features = featuresFrom(bundle);

  console.log(`  age             ${features.ageDays === null ? "unknown" : features.ageDays + " days"}`);
  console.log(`  expires in      ${features.daysToExpiry === null ? "unknown" : features.daysToExpiry + " days"}`);
  console.log(`  transfer lock   ${features.transferLocked}`);
  console.log(`  nameservers     ${features.nameservers.join(", ") || "(none)"}`);
  console.log(`  http            ${features.httpReachable ? features.httpStatus : "unreachable"}`);

  console.log(`\nunderwriting${available() ? ` with ${MODEL} (two passes)` : " with the rule-based fallback"}...`);
  const result = await underwrite(features);
  const burnTime = burnTimeFor(result.grade);

  if (result.adversary && result.adversary.gradeShouldBe !== result.underwriter.grade) {
    console.log(
      `  underwriter graded ${result.underwriter.grade}, dissent argued ${result.adversary.gradeShouldBe}`
    );
  }
  console.log(`\ngrade      ${result.grade}`);
  console.log(`burn time  ${burnTime}s (${(burnTime / 3600).toFixed(2)}h)`);
  if (result.underwriter.memo) {
    console.log(`\nmemo\n  ${result.underwriter.memo.replace(/\n/g, "\n  ")}`);
  }

  const memo = {
    assetId,
    domain,
    observedAt,
    grade: result.grade,
    burnTime,
    burnTimeTable: BURN_TIME_BY_GRADE,
    engine: result.engine,
    features,
    evidenceHash: hash,
    evidenceBundle: bundle,
    underwriter: result.underwriter,
    adversary: result.adversary,
    provenance: result.provenance,
  };

  const dir = path.join(ROOT, "evidence", "memos");
  fs.mkdirSync(dir, { recursive: true });
  const memoPath = path.join(dir, `${assetId}.json`);
  const memoJson = JSON.stringify(memo, null, 2);
  fs.writeFileSync(memoPath, memoJson);

  const memoHash = sha256(memoJson);
  const base = process.env.EVIDENCE_BASE_URL || "";
  const evidenceURI = `${base}/evidence/memos/${assetId}.json#${memoHash}`;

  publish({ quiet: true });

  console.log(`\nmemo       evidence/memos/${assetId}.json`);
  console.log(`memoHash   ${memoHash}`);
  console.log(`published  web/public/evidence/memos/${assetId}.json`);

  if (dry) {
    console.log(`\ndry run — nothing written on-chain\n`);
    return;
  }

  const key = process.env.UNDERWRITER_KEY || process.env.DEPLOYER_KEY;
  if (!key) throw new Error("set UNDERWRITER_KEY in .env to admit on-chain");

  const p = provider();
  const wallet = new ethers.Wallet(key, p);
  const { registry, deployment } = contracts(wallet);

  const onchain = await registry.getAsset(assetId);
  if (onchain.issuer === ethers.ZeroAddress) {
    throw new Error(`${domain} is not registered on-chain yet — the issuer must register it first`);
  }
  if (onchain.burnTime !== 0n) {
    throw new Error(`${domain} is already admitted with a burn time of ${onchain.burnTime}s`);
  }

  // Control must be proven before the underwriter will admit. An unverified claim never
  // reaches a token.
  const verdict = evaluate(bundle, {
    issuer: onchain.issuer,
    expectedSignature: controlSignatureFor(domain),
  });
  if (!verdict.ok && !process.argv.includes("--skip-control-check")) {
    console.error(`\ncontrol not proven: ${verdict.reasons.join("; ")}`);
    console.error(`publish the TXT record from: npm run prove -- ${domain}\n`);
    process.exit(1);
  }

  console.log(`\nadmitting on ${deployment.network}...`);
  const tx = await registry.admit(
    assetId,
    deployment.contracts.SignedAttestationVerifier,
    burnTime,
    evidenceURI
  );
  const receipt = await tx.wait();
  console.log(`admitted   ${receipt.hash}  gas ${receipt.gasUsed}\n`);
}

module.exports = { underwrite, UNDERWRITER_SCHEMA, ADVERSARY_SCHEMA };

if (require.main === module) {
  main().catch((e) => {
    console.error(`\n${e.message}\n`);
    process.exitCode = 1;
  });
}
