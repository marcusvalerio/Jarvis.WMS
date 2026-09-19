import { ensureSeeded } from "@/domain/services/simulation";

export const dynamic = "force-dynamic";

/** Documentos ficam fora do shell do sistema — a folha ocupa a tela toda. */
export default async function DocumentsLayout({ children }: { children: React.ReactNode }) {
  await ensureSeeded();
  return <div className="doc-shell min-h-dvh bg-bg">{children}</div>;
}
