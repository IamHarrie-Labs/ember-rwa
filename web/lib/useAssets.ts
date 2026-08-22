"use client";

import { useEffect, useState } from "react";
import { fetchAssets, type Asset } from "./chain";
import { derive, type Derived, type Memo } from "./derive";
import { fetchIndex, indexToMemo, type EvidenceIndex } from "./evidence";

// One store shared by the nav and every page: a single chain read on an interval, a single
// 250ms clock, and one set of subscribers. Without this, the nav's live counts and the
// page's countdowns would each open their own polling loop.
type Snapshot = {
  status: "loading" | "ready" | "error";
  assets: Asset[];
  memos: Record<string, Memo | null>;
  index: EvidenceIndex | null;
  error: string | null;
  now: number;
};

const REFRESH_MS = 20_000;
const TICK_MS = 250;

let snapshot: Snapshot = {
  status: "loading",
  assets: [],
  memos: {},
  index: null,
  error: null,
  now: Date.now(),
};
const listeners = new Set<() => void>();
let started = false;

const emit = () => listeners.forEach((l) => l());

function set(patch: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...patch };
  emit();
}

/// The chain holds keccak(domain) and a burn time. The published index carries the plaintext
/// and the grade, so it is re-read alongside the chain rather than cached forever — the
/// agent republishes it on every cycle.
async function readIndex() {
  const index = await fetchIndex();
  if (!index) return;
  const memos: Record<string, Memo | null> = { ...snapshot.memos };
  for (const [assetId, entry] of Object.entries(index.assets)) {
    memos[assetId] = indexToMemo(assetId, entry);
  }
  set({ index, memos });
}

async function readChain() {
  try {
    set({ status: "ready", assets: await fetchAssets(), error: null });
  } catch (e) {
    set({
      status: "error",
      error: e instanceof Error ? e.message : "Could not reach BOT Chain",
    });
  }
}

async function read() {
  // Independent on purpose: the evidence index still renders when the RPC is down, and the
  // chain state still renders when the index is missing.
  await Promise.all([readChain(), readIndex()]);
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  read();
  setInterval(read, REFRESH_MS);
  setInterval(() => set({ now: Date.now() }), TICK_MS);
}

export function useAssets() {
  const [, force] = useState(0);

  useEffect(() => {
    start();
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const derived: Derived[] = snapshot.assets.map((a) =>
    derive(a, snapshot.memos[a.id] ?? null, snapshot.now)
  );

  return {
    status: snapshot.status,
    error: snapshot.error,
    now: snapshot.now,
    index: snapshot.index,
    cycle: snapshot.index?.cycle ?? null,
    assets: derived,
    /// The operator view sorts by urgency: whatever goes out first is at the top.
    byUrgency: [...derived].sort((x, y) => x.outAt - y.outAt),
    retry: read,
  };
}
