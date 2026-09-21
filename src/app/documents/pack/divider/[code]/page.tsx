import { notFound } from "next/navigation";
import { PrintBar } from "@/components/doc/PrintBar";
import { SECTION_TITLES } from "@/domain/services/demo-pack";
import { SCENARIO_ID, WAREHOUSE } from "@/seed/scenario";

export const dynamic = "force-dynamic";

/**
 * DIVISORIA entre secoes do pacote mestre — so organiza fisicamente o
 * material impresso, sem dado operacional proprio.
 */
export default async function PackDividerPage({
  params,
}: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const title = SECTION_TITLES[code];
  if (!title) notFound();

  return (
    <>
      <PrintBar title={`Divisoria · secao ${code}`} meta="Folha A4" backHref="/documents" />
      <article
        className="doc-sheet bg-white text-black mx-auto my-6 px-[20mm] py-[24mm] flex flex-col items-center justify-center text-center shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_18px_40px_rgba(0,0,0,0.45)]"
        style={{ width: "210mm", minHeight: "297mm", fontFamily: "var(--font-sora)" }}
      >
        <p className="text-[10pt] tracking-[0.3em] text-[#888]">SECAO {code}</p>
        <div className="w-16 border-t-2 border-black my-6" />
        <p className="text-[28pt] font-bold uppercase leading-tight" style={{ fontFamily: "var(--font-familjen)" }}>
          {title}
        </p>
        <div className="w-16 border-t-2 border-black my-6" />
        <p className="text-[8.5pt] text-[#888]">{WAREHOUSE.tradeName} · {SCENARIO_ID}</p>
      </article>
    </>
  );
}
