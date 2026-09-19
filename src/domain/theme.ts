/**
 * Tema da interface. Este modulo e puro de proposito (sem next/headers):
 * ele e compartilhado entre o servidor e o seletor no cliente.
 */

export const THEME_COOKIE = "wms_theme";

export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** Light e o tema padrao da aplicacao. */
export const DEFAULT_THEME: Theme = "light";

/** Cor da barra do navegador por tema — espelha --color-bg de globals.css. */
export const THEME_COLOR: Record<Theme, string> = {
  light: "#F5F6F3",
  dark: "#0B0D0E",
};

export const THEME_LABEL: Record<Theme, string> = {
  light: "Claro",
  dark: "Escuro",
};

export const THEME_HINT: Record<Theme, string> = {
  light: "Alto contraste para ambiente iluminado e projecao",
  dark: "Identidade original, indicada para a operacao em tela",
};

export function isTheme(value: string | undefined): value is Theme {
  return value === "light" || value === "dark";
}
