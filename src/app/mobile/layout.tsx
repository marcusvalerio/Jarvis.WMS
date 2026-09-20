import Link from "next/link";
import type { Metadata } from "next";
import { ensureSeeded, getScenario } from "@/domain/services/simulation";
import { currentOperator } from "@/domain/context";
import { requireProfile } from "@/domain/guard";
import { IconArrowRight } from "@/components/ui/Icons";
import { Toaster } from "@/components/Toaster";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Coletora", template: "%s · Coletora" },
};

/**
 * Shell da coletora — deliberadamente diferente do desktop:
 * alvo unico por tela, texto grande, alto contraste e area de toque ampla.
 */
export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  await requireProfile();
  await ensureSeeded();
  const operator = await currentOperator();
  const scenario = await getScenario();

  return (
    <div className="min-h-dvh bg-bg flex flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur-md">
        <div className="max-w-[560px] mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/mobile" className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded-[5px] bg-accent flex items-center justify-center flex-none">
              <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
                <path d="M2 4.5 8 1.5l6 3v7l-6 3-6-3z" fill="none" stroke="var(--color-on-accent)" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M8 7.8v6.7M2 4.5l6 3.3 6-3.3" fill="none" stroke="var(--color-on-accent)" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="text-[14px] font-semibold font-[family-name:var(--font-display)]">WMS RF</span>
          </Link>

          <span className="flex items-center gap-1.5 ml-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success pulse-dot" aria-hidden />
            <span className="text-[11px] text-secondary font-[family-name:var(--font-editorial)]">
              conectado
            </span>
          </span>

          <span className="ml-auto text-right min-w-0">
            <span className="block text-[12.5px] text-primary truncate max-w-[140px]">{operator.name}</span>
            <span className="block text-[10.5px] text-faint">{operator.id} · {scenario?.id ?? "—"}</span>
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-[560px] w-full mx-auto px-4 py-5 fade-in">{children}</main>

      <footer className="border-t border-border">
        <div className="max-w-[560px] mx-auto px-4 h-12 flex items-center justify-between">
          <Link href="/mobile" className="text-[12.5px] text-secondary hover:text-primary">
            Menu de operacoes
          </Link>
          <Link href="/dashboard" className="text-[12.5px] text-faint hover:text-primary flex items-center gap-1.5">
            Desktop <IconArrowRight size={12} />
          </Link>
        </div>
      </footer>

      <Toaster />
    </div>
  );
}
