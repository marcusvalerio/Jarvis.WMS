"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions/result";
import { IconCheck, IconAlert } from "@/components/ui/Icons";
import { toast } from "@/components/Toaster";

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

/**
 * Formulario de operacao: executa a server action, mostra o retorno e
 * mantem o botao desabilitado enquanto a acao roda — evita duplo disparo
 * de movimentacao, que e o erro mais caro num WMS.
 */
export function ActionForm({
  action, children, className = "", onSuccess, resetOnSuccess = false, feedback = true, id,
}: {
  action: Action;
  children: React.ReactNode | ((state: ActionState) => React.ReactNode);
  className?: string;
  onSuccess?: (state: ActionState) => void;
  resetOnSuccess?: boolean;
  feedback?: boolean;
  id?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  /**
   * O resultado e publicado AQUI, logo apos a server action resolver.
   * Nao pode ser em `useEffect`: a revalidacao do servidor frequentemente
   * substitui a arvore de componentes no mesmo commit, desmontando este
   * formulario antes que qualquer efeito rode — e a confirmacao se perderia
   * exatamente nas operacoes que mudam de etapa.
   */
  const [state, formAction] = useActionState(
    async (prev: ActionState, form: FormData): Promise<ActionState> => {
      const result = await action(prev, form);
      if (result.error) toast({ ok: false, text: result.error });
      else if (result.message) toast({ ok: true, text: result.message });
      if (result.ok) {
        if (resetOnSuccess) ref.current?.reset();
        onSuccessRef.current?.(result);
      }
      return result;
    },
    { ok: false } as ActionState,
  );

  return (
    <form ref={ref} action={formAction} className={className} id={id}>
      {typeof children === "function" ? children(state) : children}
      {feedback && (state.error || state.message) && <ActionMessage state={state} />}
    </form>
  );
}

export function ActionMessage({ state, className = "" }: { state: ActionState; className?: string }) {
  if (!state.error && !state.message) return null;
  const bad = !!state.error;
  return (
    <p
      role="status"
      aria-live="polite"
      className={`flex items-start gap-2 mt-3 px-3 py-2 rounded-md text-[12.5px] leading-snug border ${
        bad
          ? "border-error-line bg-error-soft text-error-fg"
          : "border-success-line bg-success-soft text-success-fg"
      } ${className}`}
    >
      <span className="flex-none mt-px">{bad ? <IconAlert size={14} /> : <IconCheck size={14} />}</span>
      <span>{state.error ?? state.message}</span>
    </p>
  );
}

/** Botao de submit que reflete o estado pendente da action. */
export function SubmitButton({
  children, className = "btn btn-primary", pendingLabel = "Processando…", disabled, title,
}: {
  children: React.ReactNode; className?: string; pendingLabel?: string;
  disabled?: boolean; title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} title={title}>
      {pending ? pendingLabel : children}
    </button>
  );
}
