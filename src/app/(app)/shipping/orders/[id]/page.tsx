import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getOrder, coverage } from "@/domain/services/orders";
import { getShippingCheck } from "@/domain/services/shipping";
import { traceOrder } from "@/domain/services/traceability";
import { one } from "@/lib/db";
import { PageHeader, Card, CardHeader, MetaItem, EmptyState, IdChip, Progress, Metric } from "@/components/ui/Primitives";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Timeline } from "@/components/Timeline";
import {
  SHIPPING_STATUS_META, PRIORITY_META, PICKING_STATUS_META,
  TASK_STATUS_META, VOLUME_STATUS_META, CHECK_STATUS_META, MANIFEST_STATUS_META,
} from "@/domain/states";
import { fmtNumber, fmtMoney, fmtWeight, fmtDateTime, relativeTime, isOverdue } from "@/lib/format";
import {
  ReleaseOrder, GeneratePicklist, GeneratePacking, StartShippingCheck,
  VolumeScanForm, FinishShippingCheck, CancelOrder, IssueOutboundInvoice,
} from "./parts";
import { IconPrint, IconArrowRight, IconScan } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Pedido ${id}` };
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getOrder(id);
  if (!data) notFound();
  const { order, items, reservations, picking, packing, volumes, check, manifest, shipment } = data;
  const cov = await coverage(id);
  const trace = await traceOrder(id);
  const checkData = check ? await getShippingCheck(check.id) : null;
  const invoice = await one<any>(`SELECT * FROM invoices WHERE sales_order_id = ? AND kind='OUTBOUND'`, id);

  const openVolumes = volumes.filter((v: any) => v.status === "OPEN" || v.status === "CLOSED").length;
  const totalQty = items.reduce((s: number, i: any) => s + i.quantity, 0);
  const totalPicked = items.reduce((s: number, i: any) => s + i.picked_qty, 0);

  return (
    <>
      <PageHeader
        eyebrow={`Pedido de venda · ${order.customer_name}`}
        title={order.id}
        description={`${order.ship_to_address ?? ""} · ${order.ship_to_city}/${order.ship_to_state} · transportadora ${order.carrier ?? "—"}`}
        meta={
          <>
            <StatusBadge status={order.status} meta={SHIPPING_STATUS_META} />
            <StatusBadge status={order.priority} meta={PRIORITY_META} dot={false} />
            <MetaItem label="Emitido" value={fmtDateTime(order.issued_at)} />
            <MetaItem label="Prazo" value={<span className={isOverdue(order.due_at) && order.status !== "SHIPPED" ? "text-error-fg" : ""}>{fmtDateTime(order.due_at)}</span>} />
            <MetaItem label="Valor" value={fmtMoney(order.total_value)} />
            <MetaItem label="Peso" value={fmtWeight(order.total_weight_kg, 1)} />
          </>
        }
        actions={
          <>
            <Link href={`/documents/sales-order/${order.id}`} className="btn btn-sm"><IconPrint size={13} /> Pedido</Link>
            {picking && <Link href={`/documents/picklist/${picking.id}`} className="btn btn-sm"><IconPrint size={13} /> Picklist</Link>}
            {volumes.length > 0 && <Link href={`/documents/packing-list/${order.id}`} className="btn btn-sm"><IconPrint size={13} /> Packing list</Link>}
          </>
        }
      />

      {/* ------------------------------------------------------- fluxo */}
      <Card className="mb-5 border-l-2 border-l-accent">
        <CardHeader title="Proxima etapa" subtitle={SHIPPING_STATUS_META[order.status as keyof typeof SHIPPING_STATUS_META]?.description} />
        <div className="flex flex-wrap items-start gap-5">
          {order.status === "PENDING" && !order.reserved && <ReleaseOrder orderId={order.id} />}
          {order.status === "PENDING" && !!order.reserved && (
            <>
              <GeneratePicklist orderId={order.id} />
              <p className="text-[12.5px] text-secondary max-w-sm">
                Estoque reservado. A picklist sera sequenciada pela rota fisica do armazem.
              </p>
            </>
          )}
          {order.status === "PICKING" && !picking && <GeneratePicklist orderId={order.id} />}
          {picking && picking.status !== "COMPLETED" && picking.status !== "DIVERGENCE" && (
            <Link href={`/picking/${picking.id}`} className="btn btn-primary">
              Abrir separacao {picking.id} <IconArrowRight size={13} />
            </Link>
          )}
          {picking && ["COMPLETED", "DIVERGENCE"].includes(picking.status) && !packing && (
            <GeneratePacking orderId={order.id} />
          )}
          {packing && packing.status !== "COMPLETED" && (
            <Link href={`/packing/${packing.id}`} className="btn btn-primary">
              Abrir embalagem {packing.id} <IconArrowRight size={13} />
            </Link>
          )}
          {packing?.status === "COMPLETED" && !check && <StartShippingCheck orderId={order.id} />}
          {order.status === "READY_TO_LOAD" && !manifest && (
            <Link href="/shipping/manifests" className="btn btn-primary">Incluir em romaneio <IconArrowRight size={13} /></Link>
          )}
          {manifest && (
            <Link href={`/shipping/manifests/${manifest.id}`} className="btn">
              Romaneio {manifest.id} · <StatusBadge status={manifest.status} meta={MANIFEST_STATUS_META} />
            </Link>
          )}
          {order.status === "SHIPPED" && !invoice && <IssueOutboundInvoice orderId={order.id} />}
          {!["SHIPPED", "CANCELLED"].includes(order.status) && (
            <div className="ml-auto"><CancelOrder orderId={order.id} /></div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Card className="p-4"><Metric label="Itens pedidos" value={fmtNumber(totalQty)} size="sm" /></Card>
        <Card className="p-4"><Metric label="Reservado" value={fmtNumber(items.reduce((s: number, i: any) => s + i.reserved_qty, 0))} tone="warning" size="sm" /></Card>
        <Card className="p-4"><Metric label="Separado" value={fmtNumber(totalPicked)} tone="accent" size="sm" /></Card>
        <Card className="p-4"><Metric label="Embalado" value={fmtNumber(items.reduce((s: number, i: any) => s + i.packed_qty, 0))} size="sm" /></Card>
        <Card className="p-4"><Metric label="Volumes" value={fmtNumber(volumes.length)} tone={volumes.length ? "success" : "muted"} size="sm" /></Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <div className="xl:col-span-2 flex flex-col gap-5">
          {/* --------------------------------------------- itens + cobertura */}
          <Card padded={false}>
            <div className="p-5 pb-0">
              <CardHeader
                title="Itens do pedido"
                subtitle="Cobertura calculada com o saldo disponivel no momento"
              />
            </div>
            <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
              <table className="table">
                <thead>
                  <tr>
                    <th>SKU</th><th>Produto</th><th className="num">Pedido</th>
                    <th className="num">Disponivel</th><th className="num">Reservado</th>
                    <th className="num">Separado</th><th className="num">Embalado</th>
                    <th className="num">Expedido</th><th>Cobertura</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: any) => {
                    const c = cov.find((x) => x.product_id === it.product_id);
                    return (
                      <tr key={it.id}>
                        <td><Link href={`/inventory/${it.product_id}`} className="chip-id hover:opacity-80">{it.sku}</Link></td>
                        <td className="max-w-[220px] truncate" title={it.description}>{it.description}</td>
                        <td className="num tnum">{fmtNumber(it.quantity)}</td>
                        <td className="num tnum text-secondary">{fmtNumber(it.stock.available)}</td>
                        <td className="num tnum text-warning-fg">{fmtNumber(it.reserved_qty)}</td>
                        <td className="num tnum">{fmtNumber(it.picked_qty)}</td>
                        <td className="num tnum">{fmtNumber(it.packed_qty)}</td>
                        <td className="num tnum text-success-fg">{fmtNumber(it.shipped_qty)}</td>
                        <td>
                          {it.reserved_qty >= it.quantity
                            ? <Badge tone="success">Reservado</Badge>
                            : c?.covered
                              ? <Badge tone="info">Cobertura ok</Badge>
                              : <Badge tone="error">Faltam {fmtNumber(c?.shortage ?? 0)}</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* --------------------------------------------- reservas */}
          {reservations.length > 0 && (
            <Card padded={false}>
              <div className="p-5 pb-0">
                <CardHeader title="Reservas de estoque" subtitle="Alocacao FEFO por endereco e lote" />
              </div>
              <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
                <table className="table">
                  <thead>
                    <tr><th>Reserva</th><th>SKU</th><th>Endereco</th><th>Lote</th>
                      <th className="num">Reservado</th><th className="num">Coletado</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {reservations.map((r: any) => (
                      <tr key={r.id}>
                        <td><IdChip id={r.id} /></td>
                        <td><span className="chip-id">{r.sku}</span></td>
                        <td><Link href={`/warehouse/${r.location_id}`} className="link code">{r.location_code}</Link></td>
                        <td className="code text-secondary">{r.lot_code ?? "—"}</td>
                        <td className="num tnum">{fmtNumber(r.quantity)}</td>
                        <td className="num tnum">{fmtNumber(r.picked_qty)}</td>
                        <td>
                          <Badge tone={r.status === "CONSUMED" ? "success" : r.status === "ACTIVE" ? "warning" : "neutral"}>
                            {r.status === "CONSUMED" ? "Consumida" : r.status === "ACTIVE" ? "Ativa" : "Liberada"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* --------------------------------------------- conferencia */}
          {checkData && (
            <Card>
              <CardHeader
                title="Conferencia de expedicao"
                subtitle="Compara pedido x separacao x embalagem — divergencia bloqueia o embarque"
                action={<StatusBadge status={checkData.check.status} meta={CHECK_STATUS_META} />}
              />
              {checkData.check.status === "IN_PROGRESS" && (
                <>
                  <VolumeScanForm orderId={order.id} checkId={checkData.check.id} />
                  <div className="hr my-4" />
                </>
              )}
              <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
                <table className="table">
                  <thead>
                    <tr><th>SKU</th><th className="num">Pedido</th><th className="num">Separado</th>
                      <th className="num">Embalado</th><th className="num">Conferido</th>
                      <th className="num">Divergencia</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {checkData.items.map((ci: any) => (
                      <tr key={ci.id}>
                        <td><span className="chip-id">{ci.sku}</span></td>
                        <td className="num tnum">{fmtNumber(ci.ordered_qty)}</td>
                        <td className="num tnum">{fmtNumber(ci.picked_qty)}</td>
                        <td className="num tnum">{fmtNumber(ci.packed_qty)}</td>
                        <td className="num tnum">{fmtNumber(ci.checked_qty)}</td>
                        <td className={`num tnum ${ci.divergence === 0 ? "text-secondary" : "text-error-fg"}`}>
                          {ci.divergence === 0 ? "0" : `${ci.divergence > 0 ? "+" : ""}${fmtNumber(ci.divergence)}`}
                        </td>
                        <td>
                          <Badge tone={ci.status === "OK" ? "success" : ci.status === "DIVERGENCE" ? "error" : "neutral"}>
                            {ci.status === "OK" ? "Conforme" : ci.status === "DIVERGENCE" ? "Divergencia" : "Pendente"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {checkData.check.status === "IN_PROGRESS" && (
                <div className="mt-4">
                  <FinishShippingCheck
                    orderId={order.id} checkId={checkData.check.id}
                    disabled={openVolumes > 0}
                  />
                  {openVolumes > 0 && (
                    <p className="text-[12px] text-warning-fg mt-2">
                      {openVolumes} volume(s) ainda nao conferido(s).
                    </p>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>

        {/* ------------------------------------------------------ lateral */}
        <div className="flex flex-col gap-5">
          {picking && (
            <Card>
              <CardHeader
                title="Separacao"
                action={<StatusBadge status={picking.status} meta={PICKING_STATUS_META} />}
              />
              <Link href={`/picking/${picking.id}`} className="link code text-[13px]">{picking.id}</Link>
              <div className="mt-3">
                <div className="flex justify-between text-[12px] text-secondary mb-1.5">
                  <span>{picking.done_lines} de {picking.total_lines} linhas</span>
                  <span className="tnum">{fmtNumber(picking.picked_units)} un</span>
                </div>
                <Progress value={picking.done_lines} max={Math.max(1, picking.total_lines)}
                  tone={picking.status === "COMPLETED" ? "success" : "accent"} height={6} />
              </div>
              {picking.operator_name && (
                <p className="text-[12px] text-faint mt-2.5">Operador: {picking.operator_name}</p>
              )}
            </Card>
          )}

          {volumes.length > 0 && (
            <Card>
              <CardHeader
                title="Volumes"
                subtitle={`${volumes.length} volume(s) · ${fmtWeight(order.total_weight_kg, 1)}`}
                action={
                  <Link href={`/documents/packing-list/${order.id}`} className="btn btn-sm btn-ghost" aria-label="Imprimir packing list">
                    <IconPrint size={12} />
                  </Link>
                }
              />
              <ul className="flex flex-col gap-2">
                {volumes.map((v: any) => (
                  <li key={v.id} className="flex items-center gap-2.5 p-2.5 rounded-md border border-border bg-bg">
                    <Link href={`/documents/volume-label/${v.id}`} className="code text-[12.5px] link">{v.id}</Link>
                    <StatusBadge status={v.status} meta={VOLUME_STATUS_META} />
                    <span className="ml-auto text-[11.5px] text-secondary tnum">
                      {fmtWeight(v.gross_weight_kg, 1)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {invoice && (
            <Card>
              <CardHeader title="NF simulada de saida" action={
                <Link href={`/documents/invoice/${invoice.id}`} className="btn btn-sm"><IconPrint size={12} /> Abrir</Link>
              } />
              <MetaItem label="Numero" value={`${invoice.number}/${invoice.series}`} />
              <p className="text-[10px] tracking-[0.16em] uppercase text-warning-fg mt-3">
                Documento simulado — uso academico
              </p>
            </Card>
          )}

          <Card>
            <CardHeader title="Rastreabilidade" subtitle="Reserva → picking → packing → expedicao" />
            <Timeline nodes={trace.timeline} compact />
          </Card>
        </div>
      </div>
    </>
  );
}
