"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/list", label: "List a domain" },
  { href: "/docs", label: "Docs" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <div className="sticky top-0 z-30 border-b border-line bg-paper/[0.92] backdrop-blur">
      <div className="mx-auto flex max-w-shell flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:h-16 sm:flex-nowrap sm:gap-9 sm:px-8 sm:py-0">
        <Link
          href="/"
          className="order-1 flex items-center gap-[11px] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-4 focus-visible:ring-offset-paper"
        >
          <Image src="/ember-mark.png" alt="" width={60} height={15} className="h-[15px] w-auto" priority />
          <span className="text-xs font-bold uppercase tracking-[0.22em]">Ember</span>
        </Link>

        <nav className="order-3 flex basis-full items-center gap-4 overflow-x-auto text-[12px] font-medium sm:order-2 sm:basis-auto sm:gap-[26px] sm:text-[13px]">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 border-b pb-0.5 transition-colors ease-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-4 focus-visible:ring-offset-paper ${
                  active ? "border-ink" : "border-transparent hover:border-ink"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="order-4 hidden flex-1 sm:block" />

        <div className="order-2 ml-auto sm:order-5 sm:ml-0">
          <WalletButton />
        </div>
      </div>
    </div>
  );
}
