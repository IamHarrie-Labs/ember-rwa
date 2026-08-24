"use client";

import Link from "next/link";
import { useAssets } from "@/lib/useAssets";
import { EXPLORER, REGISTRY_ADDRESS } from "@/lib/chain";
import type { Derived } from "@/lib/derive";

export default function Overview() {
  return (
    <>
      <Hero />
      <NoAdminKey />
      <HowItWorks />
      <GradeTable />
      <Roadmap />
    </>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero() {
  const { assets, byUrgency, status } = useAssets();

  return (
    <section className="border-b border-line">
      <div className="mx-auto grid max-w-shell px-4 sm:px-8 lg:grid-cols-[1.15fr_1fr]">
        <div className="border-line pb-16 pt-24 lg:border-r lg:pb-16 lg:pr-14 lg:pt-32">
          <p className="eyebrow mb-9">A verification layer for real-world assets</p>
          <h1 className="text-balance text-[44px] font-bold leading-[0.96] tracking-[-0.035em] sm:text-[68px]">
            An ember dies unless it is fed.
          </h1>
          <p className="mt-8 max-w-[30em] text-pretty text-[19px] leading-[1.5] text-body">
            Every tokenized asset on Ember stays tradable only while its evidence is{" "}
            <span className="accent">fresh</span>. Renew that evidence and it keeps trading.
            Stop, and it stops. Nobody has to step in and turn it off. The permission to trade
            simply runs out on its own.
          </p>

          <div className="mt-10 flex max-w-[34em] items-start gap-[18px] border border-ink px-6 py-5">
            <span className="pt-[3px] font-mono text-[11px] tracking-[0.1em] text-muted">
              RULE
            </span>
            <span className="text-[17px] font-medium leading-[1.35] tracking-[-0.01em]">
              No asset may trade unless its supporting evidence is still fresh.
            </span>
          </div>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="bg-ink px-[22px] py-[13px] text-[13px] font-medium text-paper transition-colors ease-brand hover:bg-ember-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-4 focus-visible:ring-offset-paper"
            >
              Live dashboard
            </Link>
            <Link
              href={byUrgency[0] ? `/asset/${byUrgency[0].id}` : "/dashboard"}
              className="border border-line px-[22px] py-[13px] text-[13px] font-medium transition-colors ease-brand hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-4 focus-visible:ring-offset-paper"
            >
              Inspect an asset
            </Link>
          </div>
        </div>

        <div className="flex flex-col justify-center py-16 lg:pl-10">
          <div className="flex flex-col gap-3.5">
            {status === "loading" &&
              [0, 1, 2].map((i) => (
                <div key={i} className="border border-line bg-panel p-5" aria-hidden="true">
                  <div className="h-4 w-1/2 bg-line-soft" />
                  <div className="mt-4 h-8 w-1/3 bg-line-soft" />
                  <div className="mt-4 h-[3px] w-full bg-line-soft" />
                </div>
              ))}

            {status === "error" && (
              <div className="border border-line bg-panel p-5 text-sm leading-relaxed text-muted">
                {REGISTRY_ADDRESS
                  ? "Could not read the registry. The countdown below is not shown rather than shown wrong."
                  : "No registry configured yet. Set NEXT_PUBLIC_REGISTRY_ADDRESS once the contracts are deployed."}
              </div>
            )}

            {status === "ready" && assets.length === 0 && (
              <div className="border border-dashed border-line p-8 text-sm leading-relaxed text-muted">
                No assets yet. One appears when an owner proves control with a DNS record and the
                underwriter writes its burn time on-chain.
              </div>
            )}

            {byUrgency.slice(0, 3).map((a) => (
              <HeroCard key={a.id} a={a} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroCard({ a }: { a: Derived }) {
  return (
    <Link
      href={`/asset/${a.id}`}
      className="block border border-line bg-panel px-5 py-[18px] transition-colors ease-brand hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-4 focus-visible:ring-offset-paper"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate font-mono text-sm font-medium">{a.domain}</span>
        <span className="font-mono text-[10px] tracking-[0.12em]" style={{ color: a.color }}>
          {a.labelUpper}
        </span>
      </div>
      <div className="mt-3.5 flex items-end justify-between">
        <span
          className="tnum font-mono text-[30px] font-medium tracking-[-0.02em]"
          style={{ color: a.color }}
        >
          {a.remaining}
        </span>
        <span className="text-right font-mono text-[10px] leading-[1.5] text-muted">
          GRADE {a.grade}
          <br />
          BURN {a.burnLabel}
        </span>
      </div>
      <div className="mt-3.5 h-[3px] overflow-hidden bg-line-soft">
        <div className="h-full" style={{ width: a.pct, background: a.color }} />
      </div>
    </Link>
  );
}

/* ------------------------------------------------------- no admin key */

function NoAdminKey() {
  return (
    <section className="border-b border-line bg-ink text-paper">
      <div className="mx-auto grid max-w-shell gap-16 px-4 py-20 sm:px-8 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <h2 className="text-[32px] font-bold leading-[1.05] tracking-[-0.03em] sm:text-[40px]">
            There is <span className="accent">no admin key</span> on this contract.
          </h2>
          <p className="mt-6 max-w-[34em] text-pretty text-base leading-[1.6] text-[#B4B4AC]">
            Nobody, including us, can pause an asset, freeze it, or extend its clock — the
            contract has no function that does that. Anyone can confirm it by reading the
            deployed code.
          </p>

          <div className="mt-8 font-mono text-xs leading-[2]">
            <div className="text-muted">EmberRegistry</div>
            {REGISTRY_ADDRESS ? (
              <div className="flex flex-wrap items-center gap-3.5">
                <span className="text-[13px]">{REGISTRY_ADDRESS}</span>
                <a
                  href={`${EXPLORER}/address/${REGISTRY_ADDRESS}`}
                  target="_blank"
                  rel="noreferrer"
                  className="border-b border-[#4A4A44] text-[11px] text-paper transition-colors ease-brand hover:border-ember hover:text-ember"
                >
                  scan.botchain.ai ↗
                </a>
              </div>
            ) : (
              <div className="text-out">not deployed yet</div>
            )}
          </div>
        </div>

        <div className="flex items-center border border-ink-line px-6 py-[22px]">
          <Link
            href="/docs#contract"
            className="inline-block border-b border-[#4A4A44] font-mono text-xs text-paper transition-colors ease-brand hover:border-ember hover:text-ember"
          >
            Read the full contract interface in the docs ↗
          </Link>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- how it works */

const STEPS = [
  {
    n: "01",
    title: "Prove ownership",
    body: "The owner signs a short message and publishes it as a DNS record. That proves the same person controls both the wallet and the domain.",
  },
  {
    n: "02",
    title: "Verify on schedule",
    body: "A background process rechecks that record and writes proof of it on-chain. Anyone can submit that proof, so the system keeps working even if one operator goes offline.",
  },
  {
    n: "03",
    title: "Let time do the rest",
    body: "Once too long passes without a fresh proof, the asset stops trading on its own. Nobody decides that in the moment — it was set the day the asset was admitted.",
  },
];

function HowItWorks() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-shell px-4 py-20 sm:px-8">
        <p className="eyebrow mb-10">How it works</p>

        <div className="rule-grid md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-paper px-8 py-9">
              <div className="font-mono text-[11px] text-muted">{s.n}</div>
              <h3 className="mt-3.5 text-2xl font-bold tracking-[-0.02em]">{s.title}</h3>
              <p className="mt-3 text-[15px] leading-[1.6] text-body">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ grade table */

const GRADES = [
  ["A", "6 hours", "long track record, low risk"],
  ["B", "3 hours", "established, minor weaknesses"],
  ["C", "1 hour", "ordinary, unremarkable"],
  ["D", "15 minutes", "thin history or a missing safeguard"],
  ["E", "90 seconds", "brand new, or evidence about to expire"],
];

function GradeTable() {
  return (
    <section className="border-b border-line bg-ink text-paper">
      <div className="mx-auto grid max-w-shell gap-16 px-4 py-20 sm:px-8 lg:grid-cols-2">
        <div>
          <p className="eyebrow mb-6 !text-[#8A8A82]">How grading works</p>
          <h2 className="text-[28px] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[34px]">
            An AI model reads the evidence and assigns a grade. A fixed table turns that grade
            into time.
          </h2>
          <p className="mt-[22px] text-pretty text-base leading-[1.6] text-[#B4B4AC]">
            A second model checks the first one&apos;s work and can only argue the grade down,
            never up — a disagreement can only shorten how long an asset gets before it needs
            fresh evidence again.
          </p>
          <Link
            href="/docs#grading"
            className="mt-5 inline-block border-b border-[#4A4A44] font-mono text-xs text-paper transition-colors ease-brand hover:border-ember hover:text-ember"
          >
            Read how facts and AI judgment are kept separate ↗
          </Link>
        </div>

        <div className="border border-ink-line">
          <div className="grid grid-cols-[52px_100px_1fr] border-b border-ink-line px-6 py-4 font-mono text-[10px] tracking-[0.12em] text-[#8A8A82]">
            <span>GRADE</span>
            <span>BURN TIME</span>
            <span>MEANING</span>
          </div>
          {GRADES.map(([g, t, reading], i) => (
            <div
              key={g}
              className={`grid grid-cols-[52px_100px_1fr] items-baseline px-6 py-4 text-sm ${
                i < GRADES.length - 1 ? "border-b border-ink-line" : ""
              }`}
            >
              <span className="font-mono font-bold">{g}</span>
              <span className="font-mono">{t}</span>
              <span className="text-[#C4C4BC]">{reading}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------- kill sequence */

/* --------------------------------------------------- what it does not do */

/* ------------------------------------------------------------- roadmap */

const ROADMAP = [
  [
    "NEXT",
    "Verify DNS ownership on-chain directly",
    "Removes the background relayer from the critical path entirely.",
  ],
  [
    "NEW ASSET CLASS",
    "Merchant revenue as an asset",
    "Prove a Stripe or Shopify revenue history without ever handing over credentials.",
  ],
  [
    "TRUST",
    "A staked, open verifier set",
    "And a staked jury for contested breaks, replacing today's single arbiter.",
  ],
  [
    "AI INTEGRITY",
    "Hardware-attested underwriting",
    "Once the stakes justify it. Publishing every model input and output covers most of the gap today.",
  ],
  [
    "COMPOSABILITY",
    "Freshness as a building block",
    "Lending markets could read an asset's state directly and reduce how much can be borrowed against it as it dims, automatically.",
  ],
];

function Roadmap() {
  return (
    <section className="bg-wash">
      <div className="mx-auto max-w-shell px-4 py-20 sm:px-8">
        <p className="eyebrow mb-9">Roadmap</p>
        <div className="rule-grid sm:grid-cols-2 lg:grid-cols-5">
          {ROADMAP.map(([tag, title, body]) => (
            <div key={title} className="bg-paper px-[22px] py-[26px]">
              <div className="mb-3 font-mono text-[11px] text-muted">{tag}</div>
              <div className="mb-2.5 text-base font-medium leading-[1.3]">{title}</div>
              <div className="text-[13px] leading-[1.6] text-muted">{body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
