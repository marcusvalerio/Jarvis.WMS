import { cookies } from "next/headers";
import { all, one } from "@/lib/db";
import { SESSION_COOKIE, profileForToken, type Profile } from "@/domain/auth";

export const DEFAULT_OPERATOR = "OPR-0001";

export interface Operator {
  id: string; name: string; badge: string; shift: string; active: number;
}

export class NotAuthenticatedError extends Error {
  readonly code = "NOT_AUTHENTICATED";
  constructor() {
    super("Sessao ausente ou expirada. Entre novamente para operar.");
    this.name = "NotAuthenticatedError";
  }
}

export async function listOperators(): Promise<Operator[]> {
  return await all<Operator>(`SELECT * FROM operators WHERE active = 1 ORDER BY name`);
}

export async function getOperator(id: string): Promise<Operator | undefined> {
  return await one<Operator>(`SELECT * FROM operators WHERE id = ?`, id);
}

/**
 * Perfil autenticado da requisicao, ou null.
 *
 * A identidade vem SEMPRE do token de sessao, conferido contra o banco.
 * Antes, o operador vinha de um cookie em texto puro: bastava reescrever
 * `wms_operator` no navegador para operar — e ser auditado — como outra
 * pessoa. Nada que o cliente envie participa mais dessa decisao.
 */
export async function currentProfile(): Promise<Profile | null> {
  const store = await cookies();
  return await profileForToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * Operador em sessao — ator da auditoria e das movimentacoes.
 *
 * Lanca quando nao ha sessao valida. E o unico ponto por onde as 66
 * chamadas do sistema obtem o operador, entao exigir sessao aqui protege
 * tambem as server actions, que sao endpoints POST alcancaveis
 * diretamente e que nenhum middleware ou layout conseguiria barrar.
 */
export async function currentOperator(): Promise<Operator> {
  const perfil = await currentProfile();
  if (!perfil) throw new NotAuthenticatedError();
  const operador = await getOperator(perfil.operatorId);
  if (!operador) throw new NotAuthenticatedError();
  return operador;
}

export async function currentOperatorId(): Promise<string> {
  return (await currentOperator()).id;
}
