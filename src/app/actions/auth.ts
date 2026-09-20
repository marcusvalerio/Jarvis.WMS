"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_DAYS, signIn, signOut } from "@/domain/auth";
import { audit } from "@/domain/services/audit";
import { one } from "@/lib/db";
import { type ActionState, fail, str } from "./result";

/**
 * Entrada no sistema. Em caso de falha devolve SEMPRE a mesma mensagem,
 * sem distinguir e-mail inexistente de senha errada — o contrario
 * entregaria a lista de usuarios a quem ficasse tentando.
 */
export async function signInAction(_: ActionState, form: FormData): Promise<ActionState> {
  const email = str(form, "email");
  const senha = str(form, "password");
  if (!email || !senha) return fail("Informe e-mail e senha.");

  const token = await signIn(email, senha);
  if (!token) return fail("E-mail ou senha invalidos.");

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,                                  // fora do alcance de JavaScript
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });

  const perfil = await one<any>(
    `SELECT o.id FROM operators o JOIN users u ON u.id = o.user_id
      WHERE lower(u.email) = ?`, email.trim().toLowerCase(),
  );
  if (perfil) {
    await audit({
      actor: perfil.id, action: "CREATE", entity: "session", entityId: perfil.id,
      detail: "Entrada no sistema", origin: "WEB",
    });
  }
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  await signOut(token);                              // revoga no servidor
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
