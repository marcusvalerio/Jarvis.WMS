import Link from "next/link";
import { fmtDateTime, fmtTime, fmtDate } from "@/lib/format";
import type { TraceNode } from "@/domain/services/traceability";

const DOT: Record<string, string> = {
  neutral: "bg-neutral", accent: "bg-accent", success: "bg-success",
  warning: "bg-warning", info: "bg-info", error: "bg-error",
};

/** Linha do tempo de rastreabilidade — cada no vem de um registro real. */
export function Timeline({ nodes, compact = false }: { nodes: TraceNode[]; compact?: boolean }) {
  if (nodes.length === 0) {
    return <p className="text-[12.5px] text-faint">Nenhum evento registrado ainda.</p>;
  }
  return (
    <ol className="relative">
      <span className="absolute left-[5px] top-2 bottom-2 w-px bg-border" aria-hidden />
      {nodes.map((n, i) => (
        <li key={`${n.at}-${i}`} className="relative pl-6 py-[7px]">
          <span
            className={`absolute left-0 top-[13px] w-[11px] h-[11px] rounded-full border-2 border-surface ${DOT[n.tone] ?? DOT.neutral}`}
            aria-hidden
          />
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="eyebrow">{n.stage}</span>
            <span className="text-[11px] text-faint tnum ml-auto" title={fmtDateTime(n.at)}>
              {compact ? fmtTime(n.at) : fmtDateTime(n.at)}
            </span>
          </div>
          <p className="text-[12.5px] text-primary mt-0.5 leading-snug">{n.title}</p>
          {n.detail && <p className="text-[11.5px] text-secondary mt-0.5 leading-snug">{n.detail}</p>}
        </li>
      ))}
    </ol>
  );
}
