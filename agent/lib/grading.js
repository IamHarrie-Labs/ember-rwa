// Pure grading logic. No network, no model, no chain — so it is testable, and so a
// reader can check the part of underwriting that is NOT judgment.
//
// The model produces a grade. This table turns a grade into seconds. The mapping is
// deterministic and published, which is what keeps "AI sets the burn time" from meaning
// "an LLM can pick an arbitrary number and write it on-chain."

/// Grade -> how long one proof carries the asset, in seconds.
const BURN_TIME_BY_GRADE = {
  A: 21600, // 6h  — long history, locked, stable operation
  B: 10800, // 3h
  C: 3600, // 1h
  D: 900, // 15m
  E: 90, // 90s — no history, nothing trusted for long
};

const GRADE_ORDER = ["A", "B", "C", "D", "E"];

/// The adversarial critique can shorten an asset's leash, never lengthen it.
/// A dissent that could raise the grade would just be a second opinion; a dissent that
/// can only lower it is a safety property.
function worseOf(a, b) {
  if (!GRADE_ORDER.includes(a)) throw new Error(`unknown grade ${a}`);
  if (!GRADE_ORDER.includes(b)) return a;
  return GRADE_ORDER.indexOf(a) >= GRADE_ORDER.indexOf(b) ? a : b;
}

function burnTimeFor(grade) {
  const t = BURN_TIME_BY_GRADE[grade];
  if (!t) throw new Error(`unknown grade ${grade}`);
  return t;
}

const DAY = 86400000;

/// Deterministic feature extraction from an evidence bundle. These are facts; the model
/// reads them but does not produce them, so its memo can be checked against them.
function featuresFrom(bundle) {
  const now = Date.now();
  const events = (bundle.rdap && bundle.rdap.events) || [];
  const at = (action) => {
    const e = events.find((x) => x.action === action);
    return e && Date.parse(e.date) ? Date.parse(e.date) : null;
  };

  const registered = at("registration");
  const expiration = bundle.rdap && bundle.rdap.expiration ? Date.parse(bundle.rdap.expiration) : null;
  const label = bundle.domain.split(".")[0] || "";
  const tld = bundle.domain.slice(bundle.domain.indexOf(".") + 1);
  const flags = (bundle.rdap && bundle.rdap.status_flags) || [];

  return {
    domain: bundle.domain,
    tld,
    labelLength: label.length,
    ageDays: registered === null ? null : Math.floor((now - registered) / DAY),
    daysToExpiry: expiration === null ? null : Math.floor((expiration - now) / DAY),
    transferLocked: flags.some((f) => /transfer prohibited/i.test(f)),
    deleteLocked: flags.some((f) => /delete prohibited/i.test(f)),
    pendingTransfer: flags.some((f) => /pending/i.test(f)),
    nameservers: (bundle.dns && bundle.dns.ns && bundle.dns.ns.nameservers) || [],
    httpReachable: !!(bundle.http && bundle.http.ok),
    httpStatus: (bundle.http && bundle.http.status) || null,
    redirectsTo: (bundle.http && bundle.http.location) || null,
    txtRecordCount: (bundle.dns && bundle.dns.txt && bundle.dns.txt.records.length) || 0,
  };
}

/// Used when no model is configured. The protocol has to survive without AI — if it
/// doesn't, the AI isn't a component, it's a dependency. This is deliberately blunt and
/// labelled as such in the memo, so nobody mistakes it for underwriting.
function ruleBasedGrade(f) {
  const reasons = [];
  let grade = "C";

  if (f.ageDays === null) {
    reasons.push("no registration date in RDAP");
    grade = "E";
  } else if (f.ageDays > 3650) {
    reasons.push(`registered ${Math.floor(f.ageDays / 365)} years ago`);
    grade = "A";
  } else if (f.ageDays > 1095) {
    reasons.push(`registered ${Math.floor(f.ageDays / 365)} years ago`);
    grade = "B";
  } else if (f.ageDays > 365) {
    reasons.push("registered over a year ago");
    grade = "C";
  } else {
    reasons.push(`registered ${f.ageDays} days ago`);
    grade = "D";
  }

  if (f.daysToExpiry !== null && f.daysToExpiry < 30) {
    reasons.push(`expires in ${f.daysToExpiry} days`);
    grade = worseOf(grade, "E");
  }
  if (!f.transferLocked) {
    reasons.push("no registrar transfer lock");
    grade = worseOf(grade, "D");
  }
  if (f.pendingTransfer) {
    reasons.push("registry reports a pending status");
    grade = worseOf(grade, "E");
  }
  if (!f.httpReachable) {
    reasons.push("no reachable site");
    grade = worseOf(grade, "D");
  }

  return { grade, reasons };
}

module.exports = {
  BURN_TIME_BY_GRADE,
  GRADE_ORDER,
  worseOf,
  burnTimeFor,
  featuresFrom,
  ruleBasedGrade,
};
