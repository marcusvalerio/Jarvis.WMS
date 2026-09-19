import { cookies } from "next/headers";
import { all, one } from "@/lib/db";

export const OPERATOR_COOKIE = "wms_operator";
export const DEFAULT_OPERATOR = "OPR-0001";

export interface Operator {
  id: string; name: string; badge: string; shift: string; active: number;
}

export async function listOperators(): Promise<Operator[]> {
  return await all<Operator>(`SELECT * FROM operators WHERE active = 1 ORDER BY name`);
}

export async function getOperator(id: string): Promise<Operator | undefined> {
  return await one<Operator>(`SELECT * FROM operators WHERE id = ?`, id);
}

/** Operador em sessao — usado como ator em auditoria e movimentacoes. */
export async function currentOperator(): Promise<Operator> {
  const store = await cookies();
  const id = store.get(OPERATOR_COOKIE)?.value ?? DEFAULT_OPERATOR;
  return (
    await getOperator(id) ??
    await getOperator(DEFAULT_OPERATOR) ?? {
      id: DEFAULT_OPERATOR, name: "Operador", badge: DEFAULT_OPERATOR,
      shift: "MANHA", active: 1,
    }
  );
}

export async function currentOperatorId(): Promise<string> {
  return (await currentOperator()).id;
}
