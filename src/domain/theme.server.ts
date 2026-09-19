import { cookies } from "next/headers";
import { THEME_COOKIE, DEFAULT_THEME, isTheme, type Theme } from "@/domain/theme";

/**
 * Tema em sessao, resolvido no servidor a partir do cookie.
 * Resolver aqui evita o flash de tema errado durante o carregamento:
 * o atributo data-theme ja chega correto no HTML inicial.
 */
export async function currentTheme(): Promise<Theme> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : DEFAULT_THEME;
}
