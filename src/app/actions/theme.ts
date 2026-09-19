"use server";

import { cookies } from "next/headers";
import { THEME_COOKIE, isTheme, type Theme } from "@/domain/theme";

/**
 * Persiste a preferencia de tema do operador.
 * Nao revalida rotas de proposito: o cliente ja aplicou o tema no
 * documento, e um re-render aqui so causaria piscada desnecessaria.
 */
export async function setTheme(theme: Theme) {
  if (!isTheme(theme)) return;
  const store = await cookies();
  store.set(THEME_COOKIE, theme, {
    path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax",
  });
}
