"use client";

import { useWallet } from "@/lib/useWallet";
import { shortAddress } from "@/lib/format";

export function WalletButton() {
  const { address, onRightChain, hasWallet, busy, error, connect, switchChain, disconnect } = useWallet();

  // Square, mono, hairline — the design's chip, not a rounded app button.
  const base =
    "inline-flex min-h-10 items-center gap-2.5 border px-3.5 py-2 font-mono text-[11px] tracking-[0.06em] transition-colors ease-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-4 focus-visible:ring-offset-paper disabled:opacity-60";

  if (!hasWallet) {
    return (
      <a
        href="https://wallet.botchain.ai/"
        target="_blank"
        rel="noreferrer"
        className={`${base} border-line text-muted hover:border-ink hover:text-ink`}
      >
        GET A WALLET
      </a>
    );
  }

  if (!address) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={connect}
          disabled={busy}
          className={`${base} border-ink text-ink hover:bg-ink hover:text-paper`}
        >
          {busy ? "CONNECTING…" : "CONNECT WALLET"}
        </button>
        {error && <p className="max-w-xs text-right text-[11px] text-danger">{error}</p>}
      </div>
    );
  }

  if (!onRightChain) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={switchChain}
          disabled={busy}
          className={`${base} border-danger text-danger hover:bg-danger hover:text-paper`}
        >
          {busy ? "SWITCHING…" : "SWITCH TO BOT CHAIN"}
        </button>
        {error && <p className="max-w-xs text-right text-[11px] text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className={`${base} border-line bg-panel`}>
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ember" />
        <span className="tnum">{shortAddress(address)}</span>
      </span>
      <button
        onClick={disconnect}
        title="Disconnect"
        aria-label="Disconnect wallet"
        className={`${base} border-line px-2.5 text-muted hover:border-danger hover:text-danger`}
      >
        ✕
      </button>
    </div>
  );
}
