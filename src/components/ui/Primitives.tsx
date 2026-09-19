import Link from "next/link";
import type { ReactNode } from "react";

// ------------------------------------------------------------------ cartao
export function Card({
  children, className = "", padded = true, elevated = false, id,
}: { children: ReactNode; className?: string; padded?: boolean; elevated?: boolean; id?: string }) {
  return (
    <section id={id} className={`${elevated ? "card-elevated" : "card"} ${padded ? "p-5" : ""} ${className}`}>
      {children}
    </section>
  );
}

export function CardHeader({
  title, subtitle, action, icon,
}: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-4 mb-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-primary flex items-center gap-2">
          {icon}
          {title}
        </h2>
        {subtitle && (
          <p className="text-[12.5px] text-secondary mt-0.5 font-[family-name:var(--font-editorial)]">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="flex-none flex items-center gap-2">{action}</div>}
    </header>
  );
}

// ------------------------------------------------------------ cabecalho de pagina
export function PageHeader({
  eyebrow, title, description, actions, meta,
}: {
  eyebrow?: string; title: string; description?: string;
  actions?: ReactNode; meta?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-5 mb-6">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="text-[26px] leading-tight font-semibold text-primary">{title}</h1>
        {description && (
          <p className="text-[13px] text-secondary mt-1.5 max-w-2xl font-[family-name:var(--font-editorial)]">
            {description}
          </p>
        )}
        {meta && <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-3">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

// ------------------------------------------------------------------ metrica
export function Metric({
  label, value, unit, hint, tone = "default", size = "md",
}: {
  label: string; value: ReactNode; unit?: string; hint?: string;
  tone?: "default" | "accent" | "success" | "warning" | "error" | "muted";
  size?: "sm" | "md" | "lg";
}) {
  const color = {
    default: "text-primary", accent: "text-accent-fg", success: "text-success-fg",
    warning: "text-warning-fg", error: "text-error-fg", muted: "text-faint",
  }[tone];
  const fontSize = { sm: "text-[19px]", md: "text-[26px]", lg: "text-[38px]" }[size];
  return (
    <div>
      <p className="label mb-1">{label}</p>
      <p className={`${fontSize} font-[family-name:var(--font-display)] font-semibold tnum leading-none ${color}`}>
        {value}
        {unit && <span className="text-[0.5em] font-medium text-secondary ml-1">{unit}</span>}
      </p>
      {hint && <p className="text-[11.5px] text-faint mt-1.5">{hint}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ vazio
export function EmptyState({
  title, description, action, icon,
}: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-11 h-11 rounded-lg border border-border bg-elevated flex items-center justify-center text-faint mb-4">
        {icon ?? <DotsIcon />}
      </div>
      <p className="text-[14px] font-medium text-primary">{title}</p>
      {description && <p className="text-[12.5px] text-secondary mt-1.5 max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="4" cy="9" r="1.4" fill="currentColor" />
      <circle cx="9" cy="9" r="1.4" fill="currentColor" />
      <circle cx="14" cy="9" r="1.4" fill="currentColor" />
    </svg>
  );
}

// ------------------------------------------------------------------ campos
export function Field({
  label, children, hint, required, className = "",
}: { label: string; children: ReactNode; hint?: string; required?: boolean; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label block mb-1.5">
        {label}
        {required && <span className="text-accent-fg ml-1">*</span>}
      </span>
      {children}
      {hint && <span className="block text-[11.5px] text-faint mt-1.5">{hint}</span>}
    </label>
  );
}

// ------------------------------------------------------------------ chips
export function IdChip({ id, href }: { id: string; href?: string }) {
  const chip = <span className="chip-id">{id}</span>;
  return href ? <Link href={href} className="hover:opacity-80">{chip}</Link> : chip;
}

export function MetaItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="label">{label}</span>
      <span className="text-[13px] text-primary tnum">{value}</span>
    </div>
  );
}

// ------------------------------------------------------------------ barra
export function Progress({
  value, max = 100, tone = "accent", height = 4, label = "Progresso",
}: { value: number; max?: number; tone?: "accent" | "success" | "warning" | "error" | "info"; height?: number; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const bg = {
    accent: "bg-accent", success: "bg-success", warning: "bg-warning",
    error: "bg-error", info: "bg-info",
  }[tone];
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="w-full rounded-full bg-border-soft overflow-hidden"
      style={{ height }}
    >
      <div className={`h-full rounded-full ${bg} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ------------------------------------------------------------------ tabela
export function TableWrap({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`card overflow-hidden ${className}`}>
      <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">{children}</div>
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 mb-3">
      <h3 className="text-[13px] font-semibold text-primary font-[family-name:var(--font-editorial)]">
        {children}
      </h3>
      {action}
    </div>
  );
}

/** Aviso obrigatorio nos documentos fiscais/tributarios simulados. */
export function SimulationNotice({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[10px] tracking-[0.18em] uppercase font-semibold ${className}`}>
      Documento simulado — uso academico
    </p>
  );
}
