/** Resultado padrao das server actions, consumido por `ActionForm`. */
export interface ActionState {
  ok: boolean;
  message?: string;
  error?: string;
  /** Dados livres devolvidos pela acao (ex.: id criado, resultado do bip). */
  data?: Record<string, any>;
}

export const IDLE: ActionState = { ok: false };

export function ok(message?: string, data?: Record<string, any>): ActionState {
  return { ok: true, message, data };
}

export function fail(error: string, data?: Record<string, any>): ActionState {
  return { ok: false, error, data };
}

/** Converte excecoes de dominio em mensagem util para o operador. */
export function toError(err: unknown): ActionState {
  if (err instanceof Error) return { ok: false, error: err.message };
  return { ok: false, error: "Falha inesperada ao executar a operacao." };
}

export function str(form: FormData, key: string, fallback = ""): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : fallback;
}

export function num(form: FormData, key: string, fallback = 0): number {
  const v = str(form, key);
  if (v === "") return fallback;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

export function optStr(form: FormData, key: string): string | undefined {
  const v = str(form, key);
  return v === "" ? undefined : v;
}
