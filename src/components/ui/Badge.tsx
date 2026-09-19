import type { Tone } from "@/domain/states";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "badge-neutral",
  accent: "badge-accent",
  success: "badge-success",
  warning: "badge-warning",
  error: "badge-error",
  info: "badge-info",
};

export function Badge({
  tone = "neutral", children, dot = false, title,
}: {
  tone?: Tone; children: React.ReactNode; dot?: boolean; title?: string;
}) {
  return (
    <span className={`badge ${TONE_CLASS[tone]}`} title={title}>
      {dot && <span className="badge-dot" aria-hidden />}
      {children}
    </span>
  );
}

/** Badge derivado de um mapa de metadados de estado. */
export function StatusBadge({
  status, meta, dot = true,
}: {
  status: string;
  meta: Record<string, { label: string; tone: Tone; description?: string }>;
  dot?: boolean;
}) {
  const m = meta[status];
  if (!m) return <Badge tone="neutral">{status}</Badge>;
  return (
    <Badge tone={m.tone} dot={dot} title={m.description}>
      {m.label}
    </Badge>
  );
}
