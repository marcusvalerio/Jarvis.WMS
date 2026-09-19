"use client";

import { useState, useTransition } from "react";
import { setTheme } from "@/app/actions/theme";
import { IconMoon, IconSun } from "@/components/ui/Icons";
import { THEMES, THEME_COLOR, THEME_HINT, THEME_LABEL, type Theme } from "@/domain/theme";

const ICON: Record<Theme, (p: { size?: number }) => React.ReactElement> = {
  light: IconSun,
  dark: IconMoon,
};

/**
 * Seletor de tema. A troca e aplicada no documento imediatamente, sem
 * recarregar a pagina; a persistencia no cookie acontece em segundo plano
 * para que o proximo carregamento ja renderize o tema certo no servidor.
 */
export function ThemeControl({
  theme, variant = "segmented",
}: {
  theme: Theme;
  variant?: "segmented" | "menu";
}) {
  const [current, setCurrent] = useState<Theme>(theme);
  const [, startTransition] = useTransition();

  function apply(next: Theme) {
    if (next === current) return;
    setCurrent(next);
    const root = document.documentElement;
    root.dataset.theme = next;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", THEME_COLOR[next]);
    startTransition(() => { void setTheme(next); });
  }

  if (variant === "menu") {
    return (
      <div className="flex items-center gap-1 p-1 rounded-md bg-bg border border-border" role="radiogroup" aria-label="Tema da interface">
        {THEMES.map((t) => {
          const Icon = ICON[t];
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={t === current}
              onClick={() => apply(t)}
              className={`flex-1 flex items-center justify-center gap-1.5 h-7 rounded text-[12px] transition-colors ${
                t === current
                  ? "bg-elevated-hover text-primary"
                  : "text-secondary hover:text-primary hover:bg-subtle"
              }`}
            >
              <Icon size={13} />
              {THEME_LABEL[t]}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="Tema da interface">
      {THEMES.map((t) => {
        const Icon = ICON[t];
        const on = t === current;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => apply(t)}
            className={`flex items-center gap-3 h-auto py-2.5 px-3 rounded-md border text-left transition-colors ${
              on
                ? "border-accent-line bg-accent-soft"
                : "border-border bg-bg hover:border-border-strong"
            }`}
          >
            <span
              className={`w-7 h-7 flex-none rounded flex items-center justify-center border ${
                on ? "border-accent-line text-accent-fg" : "border-border text-secondary"
              }`}
            >
              <Icon size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] text-primary">{THEME_LABEL[t]}</span>
              <span className="block text-[11.5px] text-secondary leading-snug">{THEME_HINT[t]}</span>
            </span>
            {on && <span className="w-1.5 h-1.5 rounded-full bg-accent flex-none" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
