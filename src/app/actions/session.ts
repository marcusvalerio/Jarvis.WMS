"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { OPERATOR_COOKIE } from "@/domain/context";

/** Troca o operador em sessao (ator de auditoria e das movimentacoes). */
export async function setOperator(operatorId: string) {
  const store = await cookies();
  store.set(OPERATOR_COOKIE, operatorId, {
    path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
