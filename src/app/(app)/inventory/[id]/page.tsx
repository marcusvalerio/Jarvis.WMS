import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { one, all } from "@/lib/db";
import { stockOf, rowsOf, listMovements } from "@/domain/services/inventory";
import { traceProduct } from "@/domain/services/traceability";
import { PageHeader, Card, CardHeader, Metric, MetaItem, EmptyState, IdChip } from "@/components/ui/Primitives";
import { Badge } from "@/components/ui/Badge";
import { Barcode } from "@/components/Barcode";
import { Timeline } from "@/components/Timeline";
import { MOVEMENT_KIND_LABEL } from "@/domain/states";
import { fmtNumber, fmtWeight, fmtMoney, fmtDate, fmtDateTime, fmtDimensions } from "@/lib/format";
import { IconPrint } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Produto ${id}` };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = one<any>(`SELECT * FROM products WHERE id = ? OR sku = ?`, id, id);
  if (!product) notFound();

  const stock = stockOf(product.id);
  const rows = all<any>(
    `SELECT i.*, l.code AS location_code, z.name AS zone_name, lt.code AS lot_code, lt.expires_at
       FROM inventory i
       JOIN locations l ON l.id = i.location_id
       JOIN zones z ON z.id = l.zone_id
       LEFT JOIN lots lt ON lt.id = i.lot_id
      WHERE i.product_id = ? AND i.qty_on_hand > 0
      ORDER BY COALESCE(lt.expires_at,'9999'), l.code`,
    product.id,
  );
  const barcodes = all<any>(`SELECT * FROM product_barcodes WHERE product_id = ? ORDER BY is_primary DESC`, product.id);
  const moves = listMovements({ productId: product.id, limit: 25 });
  const trace = traceProduct(product.id);

  return (
    <>
      <PageHeader
        eyebrow={`${product.category} · classe ${product.abc_class}`}
        title={product.sku}
        description={product.description}
        meta={
          <>
            <MetaItem label="Unidade" value={product.unit} />
            <MetaItem label="Peso unitario" value={fmtWeight(product.unit_gross_kg, 3)} />
            <MetaItem label="Dimensoes" value={fmtDimensions(product.length_cm, product.width_cm, product.height_cm)} />
            <MetaItem label="Un. por palete" value={fmtNumber(product.units_per_pallet)} />
            <MetaItem label="NCM" value={product.ncm ?? "—"} />
            <MetaItem label="Preco" value={fmtMoney(product.unit_price)} />
          </>
        }
        actions={
          <Link href={`/documents/product-label/${product.id}`} className="btn btn-sm">
            <IconPrint size={13} /> Etiqueta de produto
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Card className="p-4"><Metric label="Saldo fisico" value={fmtNumber(stock.onHand)} unit={product.unit} size="sm" /></Card>
        <Card className="p-4"><Metric label="Disponivel" value={fmtNumber(stock.available)} unit={product.unit} tone="success" size="sm" /></Card>
        <Card className="p-4"><Metric label="Reservado" value={fmtNumber(stock.reserved)} unit={product.unit} tone="warning" size="sm" /></Card>
        <Card className="p-4"><Metric label="Bloqueado" value={fmtNumber(stock.blocked)} unit={product.unit} tone={stock.blocked > 0 ? "error" : "muted"} size="sm" /></Card>
        <Card className="p-4"><Metric label="Enderecos" value={fmtNumber(stock.locations)} size="sm" hint={`min. ${fmtNumber(product.min_stock)} ${product.unit}`} /></Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <div className="xl:col-span-2 flex flex-col gap-5">
          <Card padded={false}>
            <div className="p-5 pb-0">
              <CardHeader title="Estoque por endereco" subtitle="Ordenado por validade (FEFO) — e nesta ordem que a reserva aloca" />
            </div>
            {rows.length === 0 ? (
              <EmptyState title="Sem saldo" description="Este produto nao possui estoque no momento." />
            ) : (
              <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
                <table className="table">
                  <thead>
                    <tr><th>Endereco</th><th>Zona</th><th>Palete</th><th>Lote</th><th>Validade</th>
                      <th className="num">Saldo</th><th className="num">Reservado</th><th className="num">Disponivel</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r: any) => (
                      <tr key={r.id}>
                        <td><Link href={`/warehouse/${r.location_id}`} className="link code">{r.location_code}</Link></td>
                        <td className="text-secondary">{r.zone_name}</td>
                        <td>{r.pallet_id ? <IdChip id={r.pallet_id} href={`/warehouse/pallets/${r.pallet_id}`} /> : "—"}</td>
                        <td className="code text-secondary">{r.lot_code ?? "—"}</td>
                        <td className="text-secondary">{r.expires_at ? fmtDate(r.expires_at) : "—"}</td>
                        <td className="num tnum">{fmtNumber(r.qty_on_hand)}</td>
                        <td className="num tnum text-warning">{r.qty_reserved > 0 ? fmtNumber(r.qty_reserved) : "—"}</td>
                        <td className="num tnum text-success">{fmtNumber(r.qty_on_hand - r.qty_reserved - r.qty_blocked)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card padded={false}>
            <div className="p-5 pb-0"><CardHeader title="Movimentacoes" subtitle="Historico completo deste SKU" /></div>
            {moves.length === 0 ? <EmptyState title="Sem movimentacao" /> : (
              <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
                <table className="table">
                  <thead>
                    <tr><th>Movimento</th><th>Tipo</th><th className="num">Qtd</th><th>De</th><th>Para</th>
                      <th className="num">Saldo apos</th><th>Referencia</th><th>Data</th></tr>
                  </thead>
                  <tbody>
                    {moves.map((m) => (
                      <tr key={m.id}>
                        <td><IdChip id={m.id} /></td>
                        <td className="text-secondary">{MOVEMENT_KIND_LABEL[m.kind] ?? m.kind}</td>
                        <td className="num tnum">{fmtNumber(m.quantity)}</td>
                        <td className="code text-secondary">{m.from_code ?? "—"}</td>
                        <td className="code text-secondary">{m.to_code ?? "—"}</td>
                        <td className="num tnum text-primary">{fmtNumber(m.balance_after ?? 0)}</td>
                        <td className="text-secondary text-[12px]">{m.ref_id ?? "—"}</td>
                        <td className="text-secondary text-[12px]">{fmtDateTime(m.occurred_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Codigos de barras" subtitle="Aceitos pela coletora" />
            <div className="flex flex-col gap-4">
              {barcodes.map((b: any) => (
                <div key={b.id}>
                  <p className="flex items-center gap-2 mb-2">
                    <Badge tone={b.is_primary ? "accent" : "neutral"}>{b.kind}</Badge>
                    <span className="code text-[12px]">{b.code}</span>
                  </p>
                  <Barcode value={b.code} height={48} moduleWidth={1.8} />
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Rastreabilidade" subtitle="Todos os movimentos deste produto" />
            <Timeline nodes={trace.timeline.slice(-14)} compact />
          </Card>
        </div>
      </div>
    </>
  );
}
