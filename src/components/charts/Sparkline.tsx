import { TONE_STROKE, type ChartTone } from "./tone";

/**
 * Mini-tendencia: "subiu ou caiu ao longo do periodo?" — sem eixos, sem
 * rotulos por ponto. Complementa um numero grande, nunca substitui um
 * grafico completo.
 */
export function Sparkline({
  values, tone = "accent", width = 132, height = 36,
}: { values: number[]; tone?: ChartTone; width?: number; height?: number }) {
  if (values.length < 2) {
    return <div style={{ width, height }} className="flex items-center text-[11px] text-faint">sem serie</div>;
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pad = 3;
  const step = (width - pad * 2) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;
  const stroke = TONE_STROKE[tone];
  const last = points[points.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tendencia no periodo">
      <polygon points={area} fill={stroke} opacity={0.08} />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={stroke} />
    </svg>
  );
}
