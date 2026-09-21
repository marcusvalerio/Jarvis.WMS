import { TONE_STROKE } from "./tone";

export interface BarItem {
  label: string;
  value: number | null;
  display: string;
  sample?: string;
}

/**
 * Comparacao de magnitude entre categorias: "qual e maior/menor?".
 * A maior barra (o gargalo) recebe o tom de atencao — nao e decorativo,
 * e o mesmo sinal semantico usado no resto do produto.
 */
export function HorizontalBars({ items }: { items: BarItem[] }) {
  const known = items.filter((i): i is BarItem & { value: number } => i.value !== null);
  const max = Math.max(1, ...known.map((i) => i.value));
  const bottleneck = known.length
    ? known.reduce((a, b) => (b.value > a.value ? b : a)).label
    : null;

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        const pct = item.value === null ? 0 : Math.max(2, (item.value / max) * 100);
        const isBottleneck = item.label === bottleneck && item.value !== null;
        return (
          <li key={item.label}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span className="text-[12.5px] text-primary truncate">{item.label}</span>
              <span className="text-[12.5px] tnum flex-none">
                {item.value === null ? <span className="text-faint">sem dados</span> : (
                  <span className="text-primary font-medium">{item.display}</span>
                )}
              </span>
            </div>
            <div className="h-[7px] bg-border-soft w-full" aria-hidden>
              <div
                className="h-full"
                style={{
                  width: `${pct}%`,
                  background: item.value === null ? "var(--color-border-strong)" : TONE_STROKE[isBottleneck ? "warning" : "accent"],
                }}
              />
            </div>
            {item.sample && <p className="text-[10.5px] text-faint mt-1">{item.sample}</p>}
          </li>
        );
      })}
    </ul>
  );
}
