import { fmtTime } from "@/lib/format";

export interface Bucket {
  bucket: number; at: string; in: number; out: number; internal: number; total: number;
}

const SERIES = [
  { key: "in", label: "Entradas", color: "#B8FF3D" },
  { key: "out", label: "Saidas", color: "#62A8FF" },
  { key: "internal", label: "Internos", color: "#3A4245" },
] as const;

/**
 * Movimentacao de estoque por hora.
 * Barras empilhadas em CSS — cada segmento e a contagem REAL de movimentos
 * no periodo; nenhum valor e ilustrativo.
 */
export function MovementChart({ data, height = 140 }: { data: Bucket[]; height?: number }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-[12.5px] text-faint" style={{ height }}>
        Nenhuma movimentacao registrada.
      </div>
    );
  }
  const max = Math.max(1, ...data.map((d) => d.total));
  const empty = data.every((d) => d.total === 0);

  return (
    <figure>
      <div className="relative" style={{ height }}>
        {/* linhas de referencia */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" aria-hidden>
          {[0, 1, 2, 3].map((i) => <span key={i} className="h-px bg-border-soft" />)}
        </div>

        <ul className="relative h-full flex items-end gap-1" role="list">
          {data.map((d) => (
            <li
              key={d.bucket}
              className="flex-1 h-full flex flex-col justify-end gap-px group"
              title={`${fmtTime(d.at)} — entradas ${d.in}, saidas ${d.out}, internos ${d.internal}`}
            >
              {SERIES.map((s) => {
                const v = d[s.key];
                if (v <= 0) return null;
                return (
                  <span
                    key={s.key}
                    className="block rounded-[2px] transition-opacity group-hover:opacity-80"
                    style={{ height: `${(v / max) * 100}%`, background: s.color, minHeight: 2 }}
                  />
                );
              })}
              {d.total === 0 && <span className="block h-[2px] rounded-full bg-border-soft" />}
            </li>
          ))}
        </ul>

        {empty && (
          <p className="absolute inset-0 flex items-center justify-center text-[12px] text-faint">
            Sem movimentacao nas ultimas {data.length} horas.
          </p>
        )}
      </div>

      <div className="flex mt-1.5 text-[10px] text-faint tnum" aria-hidden>
        {data.map((d, i) => (
          <span key={d.bucket} className="flex-1 text-center">
            {i % 3 === 0 ? fmtTime(d.at) : ""}
          </span>
        ))}
      </div>

      <figcaption className="flex items-center gap-4 mt-3 text-[11px] text-secondary">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-[2px]" style={{ background: s.color }} aria-hidden />
            {s.label}
          </span>
        ))}
        <span className="ml-auto text-faint tnum">pico {max}/hora</span>
      </figcaption>
    </figure>
  );
}
