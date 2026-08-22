import Image from "next/image";
import Link from "next/link";
import { EXPLORER, CONTRACTS, GITHUB_URL, CHAIN_ID } from "@/lib/chain";
import { short } from "@/lib/derive";

const NETWORK_LABEL = CHAIN_ID === 677 ? "MAINNET 677" : `TESTNET ${CHAIN_ID}`;

export function Footer() {
  return (
    <footer className="bg-ink text-paper">
      <div className="mx-auto max-w-shell px-4 pb-12 pt-16 sm:px-8">
        <div className="grid gap-14 md:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <div className="mb-[18px] flex items-center gap-[11px]">
              <Image
                src="/ember-mark.png"
                alt=""
                width={60}
                height={15}
                className="h-[15px] w-auto invert"
              />
              <span className="text-xs font-bold uppercase tracking-[0.22em]">Ember</span>
            </div>
            <p className="max-w-[26em] text-sm leading-relaxed text-ink-muted">
              Track: RWA Applications. AI is the origination and risk-parameterization engine.
              Domains are the first instance, not the product.
            </p>
          </div>

          <div className="font-mono text-xs leading-[2.1]">
            <div className="mb-2.5 text-[10px] tracking-[0.12em] text-muted">
              CONTRACTS · {NETWORK_LABEL}
            </div>
            {CONTRACTS.map(({ name, address }) => (
              <div key={name}>
                <span className="text-muted">{name}</span>{" "}
                {address ? (
                  <a
                    href={`${EXPLORER}/address/${address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="border-b border-[#3A3A34] text-paper transition-colors ease-brand hover:border-ember hover:text-ember"
                  >
                    {short(address)} ↗
                  </a>
                ) : (
                  // Never a plausible-looking placeholder address — an undeployed contract
                  // says so.
                  <span className="text-out">not deployed</span>
                )}
              </div>
            ))}
          </div>

          <div className="font-mono text-xs leading-[2.1]">
            <div className="mb-2.5 text-[10px] tracking-[0.12em] text-muted">SOURCE</div>
            <div>
              <Link
                href="/docs"
                className="border-b border-[#3A3A34] text-paper transition-colors ease-brand hover:border-ember hover:text-ember"
              >
                Docs
              </Link>
            </div>
            <div>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="border-b border-[#3A3A34] text-paper transition-colors ease-brand hover:border-ember hover:text-ember"
              >
                GitHub ↗
              </a>
            </div>
            <div>
              <a
                href={EXPLORER}
                target="_blank"
                rel="noreferrer"
                className="border-b border-[#3A3A34] text-paper transition-colors ease-brand hover:border-ember hover:text-ember"
              >
                scan.botchain.ai ↗
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-ink-line pt-6 font-mono text-[11px] text-muted sm:flex-row sm:justify-between">
          <span>An ember dies unless it is fed.</span>
          <span>State is a pure function of time since the last valid proof.</span>
        </div>
      </div>
    </footer>
  );
}
