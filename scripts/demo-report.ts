/** Relatorio de validacao do pacote de documentos, em texto. */
import type { DemoPackReport } from "../src/domain/services/demo.ts";

const LARGURA = 56;

export function printDemoPackReport(r: DemoPackReport) {
  const linha = "─".repeat(LARGURA);
  console.log(`\n${linha}`);
  console.log(`PACOTE DE DOCUMENTOS — ${r.scenarioId}`);
  console.log(linha);

  const porEtapa = new Map<string, typeof r.byType>();
  for (const b of r.byType) {
    if (!porEtapa.has(b.stage)) porEtapa.set(b.stage, []);
    porEtapa.get(b.stage)!.push(b);
  }
  for (const [etapa, tipos] of porEtapa) {
    console.log(`\n  ${etapa.toUpperCase()}`);
    for (const t of tipos) {
      console.log(`    ${String(t.count).padStart(3)}  ${t.docType}`);
    }
  }

  console.log(`\n${linha}`);
  console.log(`VALIDACAO`);
  console.log(linha);
  for (const c of r.checks) {
    console.log(`  ${c.ok ? "OK  " : "FALHA"}  ${c.label.padEnd(42)} ${c.ok ? "" : c.detail}`);
  }

  const falhas = r.checks.filter((c) => !c.ok);
  console.log(`\n${linha}`);
  console.log(
    falhas.length === 0
      ? `${r.documents} documento(s) vinculados a entidades reais. Nenhum orfao.`
      : `${falhas.length} verificacao(oes) falharam de ${r.checks.length}.`,
  );
  console.log(`${linha}\n`);
}
