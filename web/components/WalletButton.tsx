"use client";

import { useCallback, useEffect, useState } from "react";
import { CHAIN_ID_HEX, CHAIN_PARAMS } from "@/lib/chain";
import { shortAddress } from "@/lib/format";

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
};

function injected(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: Eip1193 }).ethereum ?? null;
}

export function WalletButton() {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState(true);

  useEffect(() => {
    const eth = injected();
    if (!eth) {
      setHasWallet(false);
      return;
    }

    // Reflect an already-connected wallet without prompting.
    eth.request({ method: "eth_accounts" }).then((accts) => {
      const list = accts as string[];
      if (list.length > 0) setAddress(list[0]);
    });
    eth.request({ method: "eth_chainId" }).then((id) => setChainId(id as string));

    const onAccounts = (accts: string[]) => setAddress(accts[0] ?? null);
    const onChain = (id: string) => setChainId(id);
    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    const eth = injected();
    if (!eth) return;
    setBusy(true);
    setError(null);
    try {
      const accts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      setAddress(accts[0] ?? null);
      setChainId((await eth.request({ method: "eth_chainId" })) as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const switchChain = useCallback(async () => {
    const eth = injected();
    if (!eth) return;
    setBusy(true);
    setError(null);
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
    } catch (e) {
      // 4902 = chain unknown to the wallet. Offer to add it rather than dead-ending.
      if ((e as { code?: number }).code === 4902) {
        try {
          await eth.request({ method: "wallet_addEthereumChain", params: [CHAIN_PARAMS] });
        } catch (addErr) {
          setError(addErr instanceof Error ? addErr.message : "Could not add BOT Chain");
        }
      } else {
        setError(e instanceof Error ? e.message : "Could not switch network");
      }
    } finally {
      setBusy(false);
    }
  }, []);

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

  if (chainId && chainId.toLowerCase() !== CHAIN_ID_HEX) {
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
    <span className={`${base} border-line bg-panel`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ember" />
      <span className="tnum">{shortAddress(address)}</span>
    </span>
  );
}
