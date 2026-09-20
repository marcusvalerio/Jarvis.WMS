"use client";

import { useActionState } from "react";
import { signInAction } from "@/app/actions/auth";
import { IDLE } from "@/app/actions/result";
import { useFormStatus } from "react-dom";
import { IconAlert, IconArrowRight } from "@/components/ui/Icons";

function Entrar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full h-10 mt-1" disabled={pending}>
      {pending ? "Entrando…" : <>Entrar <IconArrowRight size={14} /></>}
    </button>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(signInAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="label">E-mail</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          placeholder="nome@log122.com"
          className="field h-10"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="label">Senha</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="field h-10"
        />
      </label>

      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 text-[12.5px] text-error-fg border border-error-line bg-error-soft rounded-md px-3 py-2"
        >
          <span className="flex-none mt-px"><IconAlert size={14} /></span>
          {state.error}
        </p>
      )}

      <Entrar />
    </form>
  );
}
