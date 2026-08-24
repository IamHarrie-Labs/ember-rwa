import Link from "next/link";
import { EXPLORER, REGISTRY_ADDRESS } from "@/lib/chain";

export const metadata = {
  title: "Docs: Ember",
  description: "The technical detail behind Ember: the contract interface, the grading model, measured performance, and why BOT Chain.",
};

// Transcribed from contracts/EmberRegistry.sol. Every entry is a real external function.
const LIFECYCLE_ABI = [
  "register(kind, identifier, evidenceURI)",
  "admit(assetId, verifier, burnTime, evidenceURI)",
  "attest(assetId, proof)",
  "attestMany(assetIds[], proofs[])",
  "proposeBreak(assetId, reasonHash)",
  "contestBreak(assetId)",
  "finalizeBreak(assetId)",
  "resolveContest(assetId, upholdBreak)",
  "markRedeemable(assetId)",
  "fundRewards()",
];

const KILL_ROWS = [
  {
    t: "T+0s",
    body: "The DNS record is deleted at the registrar. On-chain, nothing has happened yet: the last valid proof still carries the asset.",
  },
  {
    t: "T+60s",
    body: "The proof cycle runs. The resolver returns no record, so no valid proof can be produced. The relayer writes nothing, because there is nothing to write.",
  },
  {
    t: "T+90s",
    accent: true,
    body: "Dimming. Age passes one burn time. The asset now trades flagged rather than cleanly.",
  },
  {
    t: "T+180s",
    bold: true,
    body: "Out. Age passes twice the burn time, within one 0.75-second block of the deadline the contract set at admission.",
  },
  {
    t: "After",
    body: "Transfers revert, revenue escrows, and redemption opens. Nothing was frozen by a person; the state that permitted trading stopped being true on its own.",
  },
];

const MEASURED = [
  { v: "79,660", l: "gas for one attestation", s: "0.0016 BOT at 20 gwei" },
  { v: "33.7%", l: "saved per asset by batching three together", s: "one transaction instead of three" },
  { v: "0.75s", l: "average block time, measured over 20 blocks", s: "measured 2026-08-16" },
  { v: "159", l: "asset attestations written on mainnet", s: "across 86 transactions since 22 Aug" },
  { v: "20 gwei", l: "flat priority fee, no base fee", s: "cost does not spike with network demand" },
  { v: "53", l: "automated tests, all passing", s: "contracts, agent, and full end-to-end" },
  { v: "0", l: "functions that can pause, freeze,", s: "or extend an asset's clock" },
];

const TOC = [
  ["contract", "The full contract interface"],
  ["grading", "How grading works"],
  ["listing", "Self-serve listing"],
  ["kill-sequence", "The kill sequence"],
  ["failure-modes", "Failure modes"],
  ["compliance", "Compliance posture"],
  ["measured", "Measured, not asserted"],
  ["chain", "Why BOT Chain"],
] as const;

const FAILURE_ROWS = [
  ["Primary relayer offline", "Anyone can submit a valid proof. The registry checks the proof, never the sender. The reward that pays a third-party relayer is live in the contract and tested, but the mainnet pool is not capitalized yet, so relaying today is altruistic rather than paid."],
  ["One asset's proof is unusable", "attestMany is atomic, so the batch reverts, then the cycle retries each asset individually. The bad asset fails alone; the rest keep their cycle."],
  ["Agent clock drifts from chain time", "Observations are timestamped from block.timestamp, not the local clock. Drift over 30s is logged rather than silently producing rejected proofs."],
  ["All relayers offline", "Assets go out; capital escrows; no wrong state is asserted."],
  ["DNS resolution unavailable", "No fresh proof; the ember goes out on schedule."],
  ["Registrar account compromised", "The proof cycle reports the change; it cannot prevent it."],
  ["AI proposes a false break", "Issuer contests, or a fresh proof dismisses it automatically."],
  ["Gas pool exhausted", "Same as relayer offline: going out, not false liveness."],
  ["Chain halted", "State frozen; no asset asserts freshness it does not have."],
] as const;

const CHAIN_ROWS = [
  [
    "Block time",
    "0.75s",
    "An asset goes out within one block of its deadline, so decay is observable in real time rather than rounded to a slower chain's block boundary.",
  ],
  [
    "Base fee",
    "0",
    "There is no fee auction to spike. A verification schedule can be budgeted a week in advance and stay accurate.",
  ],
  [
    "Priority fee",
    "flat 20 gwei",
    "Blocks are rarely full, so there is no bidding war to lose. A check run at 2pm costs the same as one at 3am.",
  ],
  ["Chain ID", "677", "A standard EVM chain, which means standard tooling works without modification."],
];

export default function Docs() {
  return (
    <div className="mx-auto max-w-shell px-4 pb-24 pt-14 sm:px-8">
      <header className="mb-14 max-w-[42em]">
        <p className="eyebrow mb-4">Docs</p>
        <h1 className="text-[32px] font-bold leading-[1.05] tracking-[-0.03em] sm:text-[40px]">
          The detail behind the landing page
        </h1>
        <p className="mt-5 text-pretty text-[17px] leading-[1.6] text-body">
          The overview keeps things short on purpose. Everything here is the same protocol,
          explained at the depth an engineer, auditor, or underwriter would actually want before
          relying on it.
        </p>
      </header>

      <nav
        aria-label="On this page"
        className="mb-14 flex flex-wrap gap-x-6 gap-y-2 border-y border-line py-4 font-mono text-[12px] lg:hidden"
      >
        {TOC.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="text-muted transition-colors ease-brand hover:text-ink">
            {label}
          </a>
        ))}
      </nav>

      <div className="grid gap-16 lg:grid-cols-[200px_1fr]">
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-3 border-l border-line pl-5 text-[13px]">
            {TOC.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="text-muted transition-colors ease-brand hover:text-ink"
              >
                {label}
              </a>
            ))}
          </div>
        </nav>

        <div className="min-w-0">
      <DocSection id="contract" eyebrow="No admin key" title="The full contract interface">
        <p className="max-w-[42em] text-[15px] leading-[1.65] text-body">
          This is the complete list of functions that change state on <code className="font-mono text-[13px]">EmberRegistry</code>.
          There is no function anywhere in it that pauses an asset, freezes it, extends its
          clock, or writes a fresh timestamp without a valid proof attached. A test in the
          repository checks this directly against the compiled contract, so it cannot drift out
          of date with the code.
        </p>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="border border-line bg-panel px-6 py-[22px] font-mono text-xs leading-[2.05]">
            <div className="mb-3 text-[10px] tracking-[0.12em] text-muted">
              ABI, ASSET LIFECYCLE
            </div>
            {LIFECYCLE_ABI.map((fn) => (
              <div key={fn}>{fn}</div>
            ))}
          </div>
          <div className="border border-line bg-panel px-6 py-[22px] text-[14px] leading-[1.7] text-body">
            <p className="mb-3 font-mono text-[10px] tracking-[0.12em] text-muted">
              WHAT IS DELIBERATELY MISSING
            </p>
            <p className="font-mono text-[13px] text-ember-deep">
              no pause() · no freeze() · no setState()
              <br />
              no extendClock() · no setLastAttestedAt()
            </p>
            <p className="mt-4">
              An owner account still exists. It sets roles, parameters, and the reward pool. It
              cannot make a stale asset tradable again.
            </p>
            {REGISTRY_ADDRESS && (
              <a
                href={`${EXPLORER}/address/${REGISTRY_ADDRESS}`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block border-b border-line text-[13px] transition-colors ease-brand hover:border-ember hover:text-ember"
              >
                Open the deployed contract ↗
              </a>
            )}
          </div>
        </div>
      </DocSection>

      <DocSection id="grading" eyebrow="How grading works" title="Facts and AI judgment are kept separate">
        <p className="max-w-[42em] text-[15px] leading-[1.65] text-body">
          Two different kinds of checks decide an asset&apos;s state, and they are not allowed to
          blend together.
        </p>
        <div className="mt-6 grid gap-8 md:grid-cols-2">
          <div className="border border-line bg-panel p-6">
            <p className="mb-2 font-mono text-xs tracking-[0.1em] text-muted">DETERMINISTIC FACTS</p>
            <p className="text-[14.5px] leading-[1.7] text-body">
              The DNS record, domain expiry, HTTP status, and nameserver match are checked
              directly, with no model involved. These facts alone can move an asset toward{" "}
              <span className="font-mono text-[13px]">Stale</span>.
            </p>
          </div>
          <div className="border border-line bg-panel p-6">
            <p className="mb-2 font-mono text-xs tracking-[0.1em] text-muted">AI JUDGMENT</p>
            <p className="text-[14.5px] leading-[1.7] text-body">
              A model can propose that an asset is{" "}
              <span className="font-mono text-[13px]">Broken</span>, but that proposal opens a
              challenge window rather than taking effect immediately, and a fresh proof dismisses
              it automatically. A model can never instantly freeze an asset.
            </p>
          </div>
        </div>
        <p className="mt-8 max-w-[42em] text-[15px] leading-[1.65] text-body">
          At admission, two models run in sequence: an underwriter that argues for the asset, and
          an adversary asked to argue against it. The adversary is allowed to recommend a worse
          grade and is never allowed to recommend a better one. A disagreement between them can
          only shorten how long an asset gets before it needs fresh evidence again, never
          lengthen it.
        </p>
      </DocSection>

      <DocSection id="listing" eyebrow="Self-serve listing" title="Nobody holding our keys has to act">
        <p className="max-w-[42em] text-[15px] leading-[1.65] text-body">
          Listing an asset does not route through us. At{" "}
          <Link href="/list" className="border-b border-line text-ink transition-colors ease-brand hover:border-ember hover:text-ember">
            /list
          </Link>
          , a connected wallet signs the control message, gets the exact DNS TXT record to
          publish, and calls <code className="font-mono text-[13px]">register()</code>{" "}
          directly: a normal transaction from their own wallet, not a request to an
          operator.
        </p>
        <div className="mt-6 border border-line bg-panel">
          {[
            ["1", "Sign", "The owner signs ember:<domain>:<issuer> with their wallet. No account, no software of ours in the loop."],
            ["2", "Publish", "They publish the signature as a TXT record on their own domain, at their own registrar."],
            ["3", "Register", "Their wallet calls EmberRegistry.register() directly: permissionless, on-chain, instant."],
            ["4", "Await admission", "The proof cycle discovers the asset on-chain by reading the registry, not a hardcoded list, and reports it as awaiting underwriting. Grading itself is still run manually by the underwriter. See the note below."],
          ].map(([n, title, body], i, arr) => (
            <div
              key={n}
              className={`grid grid-cols-[40px_140px_1fr] items-baseline gap-x-4 px-6 py-4 text-sm ${
                i < arr.length - 1 ? "border-b border-line-soft" : ""
              }`}
            >
              <span className="font-mono text-muted">{n}</span>
              <span className="font-medium">{title}</span>
              <span className="text-body">{body}</span>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-[42em] text-[15px] leading-[1.65] text-body">
          <span className="font-medium">Admission is still a manual step.</span> Anyone can
          register an asset without asking us, and nobody can block that transaction. But
          the underwriter still runs grading by hand before an asset gets a burn time and
          becomes tradable. That gate is deliberate: unattended admission would let anyone
          register arbitrary domains and spend the underwriter&apos;s gas and model budget
          at will. Opening it up needs a fee or a stake to make abuse expensive. Roadmap,
          not shipped.
        </p>
      </DocSection>

      <DocSection id="kill-sequence" eyebrow="The kill sequence" title="What happens, second by second">
        <p className="max-w-[42em] text-[15px] leading-[1.65] text-body">
          This is the exact sequence a domain asset goes through after its DNS record is deleted,
          on the throwaway demo tier: a 90-second burn time and a 60-second check cycle.
        </p>
        <div className="mt-6 border border-line bg-panel">
          {KILL_ROWS.map((r, i) => (
            <div
              key={r.t}
              className={`grid grid-cols-[90px_1fr] sm:grid-cols-[110px_1fr] ${
                i < KILL_ROWS.length - 1 ? "border-b border-line-soft" : ""
              }`}
            >
              <div
                className="px-6 py-[18px] font-mono text-xs"
                style={{ color: r.accent ? "var(--ember)" : "var(--muted)" }}
              >
                {r.t}
              </div>
              <div className={`px-6 py-[18px] text-[14.5px] leading-[1.55] ${r.bold ? "font-medium" : ""}`}>
                {r.body}
              </div>
            </div>
          ))}
        </div>
      </DocSection>

      <DocSection id="failure-modes" eyebrow="Failure modes" title="Every failure resolves toward refusing to assert liveness">
        <p className="max-w-[42em] text-[15px] leading-[1.65] text-body">
          Never toward asserting it falsely. That is the correct direction for a
          verification system, and it falls out of decay-by-default rather than being a
          list of handlers we wrote.
        </p>
        <div className="mt-6 border border-line bg-panel">
          {FAILURE_ROWS.map(([failure, result], i) => (
            <div
              key={failure}
              className={`grid gap-x-6 gap-y-1 px-6 py-4 text-sm sm:grid-cols-[220px_1fr] ${
                i < FAILURE_ROWS.length - 1 ? "border-b border-line-soft" : ""
              }`}
            >
              <span className="font-medium">{failure}</span>
              <span className="leading-[1.55] text-body">{result}</span>
            </div>
          ))}
        </div>
      </DocSection>

      <DocSection id="compliance" eyebrow="Compliance posture" title="What happens when it goes bad, and who decides">
        <p className="max-w-[42em] text-[15px] leading-[1.65] text-body">
          The question a regulator or a risk desk asks is not &quot;was it real at
          issuance&quot; but that one. Ember&apos;s answer is that degradation is
          mechanical, observable, and non-discretionary. There is no one to pressure and
          no one to trust for the common case.
        </p>
        <p className="mt-5 max-w-[42em] text-[15px] leading-[1.65] text-body">
          The one discretionary path, a finalized break, is time-delayed, contestable by
          the issuer inside the challenge window, and economically bonded: anyone can
          slash the issuer&apos;s bond to the holder once a break is finalized, so the
          consequence is mechanical rather than a matter of who gets heard.
        </p>
        <p className="mt-5 max-w-[42em] text-[15px] leading-[1.65] text-body">
          What Ember does not claim: it does not verify a domain was legitimately valuable
          at admission, it does not integrate with a registrar to move the underlying
          asset, and its one remaining trusted role, the arbiter for contested breaks,
          is named on this page rather than hidden. A staked jury replacing that role is on
          the roadmap.
        </p>
      </DocSection>

      <DocSection id="measured" eyebrow="Measured, not asserted" title="Real numbers, reproducible from the repository">
        <p className="max-w-[42em] text-[15px] leading-[1.65] text-body">
          Every figure below comes out of <code className="font-mono text-[13px]">scripts/gas.js</code>{" "}
          or a live run against the deployed contracts. Nothing here is a projection.
        </p>
        <div className="rule-grid mt-6 sm:grid-cols-2 lg:grid-cols-4">
          {MEASURED.map((c) => (
            <div key={c.l} className="bg-paper px-[22px] py-6">
              <div className="font-mono text-[28px] font-medium tracking-[-0.03em]">{c.v}</div>
              <div className="mt-2 text-[13px] leading-[1.5] text-muted">
                {c.l}
                <br />
                {c.s}
              </div>
            </div>
          ))}
        </div>
      </DocSection>

      <DocSection id="chain" eyebrow="Why BOT Chain" title="What the chain's properties actually buy us">
        <p className="max-w-[42em] text-[15px] leading-[1.65] text-body">
          A protocol whose safety depends on writing proofs on schedule cannot tolerate a fee
          auction, because losing one looks identical to an asset going bad. Predictable cost
          matters here more than low cost.
        </p>
        <div className="mt-6">
          <div className="hidden grid-cols-[160px_140px_1fr] border-b border-ink pb-3.5 font-mono text-[10px] tracking-[0.12em] text-muted sm:grid">
            <span>PROPERTY</span>
            <span>MEASURED</span>
            <span>WHY IT MATTERS HERE</span>
          </div>
          {CHAIN_ROWS.map(([p, m, why]) => (
            <div
              key={p}
              className="grid items-baseline gap-x-4 gap-y-1 border-b border-line-soft py-5 text-[14.5px] sm:grid-cols-[160px_140px_1fr]"
            >
              <span className="font-medium">{p}</span>
              <span className="font-mono">{m}</span>
              <span className="leading-[1.55] text-body">{why}</span>
            </div>
          ))}
        </div>
      </DocSection>

      <div className="mt-16 border-t border-line pt-10">
        <Link
          href="/"
          className="border-b border-line font-mono text-xs text-ink transition-colors ease-brand hover:border-ember hover:text-ember"
        >
          ← Back to the overview
        </Link>
      </div>
        </div>
      </div>
    </div>
  );
}

function DocSection({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-16 scroll-mt-24 border-t border-line pt-12">
      <p className="eyebrow mb-3">{eyebrow}</p>
      <h2 className="mb-6 max-w-[30em] text-[24px] font-bold leading-[1.15] tracking-[-0.02em] sm:text-[28px]">
        {title}
      </h2>
      {children}
    </section>
  );
}
