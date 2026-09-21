import fs from "node:fs";
import path from "node:path";
import { PrintBar } from "@/components/doc/PrintBar";
import { Sheet, DocHeader, DocSection, DocTable, Td } from "@/components/doc/Sheet";
import { SCENARIO_ID } from "@/seed/scenario";

export const dynamic = "force-dynamic";

export interface PackIndexRow {
  section: string;
  label: string;
  entity: string;
  entityId: string;
  status: string;
  pages: number;
}

/**
 * O indice fecha o pacote mestre e por isso depende de algo que so existe
 * DEPOIS de cada documento ter sido renderizado: a contagem real de paginas.
 * `scripts/docs-demo.ts` grava esse resultado aqui (fora do banco, e fora do
 * pacote — e metadado da montagem, nao entidade da operacao) e esta pagina
 * so le. Sem o arquivo, mostra que o indice ainda nao foi calculado, em vez
 * de inventar numeros.
 */
function readIndex(): PackIndexRow[] {
  const dir = process.env.WMS_DEMO_DIR ?? path.join(process.cwd(), "generated", "demo");
  const file = path.join(dir, "pack-index.json");
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

export default async function PackIndexPage() {
  const rows = readIndex();
  const totalPaginas = rows.reduce((s, r) => s + r.pages, 0);

  return (
    <>
      <PrintBar title="Indice do pacote mestre" meta="Folha A4" backHref="/documents" />
      <Sheet>
        <DocHeader title="Indice / resumo documental" subtitle={SCENARIO_ID} issuedAt={new Date().toISOString()} />

        {rows.length === 0 ? (
          <p className="mt-6 text-[9pt]">
            Indice ainda nao calculado — gere o pacote mestre com <code>npm run docs:demo</code>.
          </p>
        ) : (
          <DocSection title={`${rows.length} documento(s) · ${totalPaginas} pagina(s) no pacote`}>
            <DocTable head={[
              { label: "#", width: "10mm", align: "center" },
              { label: "Documento" },
              { label: "Entidade relacionada" },
              { label: "Status", align: "center", width: "26mm" },
              { label: "Paginas", align: "right", width: "18mm" },
            ]}>
              {rows.map((r, i) => (
                <tr key={`${r.entity}-${r.entityId}-${i}`}>
                  <Td align="center">{i + 1}</Td>
                  <Td>{r.label}</Td>
                  <Td>{r.entity} · {r.entityId}</Td>
                  <Td align="center">{r.status || "—"}</Td>
                  <Td align="right">{r.pages}</Td>
                </tr>
              ))}
            </DocTable>
          </DocSection>
        )}
      </Sheet>
    </>
  );
}
