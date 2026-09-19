"use client";

import Link from "next/link";
import { IconPrint, IconArrowRight } from "@/components/ui/Icons";

/** Barra de acoes visivel apenas na tela — some na impressao. */
export function PrintBar({
  title, backHref, backLabel = "Voltar", meta,
}: { title: string; backHref?: string; backLabel?: string; meta?: string }) {
  return (
    <div className="no-print sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur-md">
      <div className="flex items-center gap-3 h-14 px-4 lg:px-6 max-w-[210mm] mx-auto">
        {backHref && (
          <Link href={backHref} className="btn btn-sm btn-ghost">
            <IconArrowRight size={13} className="rotate-180" /> {backLabel}
          </Link>
        )}
        <div className="min-w-0">
          <p className="text-[13px] text-primary truncate font-medium">{title}</p>
          {meta && <p className="text-[11.5px] text-faint truncate">{meta}</p>}
        </div>
        <button type="button" className="btn btn-sm btn-primary ml-auto" onClick={() => window.print()}>
          <IconPrint size={13} /> Imprimir / salvar PDF
        </button>
      </div>
    </div>
  );
}
