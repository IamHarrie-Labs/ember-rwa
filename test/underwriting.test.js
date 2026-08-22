const { expect } = require("chai");
const {
  BURN_TIME_BY_GRADE,
  worseOf,
  burnTimeFor,
  featuresFrom,
  ruleBasedGrade,
} = require("../agent/lib/grading");

const DAY = 86400000;
const iso = (msFromNow) => new Date(Date.now() + msFromNow).toISOString();

function bundle(overrides = {}) {
  return {
    domain: "example.com",
    observedAt: Math.floor(Date.now() / 1000),
    dns: {
      txt: { ok: true, records: ["ember=0xabc"] },
      ns: { ok: true, nameservers: ["ns1.cloudflare.com"] },
    },
    rdap: {
      ok: true,
      expiration: iso(400 * DAY),
      status_flags: ["client transfer prohibited", "client delete prohibited"],
      events: [{ action: "registration", date: iso(-4000 * DAY) }],
    },
    http: { ok: true, status: 200 },
    ...overrides,
  };
}

describe("burn time mapping", function () {
  it("is a fixed, published table rather than a model-chosen number", function () {
    expect(BURN_TIME_BY_GRADE).to.deep.equal({
      A: 21600,
      B: 10800,
      C: 3600,
      D: 900,
      E: 90,
    });
  });

  it("decays monotonically as the grade worsens", function () {
    const times = ["A", "B", "C", "D", "E"].map(burnTimeFor);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).to.be.lessThan(times[i - 1]);
    }
  });

  it("rejects a grade outside the table", function () {
    expect(() => burnTimeFor("A+")).to.throw("unknown grade");
  });
});

describe("adversarial dissent", function () {
  it("can shorten the leash", function () {
    expect(worseOf("A", "D")).to.equal("D");
    expect(burnTimeFor(worseOf("A", "D"))).to.be.lessThan(burnTimeFor("A"));
  });

  it("cannot lengthen it", function () {
    expect(worseOf("D", "A")).to.equal("D");
    expect(worseOf("E", "B")).to.equal("E");
  });

  it("leaves an agreed grade alone", function () {
    expect(worseOf("C", "C")).to.equal("C");
  });
});

describe("deterministic feature extraction", function () {
  it("reads age, expiry, and registry locks from the raw bundle", function () {
    const f = featuresFrom(bundle());
    expect(f.ageDays).to.be.closeTo(4000, 1);
    expect(f.daysToExpiry).to.be.closeTo(400, 1);
    expect(f.transferLocked).to.equal(true);
    expect(f.deleteLocked).to.equal(true);
    expect(f.pendingTransfer).to.equal(false);
    expect(f.tld).to.equal("com");
  });

  it("reports unknowns as null rather than guessing", function () {
    const f = featuresFrom(bundle({ rdap: { ok: false, error: "timeout" } }));
    expect(f.ageDays).to.equal(null);
    expect(f.daysToExpiry).to.equal(null);
    expect(f.transferLocked).to.equal(false);
  });
});

describe("rule-based fallback", function () {
  it("grades an aged, locked, reachable domain well", function () {
    const { grade } = ruleBasedGrade(featuresFrom(bundle()));
    expect(grade).to.equal("A");
  });

  it("grades a fresh domain on a short leash", function () {
    const b = bundle();
    b.rdap.events = [{ action: "registration", date: iso(-20 * DAY) }];
    const { grade } = ruleBasedGrade(featuresFrom(b));
    expect(burnTimeFor(grade)).to.be.at.most(900);
  });

  it("collapses to the shortest leash when the registration is about to lapse", function () {
    const b = bundle();
    b.rdap.expiration = iso(5 * DAY);
    const { grade } = ruleBasedGrade(featuresFrom(b));
    expect(grade).to.equal("E");
  });

  it("penalises a missing transfer lock even on an old domain", function () {
    const b = bundle();
    b.rdap.status_flags = [];
    const { grade } = ruleBasedGrade(featuresFrom(b));
    expect(burnTimeFor(grade)).to.be.at.most(900);
  });

  it("works with no model configured at all — the protocol survives without AI", function () {
    const { grade, reasons } = ruleBasedGrade(featuresFrom(bundle()));
    expect(["A", "B", "C", "D", "E"]).to.include(grade);
    expect(reasons.length).to.be.greaterThan(0);
  });
});
