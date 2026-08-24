import type { Asset } from "./chain";

/// The underwriting memo published by `agent/underwrite.js`. Everything the chain cannot
/// hold — the plaintext domain, the memo, the dissent, the model provenance — lives here,
/// content-addressed by the hash in the asset's evidenceURI.
export type Memo = {
  assetId: string;
  domain: string;
  grade: string;
  burnTime: number;
  engine: string;
  evidenceHash: string;
  features?: { tld?: string; ageDays?: number | null };
  underwriter?: { grade?: string; memo?: string; materialRisks?: string[] };
  adversary?: { gradeShouldBe?: string; argument?: string } | null;
  provenance?: {
    underwriter?: { model?: string; promptHash?: string; outputHash?: string };
  } | null;
};

export type Phase = "bright" | "dimming" | "out" | "broken" | "ash" | "unlit";

export type Derived = {
  id: string;
  domain: string;
  stateName: string;
  label: string;
  labelUpper: string;
  /** CSS colour for text and bars in this phase. */
  color: string;
  /** CSS colour for the status dot fill. */
  dot: string;
  phase: Phase;
  /** Seconds until the asset goes out. */
  outAt: number;
  remaining: string;
  remainingSeconds: string;
  pct: string;
  burnLabel: string;
  doubleBurnLabel: string;
  burnSeconds: string;
  sinceProof: string;
  lastAttestedAt: string;
  tier: string;
  grade: string;
  issuer: string;
  issuerShort: string;
  tradable: boolean;
  memo: Memo | null;
};

const EMBER = "var(--ember)";
const INK = "var(--ink)";
const OUT = "var(--out)";
const DIM = "var(--dim)";
const DANGER = "var(--danger)";

/// Countdown format from the design: h:mm:ss above an hour, mm:ss below.
export function fmt(sec: number): string {
  if (sec <= 0) return "00:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/// Coarse label for a duration that never ticks — "6h", "15m", "90s".
export function dur(sec: number): string {
  if (sec >= 3600 && sec % 3600 === 0) return `${sec / 3600}h`;
  if (sec >= 120 && sec % 60 === 0) return `${sec / 60}m`;
  return `${sec}s`;
}

export function ago(sec: number): string {
  if (sec < 60) return `${Math.floor(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.floor(sec % 60)}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

export const short = (v: string, lead = 6, tail = 4) =>
  !v || v.length <= lead + tail + 1 ? v : `${v.slice(0, lead)}…${v.slice(-tail)}`;

/// Burn time bands, mirroring agent/lib/grading.js. Labels the tier the underwriter placed
/// the asset in, which is what makes two assets decaying at different rates legible.
function tierOf(burnTime: number): string {
  if (burnTime >= 21600) return "Aged tier";
  if (burnTime >= 3600) return "Standard tier";
  if (burnTime >= 900) return "Thin tier";
  return "Throwaway tier";
}

/// The view model. State comes from the chain; presentation is derived here so that the
/// countdown can tick locally between reads without ever inventing a state the chain
/// did not report.
export function derive(asset: Asset, memo: Memo | null, now: number): Derived {
  const elapsedSinceRead = Math.max(0, (now - asset.readAt) / 1000);
  const outAt = Math.max(0, asset.remaining - elapsedSinceRead);
  const window = asset.burnTime * 2;
  const age = window - outAt;

  let phase: Phase = "bright";
  let stateName = "Live";
  let label = "bright";
  let color = EMBER;
  let dot = EMBER;

  if (asset.redeemable) {
    phase = "ash";
    stateName = "Redeemable";
    label = "redeemable";
    color = OUT;
    dot = "transparent";
  } else if (asset.broken) {
    phase = "broken";
    stateName = "Broken";
    label = "broken";
    color = DANGER;
    dot = DANGER;
  } else if (asset.burnTime === 0) {
    phase = "unlit";
    stateName = "Pending";
    label = "unlit";
    color = OUT;
    dot = "transparent";
  } else if (outAt <= 0) {
    phase = "out";
    stateName = "Stale";
    label = "out";
    color = OUT;
    dot = "transparent";
  } else if (outAt <= asset.burnTime) {
    // Dimming renders in ink with a grey dot rather than a second hue — the palette never
    // has to invent a warning colour.
    phase = "dimming";
    stateName = "Degraded";
    label = "dimming";
    color = INK;
    dot = DIM;
  }

  const pct = window > 0 ? Math.max(0, Math.min(100, (outAt / window) * 100)) : 0;

  return {
    id: asset.id,
    domain: memo?.domain ?? short(asset.id, 10, 6),
    stateName,
    label,
    labelUpper: label.toUpperCase(),
    color,
    dot,
    phase,
    outAt,
    remaining: fmt(outAt),
    remainingSeconds: `${Math.max(0, Math.floor(outAt))}s`,
    pct: `${pct.toFixed(2)}%`,
    burnLabel: asset.burnTime ? dur(asset.burnTime) : "-",
    doubleBurnLabel: asset.burnTime ? dur(asset.burnTime * 2) : "-",
    burnSeconds: asset.burnTime ? `${asset.burnTime}s` : "-",
    sinceProof: asset.lastAttestedAt > 0 ? ago(age) : "-",
    lastAttestedAt: asset.lastAttestedAt > 0 ? String(asset.lastAttestedAt) : "-",
    tier: asset.burnTime ? tierOf(asset.burnTime) : "Not underwritten",
    grade: memo?.grade ?? "-",
    issuer: asset.issuer,
    issuerShort: short(asset.issuer),
    tradable: phase === "bright" || phase === "dimming",
    memo,
  };
}

export function counts(list: Derived[]) {
  return {
    live: list.filter((a) => a.phase === "bright").length,
    degraded: list.filter((a) => a.phase === "dimming").length,
    stale: list.filter((a) => a.phase !== "bright" && a.phase !== "dimming").length,
  };
}
