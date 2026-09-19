import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getInbound, listStorageOrders } from "@/domain/services/receiving";
import { listDocks, locationMap } from "@/domain/services/warehouse";
import { listEquipment } from "@/domain/services/equipment";
import { traceInbound } from "@/domain/services/traceability";
import { all } from "@/lib/db";
import {
  PageHeader, Card, CardHeader, MetaItem, EmptyState, IdChip, SectionTitle,
} from "@/components/ui/Primitives";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Barcode } from "@/components/Barcode";
import { Timeline } from "@/components/Timeline";
import {
  INBOUND_STATUS_META, CHECK_STATUS_META, PALLET_STATUS_META,
  TASK_STATUS_META, INCIDENT_STATUS_META, INCIDENT_KIND_LABEL,
} from "@/domain/states";
import { fmtDateTime, fmtNumber, fmtWeight, fmtDate } from "@/lib/format";
import {
  ArrivalForm, StartReceiving, StartCheck, GenerateStorage, IssueInvoice,
  WeighingForm, CheckPanel, ApproveDivergenceForm, PalletBuilder, StorageExecutor,
} from "./parts";
import { IconPrint, IconAlert } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Recebimento ${id}` };
}

export default async function InboundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getInbound(id);
  if (!data) notFound();

  const { order, items, invoice, weighings, check, checkItems, pallets, storageOrders, incidents } = data;
  const docks = (await listDocks()).filter((d) => d.kind !== "OUTBOUND");
  const scales = (await listEquipment({ kind: "BALANCA" })).map((e) => ({ id: e.id, model: e.model }));
  const freeLocations = (await locationMap({ status: "AVAILABLE" }))
    .concat(await locationMap({ status: "RESERVED" }))
    .filter((l) => l.kind === "PALLET")
    .map((l) => ({ id: l.id, code: l.code, zone: l.zone_name }))
    .sort((a, b) => a.code.localeCompare(b.code));
  const trace = await traceInbound(id);

  const checkClosed = !check || check.status !== "IN_PROGRESS";
  const pendingStorage = storageOrders.filter((s: any) => s.status !== "COMPLETED");
  const palletsAwaiting = pallets.filter((p: any) => p.status === "AWAITING_PUTAWAY");

  return (
    <>
      <PageHeader
        eyebrow={`Recebimento · ${order.supplier_name}`}
        title={order.id}
        description={`Pedido de compra ${order.purchase_order_id ?? "—"} · veiculo ${order.vehicle_plate ?? "—"} · motorista ${order.driver_name ?? "—"}`}
        meta={
          <>
            <StatusBadge status={order.status} meta={INBOUND_STATUS_META} />
            <MetaItem label="Agendado" value={fmtDateTime(order.scheduled_at)} />
            <MetaItem label="Chegada" value={fmtDateTime(order.arrived_at)} />
            <MetaItem label="Doca" value={order.dock_name ?? "—"} />
            <MetaItem label="Peso previsto" value={fmtWeight(order.expected_weight_kg)} />
          </>
        }
        actions={
          <>
            <Link href={`/documents/inbound-order/${order.id}`} className="btn btn-sm">
              <IconPrint size={13} /> Ordem de recebimento
            </Link>
            {invoice && (
              <Link href={`/documents/invoice/${invoice.id}`} className="btn btn-sm">
                <IconPrint size={13} /> NF simulada
              </Link>
            )}
            <Link href={`/documents/receiving-checklist/${order.id}`} className="btn btn-sm">
              <IconPrint size={13} /> Checklist
            </Link>
          </>
        }
      />

      {/* --------------------------------------------------------- proxima acao */}
      <Card className="mb-5 border-l-2 border-l-accent">
        <CardHeader
          title="Proxima etapa"
          subtitle={INBOUND_STATUS_META[order.status as keyof typeof INBOUND_STATUS_META]?.description}
        />
        {order.status === "SCHEDULED" && (
          <ArrivalForm
            inboundId={order.id}
            docks={docks}
            defaults={{
              plate: order.vehicle_plate, driver: order.driver_name,
              doc: order.driver_doc, dock: order.dock_id,
            }}
          />
        )}
        {order.status === "ARRIVING" && (
          <div className="flex flex-wrap items-center gap-4">
            <StartReceiving inboundId={order.id} />
            {!invoice && <IssueInvoice inboundId={order.id} />}
            <p className="text-[12.5px] text-secondary">
              Veiculo na doca {order.dock_name}. Inicie a descarga para liberar pesagem e conferencia.
            </p>
          </div>
        )}
        {order.status === "RECEIVING" && (
          <div className="flex flex-wrap items-center gap-4">
            <StartCheck inboundId={order.id} />
            <p className="text-[12.5px] text-secondary">
              Registre a pesagem abaixo e inicie a conferencia fisica da carga.
            </p>
          </div>
        )}
        {order.status === "CHECKING" && (
          <p className="text-[12.5px] text-secondary">
            Conferencia em andamento — confirme cada linha no painel de conferencia.
          </p>
        )}
        {order.status === "DIVERGENCE" && <ApproveDivergenceForm inboundId={order.id} />}
        {order.status === "APPROVED" && (
          <div className="flex flex-wrap items-center gap-4">
            {palletsAwaiting.length > 0 && pendingStorage.length === 0 && (
              <GenerateStorage inboundId={order.id} />
            )}
            <p className="text-[12.5px] text-secondary">
              {pallets.length === 0
                ? "Monte os paletes com as quantidades conferidas."
                : pendingStorage.length > 0
                  ? `${pendingStorage.length} palete(s) aguardando enderecamento.`
                  : "Gere as ordens de armazenagem para enderecar os paletes."}
            </p>
          </div>
        )}
        {order.status === "COMPLETED" && (
          <p className="text-[13px] text-success-fg flex items-center gap-2">
            Recebimento concluido em {fmtDateTime(order.completed_at)} — todos os paletes armazenados.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <div className="xl:col-span-2 flex flex-col gap-5">
          {/* ----------------------------------------------------- itens */}
          <Card padded={false}>
            <div className="p-5 pb-0">
              <CardHeader
                title="Itens da carga"
                subtitle={`${items.length} linha(s) · ${fmtNumber(items.reduce((s: number, i: any) => s + i.expected_qty, 0))} unidades previstas`}
              />
            </div>
            <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
              <table className="table">
                <thead>
                  <tr>
                    <th>SKU</th><th>Descricao</th><th>Lote</th><th>Validade</th>
                    <th className="num">Previsto</th><th className="num">Conferido</th>
                    <th className="num">Divergencia</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: any) => {
                    const d = it.checked_qty - it.expected_qty;
                    return (
                      <tr key={it.id}>
                        <td><span className="chip-id">{it.sku}</span></td>
                        <td className="max-w-[220px] truncate" title={it.description}>{it.description}</td>
                        <td className="code text-secondary">{it.lot_code ?? "—"}</td>
                        <td className="text-secondary">{it.expires_at ? fmtDate(it.expires_at) : "—"}</td>
                        <td className="num tnum">{fmtNumber(it.expected_qty)}</td>
                        <td className="num tnum">{it.status === "PENDING" ? "—" : fmtNumber(it.checked_qty)}</td>
                        <td className={`num tnum ${d === 0 ? "text-secondary" : "text-warning-fg"}`}>
                          {it.status === "PENDING" ? "—" : d === 0 ? "0" : `${d > 0 ? "+" : ""}${fmtNumber(d)}`}
                        </td>
                        <td>
                          <Badge tone={it.status === "OK" ? "success" : it.status === "DIVERGENCE" ? "warning" : "neutral"}>
                            {it.status === "OK" ? "Conforme" : it.status === "DIVERGENCE" ? "Divergencia" : "Pendente"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ----------------------------------------------------- conferencia */}
          {check && (
            <Card>
              <CardHeader
                title="Conferencia fisica"
                subtitle={`Iniciada em ${fmtDateTime(check.started_at)}`}
                action={<StatusBadge status={check.status} meta={CHECK_STATUS_META} />}
              />
              <CheckPanel
                inboundId={order.id} checkId={check.id}
                items={checkItems} closed={checkClosed}
              />
            </Card>
          )}

          {/* ----------------------------------------------------- paletizacao */}
          {["APPROVED", "DIVERGENCE", "COMPLETED"].includes(order.status) && (
            <Card>
              <CardHeader
                title="Paletizacao"
                subtitle="Monte paletes a partir das quantidades conferidas"
              />
              {order.status !== "COMPLETED" && (
                <PalletBuilder inboundId={order.id} items={checkItems} />
              )}
              {pallets.length > 0 && (
                <>
                  <div className="hr my-4" />
                  <SectionTitle>Paletes montados ({pallets.length})</SectionTitle>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {pallets.map((p: any) => (
                      <Link
                        key={p.id} href={`/warehouse/pallets/${p.id}`}
                        className="flex items-center gap-3 p-3 rounded-md border border-border bg-bg hover:border-border-strong transition-colors"
                      >
                        <Barcode value={p.id} height={34} moduleWidth={1.4} showText={false} quietZone={6} />
                        <span className="min-w-0">
                          <span className="block code text-[12.5px]">{p.id}</span>
                          <span className="block text-[11.5px] text-secondary mt-0.5">
                            {p.line_count} item(ns) · {fmtWeight(p.net_weight_kg, 1)}
                          </span>
                          <span className="block mt-1">
                            <StatusBadge status={p.status} meta={PALLET_STATUS_META} />
                          </span>
                        </span>
                        <span className="ml-auto text-[11.5px] text-faint">{p.location_code ?? ""}</span>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </Card>
          )}

          {/* ----------------------------------------------------- armazenagem */}
          {storageOrders.length > 0 && (
            <Card>
              <CardHeader
                title="Ordens de armazenagem"
                subtitle={`${pendingStorage.length} pendente(s) de ${storageOrders.length}`}
                action={
                  <Link href="/warehouse/storage" className="btn btn-sm btn-ghost">Fila completa</Link>
                }
              />
              <div className="flex flex-col gap-3">
                {storageOrders.map((so: any) => (
                  so.status === "COMPLETED" ? (
                    <div key={so.id} className="flex items-center gap-3 p-3 rounded-md border border-border bg-bg">
                      <IdChip id={so.id} />
                      <span className="text-[12.5px] text-secondary">
                        Palete <span className="code">{so.pallet_id}</span> armazenado em{" "}
                        <span className="text-accent-fg font-medium">{so.final_code}</span>
                      </span>
                      <span className="ml-auto"><StatusBadge status={so.status} meta={TASK_STATUS_META} /></span>
                    </div>
                  ) : (
                    <StorageExecutor
                      key={so.id} inboundId={order.id} order={so} locations={freeLocations}
                    />
                  )
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* ----------------------------------------------------------- lateral */}
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Pesagem" subtitle="Comprovante gerado a cada aferição" />
            {["RECEIVING", "CHECKING", "DIVERGENCE", "APPROVED"].includes(order.status) && (
              <WeighingForm
                refKind="INBOUND_ORDER" refId={order.id}
                expectedKg={order.expected_weight_kg} equipment={scales}
              />
            )}
            {weighings.length > 0 ? (
              <ul className="flex flex-col gap-2 mt-4">
                {weighings.map((w: any) => (
                  <li key={w.id} className="p-3 rounded-md border border-border bg-bg">
                    <div className="flex items-center justify-between gap-2">
                      <IdChip id={w.id} />
                      <Link href={`/documents/weighing/${w.id}`} className="btn btn-sm btn-ghost">
                        <IconPrint size={12} /> Comprovante
                      </Link>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2.5 text-center">
                      <div><p className="label">Bruto</p><p className="text-[13px] tnum">{fmtNumber(w.gross_kg, 3)}</p></div>
                      <div><p className="label">Tara</p><p className="text-[13px] tnum">{fmtNumber(w.tare_kg, 3)}</p></div>
                      <div><p className="label">Liquido</p><p className="text-[13px] tnum text-accent-fg">{fmtNumber(w.net_kg, 3)}</p></div>
                    </div>
                    {w.divergence_kg !== 0 && (
                      <p className="text-[11.5px] text-warning-fg mt-2">
                        Divergencia de {fmtNumber(w.divergence_kg, 3)} kg sobre o previsto
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-faint mt-3">Nenhuma pesagem registrada.</p>
            )}
          </Card>

          {invoice && (
            <Card>
              <CardHeader
                title="Nota fiscal simulada"
                action={
                  <Link href={`/documents/invoice/${invoice.id}`} className="btn btn-sm">
                    <IconPrint size={12} /> Abrir
                  </Link>
                }
              />
              <div className="flex flex-col gap-2 text-[12.5px]">
                <MetaItem label="Numero" value={`${invoice.number}/${invoice.series}`} />
                <MetaItem label="Emissao" value={fmtDateTime(invoice.issued_at)} />
                <MetaItem label="Valor" value={fmtNumber(invoice.total_invoice, 2)} />
                <MetaItem label="Peso" value={fmtWeight(invoice.total_weight_kg)} />
              </div>
              <p className="text-[10px] tracking-[0.16em] uppercase text-warning-fg mt-3">
                Documento simulado — uso academico
              </p>
            </Card>
          )}

          {incidents.length > 0 && (
            <Card>
              <CardHeader
                title="Ocorrencias"
                subtitle={`${incidents.length} registrada(s) neste recebimento`}
                action={<Link href="/incidents" className="btn btn-sm btn-ghost">Modulo</Link>}
              />
              <ul className="flex flex-col gap-2">
                {incidents.map((i: any) => (
                  <li key={i.id} className="p-3 rounded-md border border-warning-line bg-warning-soft">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[11.5px] text-warning-fg">
                        {INCIDENT_KIND_LABEL[i.kind as keyof typeof INCIDENT_KIND_LABEL] ?? i.kind}
                      </span>
                      <StatusBadge status={i.status} meta={INCIDENT_STATUS_META} />
                    </div>
                    <p className="text-[12.5px] text-primary leading-snug">{i.description}</p>
                    <p className="text-[11px] text-faint mt-1.5">{i.id} · {fmtDateTime(i.opened_at)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="Rastreabilidade" subtitle="Cadeia completa deste recebimento" />
            <Timeline nodes={trace.timeline} compact />
          </Card>
        </div>
      </div>
    </>
  );
}
