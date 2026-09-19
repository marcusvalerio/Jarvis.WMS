"use client";

import { useEffect, useState } from "react";
import { IconCheck, IconAlert, IconX } from "@/components/ui/Icons";

export interface ToastPayload { ok: boolean; text: string }
interface Toast extends ToastPayload { id: number }

export const TOAST_EVENT = "wms:toast";

/** Publica uma mensagem no Toaster global. */
export function toast(payload: ToastPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: payload }));
}

/**
 * Feedback global das acoes.
 * Necessario porque a revalidacao do servidor troca a arvore de
 * componentes: o formulario que originou a acao desaparece, e a
 * confirmacao precisa sobreviver a essa troca.
 */
export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    let seq = 0;
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastPayload>).detail;
      if (!detail?.text) return;
      const id = ++seq;
      setItems((cur) => [...cur.slice(-3), { id, ...detail }]);
      setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), detail.ok ? 5000 : 9000);
    }
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[80] flex flex-col gap-2 w-[min(420px,calc(100vw-2rem))] no-print"
      role="status"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          data-toast={t.ok ? "ok" : "error"}
          /* Identidade do aviso. Nao muda nada na tela: serve para o teste de
             ponta a ponta distinguir um aviso NOVO de um ainda visivel da
             acao anterior — o Toaster mantem apenas os ultimos, entao contar
             nao basta. */
          data-toast-id={t.id}
          className={`fade-in flex items-start gap-2.5 p-3.5 rounded-lg border shadow-2xl backdrop-blur-md ${
            t.ok ? "border-success-line bg-success-soft/95" : "border-error-line bg-error-soft/95"
          }`}
        >
          <span className={`flex-none mt-px ${t.ok ? "text-success-fg" : "text-error-fg"}`}>
            {t.ok ? <IconCheck size={15} /> : <IconAlert size={15} />}
          </span>
          <p className={`text-[12.5px] leading-snug flex-1 ${t.ok ? "text-success-fg" : "text-error-fg"}`}>
            {t.text}
          </p>
          <button
            type="button"
            onClick={() => setItems((cur) => cur.filter((x) => x.id !== t.id))}
            className="flex-none text-faint hover:text-primary transition-colors"
            aria-label="Fechar aviso"
          >
            <IconX size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
