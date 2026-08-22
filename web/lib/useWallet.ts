"use client";

import { useCallback, useEffect, useState } from "react";
import { CHAIN_ID_HEX, CHAIN_PARAMS } from "./chain";

export type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
};

export function injected(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: Eip1193 }).ethereum ?? null;
}

/// One connection shared by the nav button and any page that needs to sign a transaction
/// (claiming revenue, redeeming) — a single source of truth for who is connected and to
/// which chain, rather than each component tracking its own copy.
export function useWallet() {
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

  const onRightChain = !!chainId && chainId.toLowerCase() === CHAIN_ID_HEX;

  return { address, chainId, onRightChain, hasWallet, busy, error, setError, connect, switchChain };
}
