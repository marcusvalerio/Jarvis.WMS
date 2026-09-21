"use client";

import { useRef, useState } from "react";
import { fmtTime, fmtNumber } from "@/lib/format";

export interface Bucket {
  bucket: number; at: string; in: number; out: number; internal: number; total: number;
}

const SERIES = [
  { key: "in", label: "Entradas", css: "var(--color-chart-in)" },
  { key: "out", label: "Saidas", css: "var(--color-chart-out)" },
  { key: "internal", label: "Internos", css: "var(--color-chart-internal)" },
] as const;

const W = 640;
const H = 168;
const PAD_X = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;

/**
 * Tendencia de movimentacao: "o que mudou ao longo do tempo?".
 * Linhas finas por tipo de movimento, eventos reais do cenario —
 * nenhum ponto e interpolado ou fabricado.
 */
export function MovementTrend({ data }: { data: Bucket[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-[12.5px] text-faint" style={{ height: H }}>
        Nenhuma movimentacao registrada.
      </div>
    );
  }

  const max = Math.max(1, ...data.map((d) => Math.max(d.in, d.out, d.internal)));
  const empty = data.every((d) => d.total === 0);
  const plotW = W - PAD_X * 2;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const step = data.length > 1 ? plotW / (data.length - 1) : 0;

  const xAt = (i: number) => PAD_X + i * step;
  const yAt = (v: number) => PAD_TOP + (1 - v / max) * plotH;

  const lineFor = (key: "in" | "out" | "internal") =>
    data.map((d, i) => `${xAt(i).toFixed(1)},${yAt(d[key]).toFixed(1)}`).join(" ");

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = ref.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round((relX - PAD_X) / (step || 1));
    setHover(Math.max(0, Math.min(data.length - 1, idx)));
  }

  const active = hover !== null ? data[hover] : null;
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <figure>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: H }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Movimentacao de estoque por hora"
      >
        {gridLines.map((g) => (
          <line
            key={g} x1={PAD_X} x2={W - PAD_X} y1={PAD_TOP + g * plotH} y2={PAD_TOP + g * plotH}
            stroke="var(--color-border-soft)" strokeWidth={1}
          />
        ))}

        {empty ? (
          <text x={W / 2} y={H / 2} textAnchor="middle" fill="currentColor" className="text-faint" style={{ fontSize: 12 }}>
            Sem movimentacao nas ultimas {data.length} horas.
          </text>
        ) : (
          <>
            {SERIES.map((s) => (
              <polyline
                key={s.key}
                points={lineFor(s.key)}
                fill="none"
                stroke={s.css}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}

            {hover !== null && (
              <line
                x1={xAt(hover)} x2={xAt(hover)} y1={PAD_TOP} y2={PAD_TOP + plotH}
                stroke="var(--color-border-strong)" strokeWidth={1} strokeDasharray="2 2"
              />
            )}
            {hover !== null && SERIES.map((s) => (
              <circle key={s.key} cx={xAt(hover)} cy={yAt(data[hover][s.key])} r={3} fill={s.css} />
            ))}
          </>
        )}

        {data.map((d, i) => (
          i % 3 === 0 && (
            <text
              key={d.bucket} x={xAt(i)} y={H - 6} textAnchor="middle" fill="currentColor"
              className="text-faint tnum" style={{ fontSize: 10 }}
            >
              {fmtTime(d.at)}
            </text>
          )
        ))}
      </svg>

      {active && (
        <div className="flex items-center gap-4 mt-1 px-1 text-[11.5px] tnum" aria-hidden>
          <span className="text-faint">{fmtTime(active.at)}</span>
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="w-2 h-2" style={{ background: s.css }} />
              <span className="text-secondary">{s.label.slice(0, 3)}</span>
              <span className="text-primary font-medium">{fmtNumber(active[s.key])}</span>
            </span>
          ))}
        </div>
      )}

      <figcaption className="flex items-center gap-4 mt-2.5 text-[11px] text-secondary">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="w-2 h-2" style={{ background: s.css }} aria-hidden />
            {s.label}
          </span>
        ))}
        <span className="ml-auto text-faint tnum">pico {max}/hora</span>
      </figcaption>
    </figure>
  );
}
