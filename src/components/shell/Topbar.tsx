"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CommandMenu } from "./CommandMenu";
import { signOutAction } from "@/app/actions/auth";
import { IconChevron, IconScan, IconLogout } from "@/components/ui/Icons";
import { ThemeControl } from "@/components/ThemeControl";
import type { Theme } from "@/domain/theme";
import type { Profile } from "@/domain/auth";

export function Topbar({
  operator, profile, theme, scenario,
}: {
  operator: { id: string; name: string };
  profile: Profile;
  theme: Theme;
  scenario: { id: string; name: string; status: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <header className="sticky top-0 z-20 h-14 flex-none border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="h-full flex items-center gap-3 px-4 lg:px-6 pl-14 lg:pl-6">
        {scenario && (
          <div className="hidden md:flex items-center gap-2 h-7 px-2.5 rounded-md border border-border bg-surface">
            <span className="w-1.5 h-1.5 rounded-full bg-accent pulse-dot" aria-hidden />
            <span className="text-[11.5px] text-secondary font-[family-name:var(--font-editorial)]">
              {scenario.id}
            </span>
            <span className="text-[11.5px] text-faint hidden xl:inline truncate max-w-[220px]">
              {scenario.name}
            </span>
          </div>
        )}

        <div className="flex-1" />

        <Link href="/mobile" className="btn btn-sm btn-ghost hidden sm:inline-flex" title="Interface da coletora">
          <IconScan size={14} />
          Coletora
        </Link>

        <CommandMenu />

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 h-8 pl-1.5 pr-2 rounded-md border border-border bg-surface hover:border-border-strong transition-colors"
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={pending}
          >
            <span className="w-[22px] h-[22px] rounded bg-elevated border border-border flex items-center justify-center text-[10px] font-semibold text-accent-fg tnum">
              {initials(operator.name)}
            </span>
            <span className="text-[12.5px] text-primary hidden sm:block max-w-[120px] truncate">
              {operator.name}
            </span>
            <span className="text-faint"><IconChevron size={13} className="rotate-90" /></span>
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
              <div
                className="absolute right-0 top-10 z-20 w-60 card-elevated p-1.5 shadow-2xl"
                role="menu"
              >
                <p className="eyebrow px-2.5 py-1.5">Voce esta operando como</p>
                <div className="px-2.5 pb-2">
                  <p className="text-[13px] text-primary leading-tight">{profile.name}</p>
                  <p className="text-[11.5px] text-secondary leading-snug mt-0.5">
                    {profile.jobTitle ?? profile.role}
                    {profile.sector ? ` · ${profile.sector}` : ""}
                  </p>
                  <p className="text-[11px] text-faint leading-snug mt-1">
                    {profile.email}
                  </p>
                  <p className="text-[11px] text-faint leading-snug">
                    <span className="chip-id">{profile.operatorId}</span>
                  </p>
                </div>

                <div className="hr my-1.5" />
                <p className="eyebrow px-2.5 py-1.5">Tema da interface</p>
                <div className="px-1.5 pb-1.5">
                  <ThemeControl theme={theme} variant="menu" />
                </div>
                <div className="hr my-1.5" />
                <p className="px-2.5 py-1 text-[11px] text-faint leading-relaxed">
                  Toda movimentacao e conferencia fica registrada em auditoria no seu nome.
                </p>
                <div className="hr my-1.5" />
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="w-full flex items-center gap-2.5 px-2.5 h-9 rounded-md text-left text-[12.5px] text-error-fg hover:bg-error-soft transition-colors"
                  >
                    <IconLogout size={14} />
                    Sair do sistema
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}
