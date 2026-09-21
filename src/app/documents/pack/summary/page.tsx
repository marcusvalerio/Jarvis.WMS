import { all, scalar } from "@/lib/db";
import { fmtNumber } from "@/lib/format";
import { PrintBar } from "@/components/doc/PrintBar";
import { Sheet, DocHeader, DocSection, DocTable, Td } from "@/components/doc/Sheet";
import { WAREHOUSE, SCENARIO_ID, BOX } from "@/seed/scenario";

export const dynamic = "force-dynamic";

/**
 * SECAO 01 — MAPA DA SIMULACAO.
 * Resumo operacional montado a partir do banco (nao dos parametros fixos do
 * cenario): mostra o que a demonstracao efetivamente tem cadastrado.
 */
export default async function PackSummaryPage() {
  const produtos = await all<any>(`SELECT sku, description, unit FROM products ORDER BY sku`);

  const entrada = await all<any>(
    `SELECT io.id, s.trade_name AS fornecedor, COUNT(DISTINCT v.id) AS caixas,
            COALESCE(SUM(vi.quantity), 0) AS unidades
       FROM inbound_orders io
       JOIN suppliers s ON s.id = io.supplier_id
       LEFT JOIN volumes v ON v.inbound_order_id = io.id AND v.status <> 'CANCELLED'
       LEFT JOIN volume_items vi ON vi.volume_id = v.id
      GROUP BY io.id, s.trade_name ORDER BY io.id`,
  );
  const totalEntradaCaixas = await scalar<number>(
    `SELECT COUNT(*) FROM volumes WHERE inbound_order_id IS NOT NULL AND status <> 'CANCELLED'`,
  ) ?? 0;

  const saida = await all<any>(
    `SELECT so.id, c.trade_name AS destino, COUNT(DISTINCT v.id) AS caixas,
            COALESCE(SUM(vi.quantity), 0) AS unidades
       FROM sales_orders so
       JOIN customers c ON c.id = so.customer_id
       LEFT JOIN volumes v ON v.sales_order_id = so.id AND v.status <> 'CANCELLED'
       LEFT JOIN volume_items vi ON vi.volume_id = v.id
      GROUP BY so.id, c.trade_name ORDER BY so.id`,
  );
  const totalSaidaCaixas = await scalar<number>(
    `SELECT COUNT(*) FROM volumes WHERE sales_order_id IS NOT NULL AND status <> 'CANCELLED'`,
  ) ?? 0;

  const rotas = await all<any>(
    `SELECT m.id, m.route, m.vehicle_plate, m.driver_name,
            mo.stop_sequence, so.id AS pedido, c.trade_name AS destino
       FROM shipping_manifests m
       JOIN manifest_orders mo ON mo.manifest_id = m.id
       JOIN sales_orders so ON so.id = mo.sales_order_id
       JOIN customers c ON c.id = so.customer_id
      ORDER BY m.id, mo.stop_sequence`,
  );
  const porRota = new Map<string, typeof rotas>();
  for (const r of rotas) {
    if (!porRota.has(r.id)) porRota.set(r.id, []);
    porRota.get(r.id)!.push(r);
  }

  return (
    <>
      <PrintBar title="Mapa da simulacao" meta="Folha A4" backHref="/documents" />
      <Sheet>
        <DocHeader
          title="Mapa da simulacao"
          subtitle={SCENARIO_ID}
          issuedAt={new Date().toISOString()}
          extra={<p className="text-[9pt]">Origem e retorno das rotas: <b>{WAREHOUSE.tradeName}</b> — nao e destino de entrega.</p>}
        />

        <DocSection title="Produtos">
          <DocTable head={[{ label: "SKU" }, { label: "Descricao" }, { label: "Unidade", align: "center" }]}>
            {produtos.map((p) => (
              <tr key={p.sku}>
                <Td bold>{p.sku}</Td>
                <Td>{p.description}</Td>
                <Td align="center">{p.unit}</Td>
              </tr>
            ))}
          </DocTable>
        </DocSection>

        <DocSection title={`Recebimento — ${totalEntradaCaixas} caixa(s)`}>
          <DocTable head={[
            { label: "Ordem" }, { label: "Fornecedor" },
            { label: "Caixas", align: "right" }, { label: "Unidades", align: "right" },
          ]}>
            {entrada.map((e) => (
              <tr key={e.id}>
                <Td bold>{e.id}</Td>
                <Td>{e.fornecedor}</Td>
                <Td align="right">{fmtNumber(e.caixas)}</Td>
                <Td align="right">{fmtNumber(e.unidades)}</Td>
              </tr>
            ))}
          </DocTable>
        </DocSection>

        <DocSection title={`Expedicao — ${totalSaidaCaixas} caixa(s)`}>
          <DocTable head={[
            { label: "Pedido" }, { label: "Destino" },
            { label: "Caixas", align: "right" }, { label: "Unidades", align: "right" },
          ]}>
            {saida.map((s) => (
              <tr key={s.id}>
                <Td bold>{s.id}</Td>
                <Td>{s.destino}</Td>
                <Td align="right">{fmtNumber(s.caixas)}</Td>
                <Td align="right">{fmtNumber(s.unidades)}</Td>
              </tr>
            ))}
          </DocTable>
        </DocSection>

        <DocSection title="Rotas e destinos">
          {[...porRota.entries()].map(([manifestId, paradas]) => (
            <div key={manifestId} className="mb-3 avoid-break">
              <p className="text-[8.5pt] font-bold">
                {manifestId} · {paradas[0].route} · {paradas[0].vehicle_plate} · {paradas[0].driver_name}
              </p>
              <DocTable head={[
                { label: "Parada", width: "16mm", align: "center" }, { label: "Pedido" }, { label: "Destino" },
              ]}>
                {paradas.map((p: any) => (
                  <tr key={p.pedido}>
                    <Td align="center">{p.stop_sequence}</Td>
                    <Td bold>{p.pedido}</Td>
                    <Td>{p.destino}</Td>
                  </tr>
                ))}
              </DocTable>
            </div>
          ))}
        </DocSection>

        <p className="text-[7.5pt] text-[#666] mt-4">
          Caixa logistica: {BOX.shampooPerBox} shampoos + {BOX.conditionerPerBox} condicionadores
          = {BOX.unitsPerBox} unidades. Todos os numeros acima vem das entidades reais do
          cenario {SCENARIO_ID}, nao de valores fixos.
        </p>
      </Sheet>
    </>
  );
}
