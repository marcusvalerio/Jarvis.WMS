"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions/result";
import { IconScan, IconCheck, IconAlert, IconArrowRight } from "@/components/ui/Icons";
import { CameraScanner } from "@/components/rf/CameraScanner";

/**
 * INTERFACE DA COLETORA.
 * A coletora USB se comporta como teclado (HID): digita o codigo e envia
 * Enter. O campo abaixo mantem o foco permanentemente, de modo que basta
 * apontar e bipar — sem cliques, sem navegacao.
 */
export function ScanField({
  label, placeholder, name = "code", autoFocus = true, disabled,
}: {
  label: string; placeholder: string; name?: string; autoFocus?: boolean; disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const { pending } = useFormStatus();
  const [cameraOpen, setCameraOpen] = useState(false);

  // Mantem o foco no campo — o leitor digita onde o cursor estiver.
  useEffect(() => {
    if (disabled || !autoFocus) return;
    const el = ref.current;
    el?.focus();
    const keep = () => { if (document.activeElement !== el) el?.focus(); };
    const t = setInterval(keep, 700);
    window.addEventListener("click", keep);
    return () => { clearInterval(t); window.removeEventListener("click", keep); };
  }, [disabled, autoFocus, pending]);

  const handleCameraDetected = (value: string) => {
    const input = ref.current;
    if (!input) return;
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    setCameraOpen(false);
    input.form?.requestSubmit();
  };

  return (
    <>
      <label className="block">
        <span className="block text-[13px] tracking-[0.06em] uppercase text-secondary mb-2.5 font-[family-name:var(--font-editorial)]">
          {label}
        </span>
        <span className="relative block">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-accent-fg pointer-events-none">
            <IconScan size={24} />
          </span>
          <input
            ref={ref}
            name={name}
            className="w-full h-16 pl-14 pr-4 rounded-xl bg-bg border-2 border-border focus:border-accent outline-none
                       text-[22px] tracking-[0.04em] text-primary placeholder:text-faint font-[family-name:var(--font-mono)]"
            placeholder={placeholder}
            autoComplete="off" spellCheck={false} disabled={disabled || pending} required
            inputMode="text"
          />
        </span>
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          disabled={disabled || pending}
          className="mt-2.5 h-11 w-full rounded-lg border border-border text-[13px] font-medium text-secondary
                     hover:bg-elevated-hover disabled:opacity-40 flex items-center justify-center gap-2"
        >
          <IconScan size={16} />
          Ler com camera
        </button>
      </label>
      {cameraOpen && (
        <CameraScanner
          onDetected={handleCameraDetected}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </>
  );
}

export function RfButton({
  children, className = "rf-primary", pendingLabel = "PROCESSANDO…", disabled, type = "submit",
  onClick,
}: {
  children: React.ReactNode; className?: string; pendingLabel?: string;
  disabled?: boolean; type?: "submit" | "button"; onClick?: () => void;
}) {
  const { pending } = useFormStatus();
  const base = "w-full h-14 rounded-xl text-[16px] font-semibold tracking-[0.03em] uppercase transition-colors disabled:opacity-40";
  const styles: Record<string, string> = {
    "rf-primary": "bg-accent text-on-accent hover:bg-accent-hover",
    "rf-secondary": "bg-elevated border border-border text-primary hover:bg-elevated-hover",
    "rf-danger": "bg-rf-danger-bg border border-rf-danger-line text-error-fg hover:bg-rf-danger-hover",
  };
  return (
    <button
      type={type} onClick={onClick} disabled={disabled || (type === "submit" && pending)}
      className={`${base} ${styles[className] ?? styles["rf-primary"]}`}
    >
      {type === "submit" && pending ? pendingLabel : children}
    </button>
  );
}

/** Painel de resultado — grande, legivel a distancia. */
export function RfResult({ state }: { state: ActionState }) {
  if (!state.error && !state.message) return null;
  const bad = !!state.error;
  return (
    <div
      role="status"
      aria-live="assertive"
      className={`scan-flash rounded-xl border-2 p-4 flex items-start gap-3 ${
        bad ? "border-error bg-rf-bad-bg" : "border-success bg-success-soft"
      }`}
    >
      <span className={`flex-none mt-0.5 ${bad ? "text-error-fg" : "text-success-fg"}`}>
        {bad ? <IconAlert size={22} /> : <IconCheck size={22} />}
      </span>
      <p className={`text-[16px] leading-snug font-medium ${bad ? "text-error-fg" : "text-success-fg"}`}>
        {state.error ?? state.message}
      </p>
    </div>
  );
}

export function RfPanel({
  eyebrow, title, subtitle, children, tone = "neutral",
}: {
  eyebrow?: string; title: React.ReactNode; subtitle?: React.ReactNode;
  children?: React.ReactNode; tone?: "neutral" | "accent" | "warning";
}) {
  const border = {
    neutral: "border-border", accent: "border-accent/40", warning: "border-warning/40",
  }[tone];
  return (
    <section className={`rounded-xl border-2 ${border} bg-surface p-5`}>
      {eyebrow && (
        <p className="text-[11px] tracking-[0.16em] uppercase text-faint mb-2 font-[family-name:var(--font-editorial)]">
          {eyebrow}
        </p>
      )}
      <p className="text-[30px] leading-none font-[family-name:var(--font-display)] font-semibold text-primary break-words">
        {title}
      </p>
      {subtitle && <p className="text-[15px] text-secondary mt-2.5 leading-snug">{subtitle}</p>}
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

export function RfRow({ label, value, big = false }: { label: string; value: React.ReactNode; big?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 border-b border-border last:border-0">
      <span className="text-[12px] tracking-[0.08em] uppercase text-faint font-[family-name:var(--font-editorial)]">
        {label}
      </span>
      <span className={`${big ? "text-[26px] font-semibold" : "text-[16px]"} text-primary tnum text-right`}>
        {value}
      </span>
    </div>
  );
}

/** Indicador de passo da operacao. */
export function RfSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex gap-2" aria-label="Etapas">
      {steps.map((s, i) => (
        <li
          key={s}
          className={`flex-1 rounded-lg border px-2.5 py-2 text-center ${
            i < current ? "border-success/40 bg-success-soft text-success-fg"
            : i === current ? "border-accent bg-accent/10 text-accent-fg"
            : "border-border text-faint"
          }`}
        >
          <span className="block text-[10px] tracking-[0.1em] uppercase font-[family-name:var(--font-editorial)]">
            {i + 1}
          </span>
          <span className="block text-[12px] mt-0.5 leading-tight">{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function RfLink({
  href, title, subtitle, badge,
}: { href: string; title: string; subtitle?: string; badge?: string | number }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 hover:border-accent/50 hover:bg-elevated transition-colors"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-medium text-primary">{title}</span>
        {subtitle && <span className="block text-[13px] text-secondary mt-1 leading-snug">{subtitle}</span>}
      </span>
      {badge !== undefined && badge !== 0 && (
        <span className="flex-none min-w-[30px] h-[30px] px-2 rounded-lg bg-accent text-on-accent text-[15px] font-semibold flex items-center justify-center tnum">
          {badge}
        </span>
      )}
      <span className="text-faint flex-none"><IconArrowRight size={18} /></span>
    </Link>
  );
}
