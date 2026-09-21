import { one } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { PrintBar } from "@/components/doc/PrintBar";
import { WAREHOUSE, SCENARIO_ID, SCENARIO_NAME } from "@/seed/scenario";

export const dynamic = "force-dynamic";

/**
 * SECAO 00 — CAPA do pacote mestre da demonstracao.
 * Pagina estrutural: nao ha entidade "capa" no banco — o que ela mostra
 * (identificacao da simulacao e numero de reinicios) vem de
 * `simulation_scenarios`, a mesma linha que a tela Simulacao le.
 */
export default async function PackCoverPage() {
  const cenario = await one<{ seeded_at: string; reset_count: number; status: string }>(
    `SELECT seeded_at, reset_count, status FROM simulation_scenarios WHERE id = ?`, SCENARIO_ID,
  );

  return (
    <>
      <PrintBar title="Capa do pacote mestre" meta="Folha A4" backHref="/documents" />
      <article
        className="doc-sheet bg-white text-black mx-auto my-6 px-[20mm] py-[24mm] flex flex-col shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_18px_40px_rgba(0,0,0,0.45)]"
        style={{ width: "210mm", minHeight: "297mm", fontFamily: "var(--font-sora)" }}
      >
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 border-2 border-black flex items-center justify-center flex-none">
            <svg width="26" height="26" viewBox="0 0 16 16" aria-hidden>
              <path d="M2 4.5 8 1.5l6 3v7l-6 3-6-3z" fill="none" stroke="#000" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M8 7.8v6.7M2 4.5l6 3.3 6-3.3" fill="none" stroke="#000" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="text-[13pt] tracking-[0.3em] font-bold">JARVIS.WMS</p>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center gap-6 -mt-12">
          <div>
            <p className="text-[34pt] font-bold leading-tight" style={{ fontFamily: "var(--font-familjen)" }}>
              SIMULACAO OPERACIONAL
            </p>
            <p className="text-[20pt] font-bold mt-1">{SCENARIO_NAME}</p>
          </div>

          <div className="border-t-2 border-b-2 border-black py-3 px-10">
            <p className="text-[12pt] tracking-[0.28em] font-bold">DOCUMENTACAO OPERACIONAL</p>
            <p className="text-[10pt] tracking-[0.24em] font-bold mt-1">USO ACADEMICO</p>
          </div>

          <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-left mt-4">
            <Field label="Simulacao" value={SCENARIO_ID} />
            <Field label="Empresa" value={WAREHOUSE.name} />
            <Field
              label="Versao da simulacao"
              value={cenario ? `execucao n. ${Number(cenario.reset_count) + 1}` : "—"}
            />
            <Field label="Status do cenario" value={cenario?.status ?? "—"} />
            <Field label="Carregado em" value={fmtDateTime(cenario?.seeded_at)} />
            <Field label="Pacote gerado em" value={fmtDateTime(new Date().toISOString())} />
          </div>
        </div>

        <div className="border-2 border-black py-2.5 mt-auto">
          <p className="text-center text-[9pt] tracking-[0.18em] font-bold">
            TODOS OS DOCUMENTOS FISCAIS DESTE PACOTE SAO SIMULADOS
          </p>
          <p className="text-center text-[8pt] tracking-[0.12em] mt-0.5">
            SEM VALIDADE FISCAL — SEM EMISSAO SEFAZ — USO EXCLUSIVAMENTE ACADEMICO
          </p>
        </div>
        <p className="text-center text-[7.5pt] text-[#666] mt-3">
          {WAREHOUSE.tradeName} · {WAREHOUSE.city}/{WAREHOUSE.state}
        </p>
      </article>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[7.5pt] tracking-[0.1em] uppercase text-[#555]">{label}</p>
      <p className="text-[11pt] font-bold">{value}</p>
    </div>
  );
}
