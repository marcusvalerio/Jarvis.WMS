"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV, isActive } from "./nav";
import { IconMenu, IconX } from "@/components/ui/Icons";

export interface NavCounts {
  incidents: number; picking: number; receiving: number; orders: number;
}

export function Sidebar({ counts }: { counts: NavCounts }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-5 py-4" aria-label="Navegacao principal">
      {NAV.map((group) => (
        <div key={group.label}>
          <p className="eyebrow px-3 mb-1.5">{group.label}</p>
          <ul className="flex flex-col gap-px">
            {group.items.map((item) => {
              const active = isActive(pathname, item);
              const count = item.badgeKey ? counts[item.badgeKey] : 0;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`group flex items-center gap-2.5 h-8 px-3 rounded-md text-[13px] transition-colors ${
                      active
                        ? "bg-elevated text-primary font-medium"
                        : "text-secondary hover:bg-elevated hover:text-primary"
                    }`}
                  >
                    <span
                      className={`flex-none transition-colors ${active ? "text-accent-fg" : "text-faint group-hover:text-secondary"}`}
                    >
                      <Icon size={15} />
                    </span>
                    <span className="truncate font-[family-name:var(--font-editorial)]">{item.label}</span>
                    {count > 0 && (
                      <span className="ml-auto tnum text-[10.5px] px-1.5 h-[17px] leading-[17px] rounded bg-neutral-line text-secondary">
                        {count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* alternador em telas estreitas */}
      <button
        type="button"
        className="btn btn-ghost lg:hidden fixed top-2.5 left-3 z-50 w-9 px-0"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
      >
        {open ? <IconX size={17} /> : <IconMenu size={17} />}
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-scrim/60 z-30 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-dvh w-[232px] flex-none border-r border-border bg-surface overflow-y-auto transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 h-14 px-4 border-b border-border sticky top-0 bg-surface z-10"
        >
          <span className="w-6 h-6 rounded-[5px] bg-accent flex items-center justify-center flex-none">
            <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
              <path d="M2 4.5 8 1.5l6 3v7l-6 3-6-3z" fill="none" stroke="var(--color-on-accent)" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M8 7.8v6.7M2 4.5l6 3.3 6-3.3" fill="none" stroke="var(--color-on-accent)" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold leading-none font-[family-name:var(--font-display)]">
              Jarvis WMS
            </span>
            <span className="block text-[10px] tracking-[0.14em] uppercase text-faint mt-1 font-[family-name:var(--font-editorial)]">
              Centro de distribuicao
            </span>
          </span>
        </Link>
        <div className="px-2">{nav}</div>
      </aside>
    </>
  );
}
