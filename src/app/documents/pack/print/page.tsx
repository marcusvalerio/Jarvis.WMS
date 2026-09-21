import { PrintBar } from "@/components/doc/PrintBar";
import { AutoPrint } from "@/components/doc/AutoPrint";
import PackCoverPage from "../cover/page";
import PackSummaryPage from "../summary/page";
import PackDividerPage from "../divider/[code]/page";
import { buildDemoPackManifest, type PackSection } from "@/domain/services/demo-pack";
import { renderDocument } from "@/app/documents/[type]/[id]/page";
import { SCENARIO_ID, WAREHOUSE } from "@/seed/scenario";

export const dynamic = "force-dynamic";

export default async function DemoPackPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ auto?: string }>;
}) {
  const sp = await searchParams;
  const sections = await buildDemoPackManifest();
  const totalDocuments = sections.reduce((sum, section) => sum + section.entries.length, 0);

  return (
    <>
      <PrintBar
        title="Pacote completo da demonstracao"
        meta={`${SCENARIO_ID} · ${totalDocuments} documentos · Folhas A4`}
        backHref="/documents"
        backLabel="Central de documentos"
      />
      <AutoPrint enabled={sp.auto === "1"} />

      <main className="pack-print">
        <div className="no-print max-w-[210mm] mx-auto px-4 lg:px-0 pt-5">
          <div className="border border-border bg-surface px-4 py-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-primary">Pacote mestre da demonstracao</p>
              <p className="text-[11.5px] text-secondary mt-0.5">
                {WAREHOUSE.tradeName} · {SCENARIO_ID} · todos os documentos na ordem operacional.
              </p>
            </div>
          </div>
        </div>

        <div className="pack-page">
          <PackCoverPage />
        </div>

        <div className="pack-page pack-break">
          <PackSummaryPage />
        </div>

        {sections.map((section) => (
          <PackSectionBlock key={section.code} section={section} />
        ))}

        <section className="pack-page pack-break">
          <div className="doc-sheet bg-white text-black mx-auto my-6 px-[20mm] py-[18mm]" style={{ width: "210mm", minHeight: "297mm" }}>
            <p className="text-[24pt] font-bold leading-tight">Indice do pacote</p>
            <p className="text-[10pt] mt-2 text-[#555]">{SCENARIO_ID} · {totalDocuments} documentos</p>

            <div className="mt-8 border-t border-black">
              {sections.flatMap((section) => section.entries.map((entry) => ({ section, entry }))).map(({ section, entry }, index) => (
                <div key={`${entry.docType}-${entry.id}-${index}`} className="grid grid-cols-[14mm_18mm_1fr_42mm] gap-2 border-b border-[#ddd] py-2 text-[8.5pt]">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <span className="font-bold">{section.code}</span>
                  <span>{entry.label}{entry.sublabel ? ` · ${entry.sublabel}` : ""}</span>
                  <span className="text-right">{entry.entity} · {entry.id}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <style>{`
        @media print {
          .pack-break { break-before: page; page-break-before: always; }
          .pack-print .doc-sheet { box-shadow: none !important; }
        }
      `}</style>
    </>
  );
}

async function PackSectionBlock({ section }: { section: PackSection }) {
  const rendered = [];
  for (const entry of section.entries) {
    const node = await renderDocument(entry.docType, entry.id);
    if (node) rendered.push({ entry, node });
  }

  return (
    <section className="pack-section">
      <div className="pack-page pack-break">
        <PackDividerPage params={Promise.resolve({ code: section.code })} />
      </div>

      {rendered.map(({ entry, node }) => (
        <div className="pack-page pack-break" key={`${entry.docType}-${entry.id}`}>
          {node}
        </div>
      ))}
    </section>
  );
}
