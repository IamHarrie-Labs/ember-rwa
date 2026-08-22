"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAssets } from "@/lib/useAssets";
import { short, type Derived, type Memo } from "@/lib/derive";
import { EXPLORER, REGISTRY_ADDRESS } from "@/lib/chain";
import { fetchMemo, fetchTimeline, type TimelineRow } from "@/lib/evidence";

/// The index carries enough to label a card. The full memo — dissent, provenance, citations —
/// is only pulled for the asset actually being inspected.
function useFullMemo(assetId?: string): Memo | null {
  const [memo, setMemo] = useState<Memo | null>(null);
  useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    setMemo(null);
    fetchMemo(assetId).then((m) => {
      if (!cancelled) setMemo(m);
    });
    return () => {
      cancelled = true;
    };
  }, [assetId]);
  return memo;
}

function useTimeline(assetId?: string): TimelineRow[] | null {
  const [rows, setRows] = useState<TimelineRow[] | null>(null);
  useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    const load = () =>
      fetchTimeline(assetId).then((r) => {
        if (!cancelled) setRows(r?.timeline ?? null);
      });
    load();
    const t = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [assetId]);
  return rows;
}

/// The verification page. A judge stops skimming here, so every claim is paired with the
/// means to check it — the two commands, the raw view-call readout, the provenance hashes.
export function AssetView({ id }: { id?: string }) {
  const { assets, status } = useAssets();
  const sel = assets.find((a) => a.id === id) ?? assets[0];
  const fullMemo = useFullMemo(sel?.id);
  const timeline = useTimeline(sel?.id);

  if (status === "loading") {
    return <Shell><p className="text-muted">Reading the registry…</p></Shell>;
  }

  if (!sel) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold tracking-[-0.02em]">
          {REGISTRY_ADDRESS ? "No assets yet" : "Registry not configured"}
        </h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">
          {REGISTRY_ADDRESS
            ? "An asset appears once its owner proves control with a DNS record and the underwriter writes its burn time on-chain."
            : "Set NEXT_PUBLIC_REGISTRY_ADDRESS once the contracts are deployed."}
        </p>
        <Link href="/" className="mt-6 inline-block border border-ink px-5 py-2.5 text-[13px] font-medium transition-colors ease-brand hover:bg-ink hover:text-paper">
          Back to overview
        </Link>
      </Shell>
    );
  }

  return (
    <>
      <Selector assets={assets} selId={sel.id} />
      <Headline sel={sel} />
      <RawState sel={sel} timeline={timeline} />
      <Underwriting sel={sel} memo={fullMemo ?? sel.memo} />
    </>
  );
}

const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("en-GB", { hour12: false });
};

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-shell px-4 py-24 sm:px-8">{children}</div>;
}

function Selector({ assets, selId }: { assets: Derived[]; selId: string }) {
  return (
    <div className="border-b border-line bg-panel">
      <div className="mx-auto flex max-w-shell flex-wrap items-center gap-2 px-4 py-5 sm:px-8">
        <span className="mr-3 font-mono text-[11px] text-muted">SELECT ASSET</span>
        {assets.map((a) => {
          const active = a.id === selId;
          return (
            <Link
              key={a.id}
              href={`/asset/${a.id}`}
              aria-current={active ? "page" : undefined}
              className={`border px-3.5 py-[7px] font-mono text-xs transition-colors ease-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
                active
                  ? "border-ink bg-ink text-paper"
                  : "border-line bg-panel hover:border-ink"
              }`}
            >
              {a.domain}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Headline({ sel }: { sel: Derived }) {
  const memo = sel.memo;
  const message = `ember:${sel.domain}:${sel.issuer.toLowerCase()}`;

  return (
    <section className="border-b border-line">
      <div className="mx-auto grid max-w-shell items-start gap-16 px-4 py-14 sm:px-8 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <div className="mb-[18px] flex items-center gap-3">
            <span
              aria-hidden="true"
              className="h-[9px] w-[9px] rounded-full border"
              style={{ background: sel.dot, borderColor: sel.color }}
            />
            <span className="font-mono text-[11px] tracking-[0.12em]" style={{ color: sel.color }}>
              {sel.labelUpper} · {sel.stateName}
            </span>
          </div>

          <h1 className="break-all font-mono text-[32px] font-medium tracking-[-0.03em] sm:text-[44px]">
            {sel.domain}
          </h1>
          <p className="mt-2.5 text-[15px] text-muted">
            {sel.tier} · grade {sel.grade}, burn time {sel.burnLabel}
          </p>

          <div className="mt-10 border border-ink px-[30px] py-7">
            <p className="font-mono text-[10px] tracking-[0.14em] text-muted">GOES OUT IN</p>
            <p
              className="tnum font-mono text-[56px] font-medium leading-[1.05] tracking-[-0.04em] sm:text-[84px]"
              style={{ color: sel.color }}
            >
              {sel.remaining}
            </p>
            <div className="mt-3.5 h-[5px] overflow-hidden bg-line-soft">
              <div className="h-full" style={{ width: sel.pct, background: sel.color }} />
            </div>
            <div className="mt-3.5 flex flex-wrap justify-between gap-2 font-mono text-[11px] text-muted">
              <span>last proof {sel.sinceProof} ago</span>
              <span>
                dims at {sel.burnLabel} · out at {sel.doubleBurnLabel}
              </span>
            </div>
          </div>

          {/* No listing contract exists in v1, so the buy action is disabled rather than faked. */}
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <Action label="Buy: no marketplace in v1" />
            <Action label={sel.tradable ? "Claim revenue" : "Revenue escrowed"} />
            <Action label={sel.tradable ? "Redemption closed" : "Redeem"} />
          </div>
          <p className="mt-3.5 font-mono text-[11.5px] leading-[1.7] text-muted">
            These are not buttons. Each reflects what <span className="text-ink">stateOf()</span> and
            the contracts above currently report. None of them are wired to a live control yet.
          </p>
        </div>

        <div className="border border-line bg-panel px-8 py-[30px]">
          <p className="mb-2 font-mono text-[10px] tracking-[0.14em] text-muted">
            CHECK THIS YOURSELF
          </p>
          <p className="mb-[22px] text-[15px] leading-[1.6] text-body">
            Two commands, no software of ours in the loop, no account to create. Recover the signer
            from the message and compare it to the issuer.
          </p>

          <p className="mb-1.5 font-mono text-xs text-muted">1 · READ THE CONTROL RECORD</p>
          <pre className="mb-5 overflow-x-auto bg-ink px-[18px] py-4 font-mono text-[12.5px] leading-[1.7] text-paper">
            {`dig +short TXT ${sel.domain}`}
          </pre>

          <p className="mb-1.5 font-mono text-xs text-muted">2 · RECOVER THE SIGNER</p>
          <pre className="mb-5 overflow-x-auto bg-ink px-[18px] py-4 font-mono text-[12.5px] leading-[1.7] text-paper">
            {`ethers.verifyMessage(\n  "${message}",\n  signature\n)`}
          </pre>

          <dl className="border-t border-line-soft pt-5 font-mono text-xs leading-[2] text-body">
            <Row k="issuer" v={sel.issuer} />
            <Row k="verifier" v="SignedAttestationVerifier" />
            <Row k="evidence" v={sel.memo?.evidenceHash ? short(sel.memo.evidenceHash, 10, 6) : "—"} />
          </dl>
          {!memo && (
            <p className="mt-4 text-xs leading-relaxed text-out">
              The published memo for this asset could not be read, so the domain and underwriting
              record are unavailable. Nothing is substituted for them.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-wrap gap-x-3">
      <dt className="w-20 shrink-0 text-muted">{k}</dt>
      <dd className="break-all">{v}</dd>
    </div>
  );
}

/// Not a button — none of these have a click handler, because none of them are wired to a
/// marketplace or claim contract yet. Rendering them with button padding and a "not-allowed"
/// cursor would promise an interaction that does not exist. A status chip, matching the
/// state-badge language used everywhere else on this page, makes the same information
/// honest: this is what the contract currently reports, not a control the interface offers.
function Action({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center border border-line-soft px-3 py-1.5 font-mono text-[11px] tracking-[0.04em] text-out">
      {label}
    </span>
  );
}

function RawState({ sel, timeline }: { sel: Derived; timeline: TimelineRow[] | null }) {
  return (
    <section className="border-b border-line bg-wash">
      <div className="mx-auto grid max-w-shell items-start gap-12 px-4 py-16 sm:px-8 lg:grid-cols-[1fr_1.25fr]">
        <div className="border border-line bg-paper px-7 py-[26px]">
          <p className="mb-[18px] font-mono text-[10px] tracking-[0.14em] text-muted">
            RAW CONTRACT STATE · VIEW CALLS
          </p>
          <dl className="font-mono text-[13px] leading-[2.2]">
            <KV k="stateOf" v={sel.stateName} />
            <KV k="lastAttestedAt" v={sel.lastAttestedAt} />
            <KV k="burnTime" v={sel.burnSeconds} />
            <KV k="timeRemaining" v={sel.remainingSeconds} />
            <KV k="assetId" v={short(sel.id, 8, 6)} />
          </dl>
          <p className="mt-5 border-t border-line-soft pt-[18px] text-[13px] leading-[1.6] text-muted">
            The interface above is checkable against these. Live state requires trusting nobody.
          </p>
        </div>

        <div>
          <p className="mb-[18px] font-mono text-[10px] tracking-[0.14em] text-muted">
            EVIDENCE TIMELINE · CONTENT-ADDRESSED TO RAW DNS / RDAP / HTTP
          </p>
          <div className="border border-line bg-paper">
            {!timeline || timeline.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-[15px] font-medium">No published history yet</p>
                <p className="mx-auto mt-2 max-w-md text-[13px] leading-[1.6] text-muted">
                  The public RPC caps <span className="font-mono">eth_getLogs</span> at roughly a
                  1,000-block span, so history is served from the proof cycle&apos;s own
                  append-only record rather than rebuilt in the browser. Once the cycle runs, every
                  row here links to the transaction that wrote it.
                </p>
              </div>
            ) : (
              timeline.map((r, i) => {
                const failed = r.verdict !== "valid";
                return (
                  <div
                    key={`${r.at}-${i}`}
                    className="grid grid-cols-[92px_1fr_auto] items-center gap-3 border-b border-line-soft px-5 py-3.5 font-mono text-xs last:border-b-0 sm:grid-cols-[110px_1fr_110px_80px]"
                  >
                    <span className="text-muted">{clock(r.at)}</span>
                    <span className="truncate" title={r.evidenceHash ?? r.reasons?.join("; ")}>
                      {r.evidenceHash ? (
                        `evidence ${short(r.evidenceHash, 10, 4)}`
                      ) : (
                        <span className="text-muted">{r.reasons?.join("; ") ?? "—"}</span>
                      )}
                    </span>
                    <span
                      className="hidden sm:block"
                      style={{ color: failed ? "var(--out)" : "var(--body)" }}
                    >
                      {r.verdict}
                    </span>
                    {r.txHash ? (
                      <a
                        href={`${EXPLORER}/tx/${r.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-right text-[11px] text-muted transition-colors ease-brand hover:text-ink"
                      >
                        {short(r.txHash, 6, 4)} ↗
                      </a>
                    ) : (
                      // A failed check writes nothing. The gap in the record is the mechanism.
                      <span className="text-right text-[11px] text-out">no write</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className="break-all text-right">{v}</dd>
    </div>
  );
}

function Underwriting({ sel, memo }: { sel: Derived; memo: Memo | null }) {
  const uw = memo?.underwriter;
  const adv = memo?.adversary;
  const prov = memo?.provenance?.underwriter;

  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-shell px-4 py-16 sm:px-8">
        <p className="eyebrow mb-8">
          Underwriting · the grade is the only number the model touches
        </p>

        {!memo ? (
          <p className="border border-dashed border-line px-6 py-10 text-center text-[15px] text-muted">
            No published memo for this asset.
          </p>
        ) : (
          <>
            <div className="rule-grid lg:grid-cols-2">
              <div className="bg-panel px-8 py-[30px]">
                <div className="mb-4 flex items-baseline justify-between gap-3">
                  <span className="text-lg font-bold">Underwriter memo</span>
                  <span className="font-mono text-xs text-muted">
                    proposed grade {uw?.grade ?? "—"}
                  </span>
                </div>
                <p className="text-pretty text-[15px] leading-[1.65] text-body">
                  {uw?.memo ?? "—"}
                </p>
              </div>

              <div className="bg-panel px-8 py-[30px]">
                <div className="mb-4 flex items-baseline justify-between gap-3">
                  <span className="text-lg font-bold">Adversarial critique</span>
                  <span className="font-mono text-xs text-ember-deep">
                    recommends {adv?.gradeShouldBe ?? "—"}
                  </span>
                </div>
                <p className="text-pretty text-[15px] leading-[1.65] text-body">
                  {adv?.argument ??
                    "No adversarial pass recorded. This asset was graded by the rule-based fallback."}
                </p>
              </div>
            </div>

            <div className="rule-grid border-t-0 lg:grid-cols-2">
              <div className="bg-wash px-8 py-[22px] text-sm leading-[1.6] text-body">
                The protocol takes the more conservative of the two. A dissent that could raise the
                grade would be a second opinion; a dissent that can only lower it is a safety
                property.
              </div>
              <div className="flex flex-wrap items-center gap-5 bg-wash px-8 py-[22px]">
                <span className="font-mono text-[13px] text-muted">FINAL</span>
                <span className="font-mono text-[32px] font-bold tracking-[-0.02em]">
                  {sel.grade}
                </span>
                <span className="text-sm text-body">
                  → burn time {sel.burnLabel}, written on-chain at admission and fixed for the life
                  of the asset.
                </span>
              </div>
            </div>

            <div className="mt-7 border border-line bg-panel px-[30px] py-[26px]">
              <p className="mb-4 font-mono text-[10px] tracking-[0.14em] text-muted">
                PROVENANCE · RE-RUN THIS AND COMPARE
              </p>
              <div className="grid gap-7 font-mono text-[12.5px] leading-[1.9] sm:grid-cols-3">
                <div>
                  <span className="block text-muted">model</span>
                  {prov?.model ?? memo.engine ?? "—"}
                </div>
                <div>
                  <span className="block text-muted">prompt hash</span>
                  {prov?.promptHash ? short(prov.promptHash, 8, 6) : "—"}
                </div>
                <div>
                  <span className="block text-muted">output hash</span>
                  {prov?.outputHash ? short(prov.outputHash, 8, 6) : "—"}
                </div>
              </div>
              <p className="mt-[18px] border-t border-line-soft pt-4 text-[13px] leading-[1.6] text-muted">
                Reproducible rather than attested-by-hardware, and honest about which it is.
                TEE-attested inference is roadmap.
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
