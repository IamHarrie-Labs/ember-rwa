import type { Memo } from "./derive";

/// Written by `agent/lib/publish.js`. Served as static files so a reader can curl them
/// directly rather than through an API that could shape what they see.
export const EVIDENCE_BASE = process.env.NEXT_PUBLIC_EVIDENCE_BASE || "/evidence";

export type CycleHealth = {
  lastAttestAt: string | null;
  /** Distinct transactions — a batched cycle is one. */
  attestations: number;
  /** Per-asset rows; higher than `attestations` whenever batching is working. */
  assetAttestations: number;
  failures: number;
  submissionFailures: number;
  last24h: { gas: string; transactions: number };
};

export type IndexEntry = {
  domain: string | null;
  grade?: string;
  burnTime?: number;
  engine?: string;
  evidenceHash?: string;
  memo?: string | null;
  history?: string;
  attestations?: number;
  lastAttestAt?: string | null;
};

export type EvidenceIndex = {
  updatedAt: string;
  cycle: CycleHealth;
  assets: Record<string, IndexEntry>;
};

export type TimelineRow = {
  at: string;
  observedAt: number | null;
  verdict: "valid" | "no proof";
  reasons: string[] | null;
  evidenceHash: string | null;
  txHash: string | null;
  block: number | null;
  gasUsed: string | null;
  batchSize: number | null;
};

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export const fetchIndex = () => getJson<EvidenceIndex>(`${EVIDENCE_BASE}/index.json`);

export const fetchMemo = (assetId: string) =>
  getJson<Memo>(`${EVIDENCE_BASE}/memos/${assetId}.json`);

export const fetchTimeline = (assetId: string) =>
  getJson<{ assetId: string; updatedAt: string; timeline: TimelineRow[] }>(
    `${EVIDENCE_BASE}/history/${assetId}.json`
  );

/// The index carries enough to label a card — domain, grade, burn time — without pulling
/// the full memo for every asset on the page.
export function indexToMemo(assetId: string, e: IndexEntry): Memo {
  return {
    assetId,
    domain: e.domain ?? "",
    grade: e.grade ?? "—",
    burnTime: e.burnTime ?? 0,
    engine: e.engine ?? "",
    evidenceHash: e.evidenceHash ?? "",
  };
}
