import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPurchaseOrder } from "@/domain/services/orders";
import { PageHeader, Card, CardHeader, MetaItem, Metric, IdChip } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/Badge";
import { PURCHASE_STATUS_META, INBOUND_STATUS_META } from "@/domain/states";
import { fmtNumber, fmtMoney, fmtWeight, fmtDate, fmtCnpj, fmtDateTime } from "@/lib/format";
import { IconPrint, IconArrowRight } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Compra ${id}` };
}

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPurchaseOrder(id);
  if (!data) notFound();
  const { po, items, inbound } = data;

  return (
    <>
      <PageHeader
        eyebrow={`Pedido de compra · ${po.supplier_name}`}
        title={po.id}
        description={`${po.supplier_address ?? ""} — ${po.supplier_city}/${po.supplier_state} · CNPJ ${fmtCnpj(po.supplier_cnpj)}`}
        meta={
          <>
            <StatusBadge status={po.status} meta={PURCHASE_STATUS_META} />
            <MetaItem label="Emitido" value={fmtDate(po.issued_at)} />
            <MetaItem label="Entrega prevista" value={fmtDate(po.expected_at)} />
            <MetaItem label="Comprador" value={po.buyer ?? "—"} />
            <MetaItem label="Pagamento" value={po.payment_terms ?? "—"} />
          </>
        }
        actions={
          <>
            <Link href={`/documents/purchase-order/${po.id}`} className="btn btn-sm"><IconPrint size={13} /> Imprimir</Link>
            {inbound && (
              <Link href={`/receiving/${inbound.id}`} className="btn btn-sm btn-primary">
                Recebimento {inbound.id} <IconArrowRight size={13} />
              </Link>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Card className="p-4"><Metric label="Linhas" value={items.length} size="sm" /></Card>
        <Card className="p-4"><Metric label="Quantidade" value={fmtNumber(items.reduce((s: number, i: any) => s + i.quantity, 0))} size="sm" /></Card>
        <Card className="p-4"><Metric label="Peso total" value={fmtNumber(po.total_weight_kg, 1)} unit="kg" size="sm" /></Card>
        <Card className="p-4"><Metric label="Valor total" value={fmtMoney(po.total_value)} tone="accent" size="sm" /></Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <Card className="xl:col-span-2" padded={false}>
          <div className="p-5 pb-0"><CardHeader title="Itens do pedido" /></div>
          <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
            <table className="table">
              <thead>
                <tr><th>#</th><th>SKU</th><th>Descricao</th><th>NCM</th><th>Lote</th><th>Validade</th>
                  <th className="num">Qtd</th><th className="num">Recebido</th>
                  <th className="num">V. unit.</th><th className="num">Total</th></tr>
              </thead>
              <tbody>
                {items.map((it: any) => (
                  <tr key={it.id}>
                    <td className="tnum text-secondary">{it.line_no}</td>
                    <td><Link href={`/inventory/${it.product_id}`} className="chip-id hover:opacity-80">{it.sku}</Link></td>
                    <td className="max-w-[240px] truncate" title={it.description}>{it.description}</td>
                    <td className="code text-secondary text-[11.5px]">{it.ncm ?? "—"}</td>
                    <td className="code text-secondary">{it.lot_code ?? "—"}</td>
                    <td className="text-secondary text-[12px]">{it.expires_at ? fmtDate(it.expires_at) : "—"}</td>
                    <td className="num tnum">{fmtNumber(it.quantity)} {it.unit}</td>
                    <td className="num tnum">{it.received_qty > 0 ? fmtNumber(it.received_qty) : "—"}</td>
                    <td className="num tnum text-secondary">{fmtMoney(it.unit_price)}</td>
                    <td className="num tnum">{fmtMoney(it.quantity * it.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          {inbound && (
            <Card>
              <CardHeader
                title="Recebimento vinculado"
                action={<StatusBadge status={inbound.status} meta={INBOUND_STATUS_META} />}
              />
              <div className="flex flex-col gap-2 text-[12.5px]">
                <MetaItem label="Ordem" value={<IdChip id={inbound.id} href={`/receiving/${inbound.id}`} />} />
                <MetaItem label="NF" value={inbound.invoice_id ?? "—"} />
                <MetaItem label="Agendado" value={fmtDateTime(inbound.scheduled_at)} />
                <MetaItem label="Veiculo" value={inbound.vehicle_plate ?? "—"} />
                <MetaItem label="Doca" value={inbound.dock_id ?? "—"} />
                <MetaItem label="Concluido" value={fmtDateTime(inbound.completed_at)} />
              </div>
              <Link href={`/receiving/${inbound.id}`} className="btn w-full mt-4">
                Abrir recebimento
              </Link>
            </Card>
          )}

          <Card>
            <CardHeader title="Fornecedor" />
            <div className="flex flex-col gap-2 text-[12.5px]">
              <MetaItem label="Razao social" value={po.supplier_name} />
              <MetaItem label="CNPJ" value={fmtCnpj(po.supplier_cnpj)} />
              <MetaItem label="Cidade" value={`${po.supplier_city}/${po.supplier_state}`} />
              <MetaItem label="Telefone" value={po.supplier_phone ?? "—"} />
              <MetaItem label="E-mail" value={po.supplier_email ?? "—"} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
