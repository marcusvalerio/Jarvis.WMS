import { TONE_STROKE, type ChartTone } from "./tone";

export interface DonutSegment {
  label: string;
  value: number;
  tone: ChartTone;
}

/**
 * Anel de composicao: "como esta distribuido?".
 * Segmentos com folga de 2px entre si (nunca encostados) e traco reto —
 * sem cantos arredondados, para nao competir com a identidade do produto.
 */
export function Donut({
  segments, size = 132, thickness = 15, centerValue, centerLabel,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerValue: string;
  centerLabel: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const gap = total > 0 ? Math.min(3, circumference * 0.01) : 0;

  let offset = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const len = total > 0 ? (s.value / total) * circumference : 0;
      const dash = Math.max(0, len - gap);
      const arc = { ...s, dash, gapRest: circumference - dash, rotate: (offset / circumference) * 360 };
      offset += len;
      return arc;
    });

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-none" role="img" aria-label={`${centerLabel}: ${centerValue}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border-soft)" strokeWidth={thickness} />
        {arcs.map((a, i) => (
          <circle
            key={i}
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke={TONE_STROKE[a.tone]} strokeWidth={thickness}
            strokeDasharray={`${a.dash} ${a.gapRest}`}
            strokeLinecap="butt"
            transform={`rotate(${a.rotate - 90} ${size / 2} ${size / 2})`}
          >
            <title>{`${a.label}: ${a.value}`}</title>
          </circle>
        ))}
        <text
          x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" fill="currentColor"
          className="text-primary font-[family-name:var(--font-display)] font-semibold"
          style={{ fontSize: size * 0.19 }}
        >
          {centerValue}
        </text>
        <text
          x="50%" y="65%" textAnchor="middle" dominantBaseline="middle" fill="currentColor"
          className="text-faint"
          style={{ fontSize: size * 0.07, letterSpacing: "0.04em" }}
        >
          {centerLabel}
        </text>
      </svg>

      <ul className="flex flex-col gap-1.5 min-w-0">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-[12px]">
            <span className="w-2.5 h-2.5 flex-none" style={{ background: TONE_STROKE[s.tone] }} aria-hidden />
            <span className="text-secondary truncate">{s.label}</span>
            <span className="ml-auto tnum text-primary flex-none pl-2">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
