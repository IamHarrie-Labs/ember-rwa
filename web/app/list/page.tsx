"use client";

import Link from "next/link";
import { useState } from "react";
import { BrowserProvider } from "ethers";
import { useWallet, injected } from "@/lib/useWallet";
import {
  readProvider,
  registry,
  KIND_DOMAIN,
  identifierOf,
  assetIdOf,
  DOMAIN_URI_PREFIX,
  controlMessage,
  txUrl,
} from "@/lib/chain";

type Step = "sign" | "publish" | "register" | "done";

export default function ListPage() {
  const wallet = useWallet();
  const [domain, setDomain] = useState("");
  const [step, setStep] = useState<Step>("sign");
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const cleanDomain = domain.trim().toLowerCase();
  const record = signature ? `ember=${signature}` : "";

  async function doSign() {
    if (!wallet.address) return;
    setBusy(true);
    setError(null);
    try {
      const assetId = assetIdOf(cleanDomain);
      const existing = await registry(readProvider()).getAsset(assetId);
      if (existing.issuer !== "0x0000000000000000000000000000000000000000") {
        throw new Error(`${cleanDomain} is already registered on-chain`);
      }
      const eth = injected();
      if (!eth) throw new Error("No wallet found");
      const sig = (await eth.request({
        method: "personal_sign",
        params: [controlMessage(cleanDomain, wallet.address), wallet.address],
      })) as string;
      setSignature(sig);
      setStep("publish");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signing failed");
    } finally {
      setBusy(false);
    }
  }

  async function doVerify() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/txt?domain=${encodeURIComponent(cleanDomain)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Lookup failed");
      const records: string[] = body.records || [];
      if (!records.includes(record)) {
        throw new Error("That TXT record isn't showing up yet — DNS can take a few minutes to propagate. Try again shortly.");
      }
      setStep("register");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function doRegister() {
    setBusy(true);
    setError(null);
    try {
      const eth = injected();
      if (!eth) throw new Error("No wallet found");
      const signer = await new BrowserProvider(eth as any).getSigner();
      const tx = await registry(signer).register(
        KIND_DOMAIN,
        identifierOf(cleanDomain),
        `${DOMAIN_URI_PREFIX}${cleanDomain}`
      );
      const receipt = await tx.wait();
      setTxHash(receipt.hash);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-shell px-4 pb-24 pt-14 sm:px-8">
      <header className="mb-12 max-w-[42em]">
        <p className="eyebrow mb-4">List a domain</p>
        <h1 className="text-[32px] font-bold leading-[1.05] tracking-[-0.03em] sm:text-[40px]">
          Prove control, register on-chain, no operator in between.
        </h1>
        <p className="mt-5 text-pretty text-[17px] leading-[1.6] text-body">
          Three steps: sign a message with your wallet, publish it as a DNS record, then
          register on-chain yourself. Underwriting runs automatically on the next cycle —
          typically within a few minutes.
        </p>
      </header>

      {!wallet.address ? (
        <div className="max-w-[32em] border border-dashed border-line p-8 text-[15px] leading-relaxed text-muted">
          Connect a wallet to start. That wallet becomes the issuer — the only address that
          can register this domain and later redeem or claim revenue against it.
          <button
            onClick={wallet.connect}
            className="mt-5 block border border-ink px-5 py-2.5 text-[13px] font-medium text-ink transition-colors ease-brand hover:bg-ink hover:text-paper"
          >
            Connect wallet
          </button>
        </div>
      ) : !wallet.onRightChain ? (
        <div className="max-w-[32em] border border-dashed border-danger p-8 text-[15px] leading-relaxed text-muted">
          Wrong network. Switch to BOT Chain to continue.
          <button
            onClick={wallet.switchChain}
            className="mt-5 block border border-danger px-5 py-2.5 text-[13px] font-medium text-danger transition-colors ease-brand hover:bg-danger hover:text-paper"
          >
            Switch to BOT Chain
          </button>
        </div>
      ) : (
        <div className="max-w-[42em]">
          <Field label="Domain" htmlFor="domain">
            <input
              id="domain"
              type="text"
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                setStep("sign");
                setSignature(null);
                setError(null);
              }}
              placeholder="example.com"
              disabled={step !== "sign"}
              className="w-full border border-line bg-paper px-4 py-3 font-mono text-[15px] outline-none focus:border-ink disabled:opacity-60"
            />
          </Field>

          <ol className="mt-10 flex flex-col gap-8">
            <StepRow n="01" label="Sign" done={step !== "sign"}>
              {step === "sign" && (
                <button
                  onClick={doSign}
                  disabled={busy || !cleanDomain}
                  className="border border-ink px-5 py-2.5 text-[13px] font-medium text-ink transition-colors ease-brand hover:bg-ink hover:text-paper disabled:opacity-60"
                >
                  {busy ? "Confirming…" : "Sign with wallet"}
                </button>
              )}
              {step !== "sign" && (
                <p className="text-[14px] text-muted">Signed by {short(wallet.address)}</p>
              )}
            </StepRow>

            <StepRow n="02" label="Publish the TXT record" done={step === "register" || step === "done"}>
              {signature && (
                <>
                  <p className="mb-3 text-[14px] leading-[1.6] text-body">
                    Add this exactly as a TXT record on <span className="font-mono">{cleanDomain}</span>{" "}
                    at your DNS provider, then verify.
                  </p>
                  <pre className="mb-4 overflow-x-auto border border-line bg-panel px-4 py-3 font-mono text-[12px]">
                    {record}
                  </pre>
                  {step === "publish" && (
                    <button
                      onClick={doVerify}
                      disabled={busy}
                      className="border border-ink px-5 py-2.5 text-[13px] font-medium text-ink transition-colors ease-brand hover:bg-ink hover:text-paper disabled:opacity-60"
                    >
                      {busy ? "Checking…" : "I've published it — verify"}
                    </button>
                  )}
                  {(step === "register" || step === "done") && (
                    <p className="text-[14px] text-muted">Verified — the record matches your signature.</p>
                  )}
                </>
              )}
            </StepRow>

            <StepRow n="03" label="Register on-chain" done={step === "done"}>
              {step === "register" && (
                <button
                  onClick={doRegister}
                  disabled={busy}
                  className="border border-ink px-5 py-2.5 text-[13px] font-medium text-ink transition-colors ease-brand hover:bg-ink hover:text-paper disabled:opacity-60"
                >
                  {busy ? "Confirming…" : "Register"}
                </button>
              )}
              {step === "done" && txHash && (
                <div className="text-[14px] leading-[1.7] text-body">
                  <p className="mb-2">
                    Registered.{" "}
                    <a
                      href={txUrl(txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="border-b border-line font-mono text-[13px] transition-colors ease-brand hover:border-ember hover:text-ember"
                    >
                      view transaction ↗
                    </a>
                  </p>
                  <p className="text-muted">
                    Underwriting runs on the next proof cycle. Check{" "}
                    <Link
                      href={`/asset/${assetIdOf(cleanDomain)}`}
                      className="border-b border-line transition-colors ease-brand hover:border-ember hover:text-ember"
                    >
                      this asset&apos;s page
                    </Link>{" "}
                    in a few minutes.
                  </p>
                </div>
              )}
            </StepRow>
          </ol>

          {error && <p className="mt-6 font-mono text-[13px] text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block font-mono text-[11px] tracking-[0.1em] text-muted">
        {label.toUpperCase()}
      </label>
      {children}
    </div>
  );
}

function StepRow({
  n,
  label,
  done,
  children,
}: {
  n: string;
  label: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[32px_1fr] gap-4">
      <span
        className={`font-mono text-[11px] ${done ? "text-ember" : "text-muted"}`}
        aria-hidden="true"
      >
        {done ? "✓" : n}
      </span>
      <div>
        <p className="mb-2.5 text-[15px] font-medium">{label}</p>
        {children}
      </div>
    </li>
  );
}

function short(addr: string | null) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
