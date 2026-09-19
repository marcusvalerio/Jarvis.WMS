import { fmtNumber } from "@/lib/format";
import { kpiTone, type Kpi } from "@/domain/services/kpi";

const TONE = {
  good:  { text: "text-success", bar: "bg-success", label: "dentro da meta" },
  warn:  { text: "text-warning", bar: "bg-warning", label: "em atencao" },
  bad:   { text: "text-error",   bar: "bg-error",   label: "fora da meta" },
  muted: { text: "text-faint",   bar: "bg-border",  label: "sem base de calculo" },
} as const;

export function KpiCard({ kpi, featured = false }: { kpi: Kpi; featured?: boolean }) {
  const tone = TONE[kpiTone(kpi)];
  const hasValue = kpi.value !== null;

  // Posicao do valor dentro da faixa boa/ruim, apenas para a barra.
  let fill = 0;
  if (hasValue && kpi.target) {
    const { good, warn, direction } = kpi.target;
    const span = Math.abs(good - warn) * 2 || 1;
    fill = direction === "higher"
      ? Math.max(0, Math.min(1, (kpi.value! - (warn - span / 2)) / span))
      : Math.max(0, Math.min(1, ((warn + span / 2) - kpi.value!) / span));
  }

  return (
    <article className="card p-4 flex flex-col justify-between min-h-[118px]" title={kpi.hint}>
      <div className="flex items-start justify-between gap-2">
        <p className="label leading-snug">{kpi.label}</p>
        <span
          role="img"
          className={`w-1.5 h-1.5 rounded-full flex-none mt-1 ${tone.bar}`}
          aria-label={`Indicador ${tone.label}`}
          title={tone.label}
        />
      </div>

      <div className="mt-3">
        {hasValue ? (
          <p className={`font-[family-name:var(--font-display)] font-semibold tnum leading-none ${featured ? "text-[38px]" : "text-[28px]"} ${tone.text}`}>
            {fmtNumber(kpi.value!, kpi.unit === "%" ? 1 : kpi.value! >= 100 ? 0 : 1)}
            {kpi.unit && <span className="text-[0.42em] font-medium text-secondary ml-1">{kpi.unit}</span>}
          </p>
        ) : (
          <p className="text-[19px] text-faint font-[family-name:var(--font-display)] leading-none">
            sem dados
          </p>
        )}

        {kpi.target && hasValue && (
          <div className="h-[3px] rounded-full bg-border-soft overflow-hidden mt-3" aria-hidden>
            <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${fill * 100}%` }} />
          </div>
        )}

        <p className="text-[11px] text-faint mt-2 truncate" title={kpi.sample}>
          {kpi.sample}
        </p>
      </div>
    </article>
  );
}
