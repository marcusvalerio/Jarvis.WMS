/**
 * Paleta compartilhada dos graficos do Dashboard.
 * Usa exclusivamente os tokens semanticos ja existentes no design system
 * (globals.css) — nenhuma cor nova e introduzida aqui.
 */
export type ChartTone = "accent" | "success" | "warning" | "error" | "info" | "neutral";

export const TONE_STROKE: Record<ChartTone, string> = {
  accent: "var(--color-accent)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  error: "var(--color-error)",
  info: "var(--color-info)",
  neutral: "var(--color-neutral)",
};

export const TONE_FG: Record<ChartTone, string> = {
  accent: "text-accent-fg",
  success: "text-success-fg",
  warning: "text-warning-fg",
  error: "text-error-fg",
  info: "text-info-fg",
  neutral: "text-faint",
};
