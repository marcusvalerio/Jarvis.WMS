import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getManifest, eligibleOrdersForManifest } from "@/domain/services/shipping";
import { listDocks } from "@/domain/services/warehouse";
import { listEquipment } from "@/domain/services/equipment";
import { PageHeader, Card, CardHeader, MetaItem, Metric, EmptyState, IdChip, Progress } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/Badge";
import { Barcode } from "@/components/Barcode";
import { AddOrder, RemoveOrder, ReleaseManifest, StartLoading, ShipManifest } from "../parts";
import { MANIFEST_STATUS_META, VOLUME_STATUS_META, TASK_STATUS_META } from "@/domain/states";
import { fmtNumber, fmtWeight, fmtMoney, fmtDateTime } from "@/lib/format";
import { IconPrint, IconArrowRight } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Romaneio ${id}` };
}

export default async function ManifestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = getManifest(id);
  if (!data) notFound();
  const { manifest, orders, loading, transportDoc } = data;

  const eligible = eligibleOrdersForManifest().map((o: any) => ({
    id: o.id, label: `${o.id} — ${o.customer_name} (${o.volume_count} vol)`,
  }));
  const docks = listDocks().filter((d) => d.kind !== "INBOUND").map((d) => ({ id: d.id, name: d.name }));
  const forklifts = listEquipment({ kind: "EMPILHADEIRA" }).map((e) => ({ id: e.id, model: e.model }));

  return (
    <>
      <PageHeader
        eyebrow={`Romaneio de carga · ${manifest.route}`}
        title={manifest.id}
        description={`${manifest.carrier ?? "—"} · ${manifest.vehicle_kind ?? ""} placa ${manifest.vehicle_plate ?? "—"} · motorista ${manifest.driver_name ?? "—"}`}
        meta={
          <>
            <StatusBadge status={manifest.status} meta={MANIFEST_STATUS_META} />
            <MetaItem label="Doca" value={manifest.dock_name ?? "—"} />
            <MetaItem label="Lacre" value={manifest.seal ?? "—"} />
            <MetaItem label="Criado" value={fmtDateTime(manifest.created_at)} />
            <MetaItem label="Saida" value={fmtDateTime(manifest.departed_at)} />
          </>
        }
        actions={
          <>
            <Link href={`/documents/manifest/${manifest.id}`} className="btn btn-sm"><IconPrint size={13} /> Romaneio</Link>
            {transportDoc && (
              <Link href={`/documents/transport/${transportDoc.id}`} className="btn btn-sm">
                <IconPrint size={13} /> Documento de transporte
              </Link>
            )}
            {loading && (
              <Link href={`/documents/loading-checklist/${loading.id}`} className="btn btn-sm">
                <IconPrint size={13} /> Checklist
              </Link>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Card className="p-4"><Metric label="Pedidos" value={fmtNumber(manifest.total_orders)} size="sm" /></Card>
        <Card className="p-4"><Metric label="Volumes" value={fmtNumber(manifest.total_volumes)} tone="accent" size="sm" /></Card>
        <Card className="p-4"><Metric label="Peso total" value={fmtNumber(manifest.total_weight_kg, 1)} unit="kg" size="sm" /></Card>
        <Card className="p-4"><Metric label="Valor da carga" value={fmtMoney(manifest.total_value)} size="sm" /></Card>
      </div>

      {/* ---------------------------------------------------- proxima etapa */}
      <Card className="mb-5 border-l-2 border-l-accent">
        <CardHeader title="Proxima etapa" />
        {manifest.status === "DRAFT" && (
          <div className="flex flex-col gap-4">
            <AddOrder manifestId={manifest.id} orders={eligible} />
            {orders.length > 0 && (
              <>
                <div className="hr" />
                <ReleaseManifest manifestId={manifest.id} />
              </>
            )}
          </div>
        )}
        {manifest.status === "READY" && (
          <StartLoading
            manifestId={manifest.id} docks={docks} equipment={forklifts}
            defaultDock={manifest.dock_id}
          />
        )}
        {manifest.status === "LOADING" && loading && (
          <div className="flex flex-wrap items-center gap-4">
            <Link href={`/shipping/loading/${loading.id}`} className="btn btn-primary">
              Continuar carregamento {loading.id} <IconArrowRight size={13} />
            </Link>
            <div className="flex-1 min-w-[190px]">
              <div className="flex justify-between text-[12px] text-secondary mb-1.5">
                <span>Volumes carregados</span>
                <span className="tnum">{loading.loaded_volumes}/{loading.expected_volumes}</span>
              </div>
              <Progress value={loading.loaded_volumes} max={Math.max(1, loading.expected_volumes)} height={6} />
            </div>
          </div>
        )}
        {manifest.status === "LOADED" && (
          <div className="flex flex-wrap items-center gap-5">
            <ShipManifest manifestId={manifest.id} />
            <p className="text-[12.5px] text-secondary max-w-md">
              Carga conferida e lacrada ({manifest.seal}). A expedicao dara baixa definitiva no estoque.
            </p>
          </div>
        )}
        {manifest.status === "SHIPPED" && (
          <p className="text-[13px] text-success-fg">
            Carga expedida em {fmtDateTime(manifest.departed_at)} — estoque baixado e pedidos encerrados.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <Card className="xl:col-span-2" padded={false}>
          <div className="p-5 pb-0">
            <CardHeader title="Pedidos da carga" subtitle="Sequencia de entrega por parada" />
          </div>
          {orders.length === 0 ? (
            <EmptyState title="Romaneio vazio" description="Inclua pedidos prontos para carregar." />
          ) : (
            <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
              <table className="table">
                <thead>
                  <tr><th>Parada</th><th>Pedido</th><th>Cliente</th><th>CNPJ</th><th>Destino</th>
                    <th className="num">Volumes</th><th className="num">Peso</th><th className="num">Valor</th>
                    {manifest.status === "DRAFT" && <th />}</tr>
                </thead>
                <tbody>
                  {orders.map((o: any) => (
                    <tr key={o.id}>
                      <td className="tnum text-secondary">{o.stop_sequence}</td>
                      <td><IdChip id={o.sales_order_id} href={`/shipping/orders/${o.sales_order_id}`} /></td>
                      <td className="max-w-[180px] truncate">{o.customer_name}</td>
                      <td className="code text-secondary text-[11.5px]">{o.customer_cnpj}</td>
                      <td className="text-secondary">{o.city}/{o.state}</td>
                      <td className="num tnum">{o.volumes}</td>
                      <td className="num tnum text-secondary">{fmtWeight(o.weight_kg, 1)}</td>
                      <td className="num tnum text-secondary">{fmtMoney(o.total_value)}</td>
                      {manifest.status === "DRAFT" && (
                        <td><RemoveOrder manifestId={manifest.id} orderId={o.sales_order_id} /></td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {orders.length > 0 && (
            <div className="p-5 pt-4 border-t border-border">
              <p className="label mb-3">Volumes da carga</p>
              <div className="flex flex-wrap gap-2">
                {orders.flatMap((o: any) => o.volumeList).map((v: any) => (
                  <Link
                    key={v.id} href={`/documents/volume-label/${v.id}`}
                    className="flex items-center gap-2 px-2.5 h-8 rounded-md border border-border bg-bg hover:border-border-strong transition-colors"
                  >
                    <span className="code text-[11.5px]">{v.id}</span>
                    <StatusBadge status={v.status} meta={VOLUME_STATUS_META} dot={false} />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Identificacao da carga" subtitle="Code 128 do romaneio" />
            <div className="flex justify-center py-2">
              <Barcode value={manifest.id} height={58} moduleWidth={2} />
            </div>
          </Card>

          {loading && (
            <Card>
              <CardHeader
                title="Carregamento"
                subtitle={`Operador ${loading.operator_name ?? "—"}`}
                action={<StatusBadge status={loading.status} meta={TASK_STATUS_META} />}
              />
              <div className="flex justify-between text-[12.5px] text-secondary mb-2">
                <span>Volumes</span>
                <span className="tnum">{loading.loaded_volumes}/{loading.expected_volumes}</span>
              </div>
              <Progress value={loading.loaded_volumes} max={Math.max(1, loading.expected_volumes)} height={6}
                tone={loading.status === "COMPLETED" ? "success" : "accent"} />
              <div className="flex flex-col gap-2 mt-4 text-[12.5px]">
                <MetaItem label="Inicio" value={fmtDateTime(loading.started_at)} />
                <MetaItem label="Termino" value={fmtDateTime(loading.completed_at)} />
                <MetaItem label="Lacre" value={loading.seal ?? "—"} />
              </div>
              <Link href={`/shipping/loading/${loading.id}`} className="btn w-full mt-4">
                Abrir carregamento
              </Link>
            </Card>
          )}

          {transportDoc && (
            <Card>
              <CardHeader
                title="Documento de transporte"
                action={
                  <Link href={`/documents/transport/${transportDoc.id}`} className="btn btn-sm" aria-label="Imprimir documento de transporte">
                    <IconPrint size={12} />
                  </Link>
                }
              />
              <div className="flex flex-col gap-2 text-[12.5px]">
                <MetaItem label="Numero" value={`${transportDoc.number}/${transportDoc.series}`} />
                <MetaItem label="Transportador" value={transportDoc.carrier_name} />
                <MetaItem label="Origem" value={transportDoc.origin_city ?? "—"} />
                <MetaItem label="Destino" value={transportDoc.destination_city ?? "—"} />
                <MetaItem label="Frete" value={fmtMoney(transportDoc.freight_value)} />
              </div>
              <p className="text-[10px] tracking-[0.16em] uppercase text-warning-fg mt-3">
                Documento simulado — uso academico
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
