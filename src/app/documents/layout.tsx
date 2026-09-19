import { ensureSeeded } from "@/domain/services/simulation";

export const dynamic = "force-dynamic";

/** Documentos ficam fora do shell do sistema — a folha ocupa a tela toda. */
export default function DocumentsLayout({ children }: { children: React.ReactNode }) {
  ensureSeeded();
  return <div className="min-h-dvh bg-bg">{children}</div>;
}
