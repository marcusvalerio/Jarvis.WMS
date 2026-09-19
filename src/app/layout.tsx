import type { Metadata, Viewport } from "next";
import { Familjen_Grotesk, Geist, Sora } from "next/font/google";
import { THEME_COLOR } from "@/domain/theme";
import { currentTheme } from "@/domain/theme.server";
import "./globals.css";

/* Familjen Grotesk — titulos e numeros de destaque */
const familjen = Familjen_Grotesk({
  subsets: ["latin"], variable: "--font-familjen", display: "swap", weight: ["400", "500", "600", "700"],
});
/* Geist — rotulos, navegacao e textos editoriais */
const geist = Geist({
  subsets: ["latin"], variable: "--font-geist", display: "swap", weight: ["400", "500", "600"],
});
/* Sora — interface, tabelas, formularios e dados operacionais */
const sora = Sora({
  subsets: ["latin"], variable: "--font-sora", display: "swap", weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Jarvis WMS", template: "%s · Jarvis WMS" },
  description:
    "Sistema de gestao de armazem — recebimento, armazenagem, separacao, embalagem e expedicao com rastreabilidade ponta a ponta.",
};

/* themeColor sai do viewport estatico: e servido por tema no <head> abaixo. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await currentTheme();
  return (
    <html
      lang="pt-BR"
      data-theme={theme}
      className={`${familjen.variable} ${geist.variable} ${sora.variable}`}
    >
      <head>
        <meta name="theme-color" content={THEME_COLOR[theme]} />
      </head>
      <body>{children}</body>
    </html>
  );
}
