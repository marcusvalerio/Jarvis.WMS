import Link from "next/link";
import type { StageSnapshot } from "@/domain/services/kpi";

/**
 * Fluxo operacional: RECEBIMENTO -> ARMAZENAGEM -> PICKING -> ... -> EXPEDICAO.
 * Cada etapa e processo + volume (em execucao agora) + estado (pendente/concluido),
 * ligadas por uma linha continua — nao sao cards repetidos.
 */
const STAGE_HREF: Record<string, string> = {
  Recebimento: "/receiving",
  Armazenagem: "/warehouse/storage",
  Picking: "/picking",
  Packing: "/packing",
  Conferencia: "/shipping/checks",
  Carregamento: "/shipping/loading",
  Expedicao: "/shipping",
};

export function OperationalFlow({ stages }: { stages: StageSnapshot[] }) {
  return (
    <div className="flex items-stretch overflow-x-auto">
      {stages.map((s, i) => {
        const total = s.pending + s.running + s.done;
        const bottleneck = total > 0 && s.pending > s.running + s.done;
        return (
          <div key={s.stage} className="flex items-stretch flex-1 min-w-[104px]">
            <Link
              href={STAGE_HREF[s.stage] ?? "/operations"}
              className="flex-1 min-w-0 px-3.5 py-3 rounded-lg hover:bg-elevated transition-colors"
            >
              <p className="eyebrow truncate">{s.stage}</p>
              <p
                className={`mt-1.5 text-[27px] leading-none font-[family-name:var(--font-display)] font-semibold tnum ${
                  bottleneck ? "text-warning-fg" : s.running > 0 ? "text-accent-fg" : "text-primary"
                }`}
              >
                {s.running}
              </p>
              <p className="text-[11px] text-faint mt-1.5 truncate">
                {s.pending} pendente{s.pending === 1 ? "" : "s"} · {s.done} concluido{s.done === 1 ? "" : "s"}
              </p>
            </Link>
            {i < stages.length - 1 && <span className="w-px bg-border self-stretch my-3.5" aria-hidden />}
          </div>
        );
      })}
    </div>
  );
}
