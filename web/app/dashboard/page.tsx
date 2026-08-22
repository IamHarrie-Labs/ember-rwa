"use client";

import Link from "next/link";
import { useAssets } from "@/lib/useAssets";
import { REGISTRY_ADDRESS } from "@/lib/chain";

export default function Dashboard() {
  const { byUrgency, status, error, retry, cycle } = useAssets();

  return (
    <div className="mx-auto max-w-shell px-4 pb-24 pt-14 sm:px-8">
      <header className="mb-8 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-[30px] font-bold tracking-[-0.03em] sm:text-[36px]">
            Operator dashboard
          </h1>
          <p className="mt-2.5 text-[15px] text-muted">
            Sorted by urgency. The asset closest to going out is at the top.
          </p>
        </div>
        <p className="font-mono text-[11px] leading-[1.8] text-muted sm:text-right">
          READ FROM stateOf() · timeRemaining()
          <br />
          no logs, no indexer, no trust
        </p>
      </header>

      <div className="border border-line bg-panel">
        <div className="hidden grid-cols-[1.6fr_100px_140px_100px_1fr_130px] border-b border-line px-6 py-3.5 font-mono text-[10px] tracking-[0.12em] text-muted lg:grid">
          <span>ASSET</span>
          <span>STATE</span>
          <span className="text-right">GOES OUT IN</span>
          <span className="text-right">BURN TIME</span>
          <span>DECAY</span>
          <span className="text-right">LAST PROOF</span>
        </div>

        {status === "loading" &&
          [0, 1, 2].map((i) => (
            <div key={i} className="border-b border-line-soft px-6 py-6" aria-hidden="true">
              <div className="h-4 w-1/3 bg-line-soft" />
            </div>
          ))}

        {status === "error" && (
          <div className="px-6 py-14 text-center">
            <p className="text-lg font-medium">
              {REGISTRY_ADDRESS ? "Could not read the registry" : "Registry not configured"}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
              {REGISTRY_ADDRESS
                ? error
                : "Set NEXT_PUBLIC_REGISTRY_ADDRESS once the contracts are deployed."}
            </p>
            {REGISTRY_ADDRESS && (
              <button
                onClick={retry}
                className="mt-6 border border-ink px-5 py-2.5 text-[13px] font-medium transition-colors ease-brand hover:bg-ink hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-4 focus-visible:ring-offset-paper"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {status === "ready" && byUrgency.length === 0 && (
          <div className="px-6 py-14 text-center">
            <p className="text-lg font-medium">No assets yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
              An asset appears once its owner proves control with a DNS record and the underwriter
              writes its burn time on-chain.
            </p>
            <pre className="mx-auto mt-5 inline-block bg-ink px-4 py-2.5 text-left font-mono text-xs text-paper">
              npm run prove -- yourdomain.com
            </pre>
          </div>
        )}

        {byUrgency.map((a) => (
          <Link
            key={a.id}
            href={`/asset/${a.id}`}
            className="grid grid-cols-1 items-center gap-2 border-b border-line-soft px-6 py-5 transition-colors ease-brand last:border-b-0 hover:bg-[#F7F7F2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-inset lg:grid-cols-[1.6fr_100px_140px_100px_1fr_130px]"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full border"
                style={{ background: a.dot, borderColor: a.color }}
              />
              <span>
                <span className="block font-mono text-sm font-medium">{a.domain}</span>
                <span className="text-xs text-muted">
                  {a.tier} · grade {a.grade}
                </span>
              </span>
            </div>
            <span className="font-mono text-[11px] tracking-[0.08em]" style={{ color: a.color }}>
              {a.labelUpper}
            </span>
            <span className="tnum text-right font-mono text-xl" style={{ color: a.color }}>
              {a.remaining}
            </span>
            <span className="text-right font-mono text-[13px] text-body">{a.burnLabel}</span>
            <span className="pr-0 lg:pr-8">
              <span className="block h-1 overflow-hidden bg-line-soft">
                <span
                  className="block h-full"
                  style={{ width: a.pct, background: a.color }}
                />
              </span>
            </span>
            <span className="font-mono text-xs text-muted lg:text-right">
              {a.sinceProof} ago
            </span>
          </Link>
        ))}
      </div>

      <section className="mt-8 border border-line bg-panel px-7 py-[26px]">
        <div className="mb-5 flex items-center justify-between gap-4">
          <span className="font-mono text-[10px] tracking-[0.12em] text-muted">CYCLE HEALTH</span>
          {cycle?.lastAttestAt && (
            <span className="flex items-center gap-[7px] font-mono text-[11px]">
              <span aria-hidden="true" className="pulse h-[7px] w-[7px] rounded-full bg-ember" />
              LAST WRITE {clockOf(cycle.lastAttestAt)}
            </span>
          )}
        </div>

        {cycle ? (
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            <Metric v={String(cycle.attestations)} k="cycles written" />
            <Metric v={String(cycle.assetAttestations)} k="asset attestations" />
            <Metric v={gasBot(cycle.last24h.gas)} k="BOT gas, rolling 24h" />
            <Metric v={String(cycle.failures)} k="evidence checks that failed" />
          </dl>
        ) : (
          <p className="text-[13px] leading-[1.6] text-muted">
            No published record yet. The proof cycle writes{" "}
            <span className="font-mono">evidence/history.jsonl</span> and republishes it on every
            pass; this panel reads that file.
          </p>
        )}

        <p className="mt-5 border-t border-line-soft pt-5 text-[13px] leading-[1.6] text-muted">
          If the primary relayer stops, this panel stops advancing before the assets start going
          out. Anyone can then relay a valid signed proof and claim from the reward pool. The
          fallback is permissionless, not a promise.
        </p>
      </section>
    </div>
  );
}

const clockOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("en-GB", { hour12: false });
};

/// Gas is published as a raw unit count. At BOT Chain's flat 20 gwei this is the only
/// conversion the site does, and it is exact rather than rounded for display.
const gasBot = (gas: string) => {
  try {
    return (Number(BigInt(gas) * 20n) / 1e9).toFixed(4);
  } catch {
    return "—";
  }
};

function Metric({ v, k }: { v: string; k: string }) {
  return (
    <div>
      <dd className="tnum font-mono text-[22px]">{v}</dd>
      <dt className="mt-1 text-[13px] text-muted">{k}</dt>
    </div>
  );
}
