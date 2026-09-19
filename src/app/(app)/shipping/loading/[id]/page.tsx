import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLoading } from "@/domain/services/shipping";
import { PageHeader, Card, CardHeader, MetaItem, Metric, Progress, IdChip } from "@/components/ui/Primitives";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { LoadingScanner, CompleteLoading } from "../parts";
import { TASK_STATUS_META, VOLUME_STATUS_META } from "@/domain/states";
import { fmtNumber, fmtWeight, fmtDateTime, fmtTime } from "@/lib/format";
import { IconPrint, IconCheck, IconArrowRight } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Carregamento ${id}` };
}

export default async function LoadingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = getLoading(id);
  if (!data) notFound();
  const { loading, expected } = data;
  const missing = loading.expected_volumes - loading.loaded_volumes;
  const active = loading.status === "IN_PROGRESS";

  return (
    <>
      <PageHeader
        eyebrow={`Carregamento · ${loading.route}`}
        title={loading.id}
        description={`Romaneio ${loading.manifest_id} · veiculo ${loading.vehicle_plate ?? "—"} · motorista ${loading.driver_name ?? "—"}`}
        meta={
          <>
            <StatusBadge status={loading.status} meta={TASK_STATUS_META} />
            <MetaItem label="Doca" value={loading.dock_name ?? "—"} />
            <MetaItem label="Operador" value={loading.operator_name ?? "—"} />
            <MetaItem label="Inicio" value={fmtDateTime(loading.started_at)} />
            <MetaItem label="Lacre" value={loading.seal ?? "—"} />
          </>
        }
        actions={
          <>
            <Link href={`/documents/loading-checklist/${loading.id}`} className="btn btn-sm">
              <IconPrint size={13} /> Checklist de carregamento
            </Link>
            <Link href={`/shipping/manifests/${loading.manifest_id}`} className="btn btn-sm">
              Romaneio <IconArrowRight size={13} />
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <div className="xl:col-span-2 flex flex-col gap-5">
          {active && (
            <Card className="border-l-2 border-l-accent">
              <CardHeader
                title="Conferencia de carregamento"
                subtitle={`${loading.loaded_volumes} de ${loading.expected_volumes} volumes carregados`}
                action={
                  <span className="text-[26px] font-[family-name:var(--font-display)] font-semibold tnum text-accent-fg">
                    {loading.loaded_volumes}/{loading.expected_volumes}
                  </span>
                }
              />
              <Progress value={loading.loaded_volumes} max={Math.max(1, loading.expected_volumes)} height={6} />
              <div className="mt-5"><LoadingScanner loadingId={loading.id} /></div>
              {loading.loaded_volumes > 0 && (
                <div className="mt-5 pt-4 border-t border-border">
                  <CompleteLoading loadingId={loading.id} missing={missing} />
                </div>
              )}
            </Card>
          )}

          {!active && (
            <Card className={`border-l-2 ${loading.status === "COMPLETED" ? "border-l-success" : "border-l-warning"}`}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[15px] font-semibold">
                    {loading.status === "COMPLETED" ? "Carregamento concluido" : "Carregamento encerrado com divergencia"}
                  </p>
                  <p className="text-[12.5px] text-secondary mt-1">
                    {loading.loaded_volumes} de {loading.expected_volumes} volumes · lacre {loading.seal ?? "—"} ·
                    encerrado em {fmtDateTime(loading.completed_at)}
                  </p>
                </div>
                <Link href={`/shipping/manifests/${loading.manifest_id}`} className="btn btn-primary">
                  Expedir carga <IconArrowRight size={13} />
                </Link>
              </div>
            </Card>
          )}

          <Card padded={false}>
            <div className="p-5 pb-0">
              <CardHeader title="Volumes previstos" subtitle="Checklist do romaneio" />
            </div>
            <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
              <table className="table">
                <thead>
                  <tr><th>Parada</th><th>Volume</th><th>Pedido</th><th>Cliente</th><th>Status</th>
                    <th className="num">Peso</th><th>Carregado em</th></tr>
                </thead>
                <tbody>
                  {expected.map((v: any) => (
                    <tr key={v.id} className={v.scanned_at ? "" : "opacity-75"}>
                      <td className="tnum text-secondary">{v.stop_sequence}</td>
                      <td>
                        <span className="flex items-center gap-2">
                          <span className="code">{v.id}</span>
                          {v.scanned_at && <span className="text-success-fg"><IconCheck size={13} /></span>}
                        </span>
                      </td>
                      <td><IdChip id={v.sales_order_id} href={`/shipping/orders/${v.sales_order_id}`} /></td>
                      <td className="max-w-[170px] truncate">{v.customer_name}</td>
                      <td><StatusBadge status={v.status} meta={VOLUME_STATUS_META} /></td>
                      <td className="num tnum text-secondary">{fmtWeight(v.gross_weight_kg, 2)}</td>
                      <td className="text-secondary text-[12px]">{v.scanned_at ? fmtTime(v.scanned_at) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Resumo" />
            <div className="grid grid-cols-2 gap-4">
              <Metric label="Previsto" value={fmtNumber(loading.expected_volumes)} size="sm" />
              <Metric label="Carregado" value={fmtNumber(loading.loaded_volumes)} tone="accent" size="sm" />
              <Metric label="Faltante" value={fmtNumber(Math.max(0, missing))} tone={missing > 0 ? "warning" : "muted"} size="sm" />
              <Metric label="Peso" value={fmtNumber(expected.filter((v: any) => v.scanned_at).reduce((s: number, v: any) => s + v.gross_weight_kg, 0), 1)} unit="kg" size="sm" />
            </div>
          </Card>

          <Card>
            <CardHeader title="Veiculo" />
            <div className="flex flex-col gap-2.5 text-[12.5px]">
              <MetaItem label="Placa" value={loading.vehicle_plate ?? "—"} />
              <MetaItem label="Motorista" value={loading.driver_name ?? "—"} />
              <MetaItem label="Rota" value={loading.route} />
              <MetaItem label="Doca" value={loading.dock_name ?? "—"} />
              <MetaItem label="Lacre" value={loading.seal ?? loading.manifest_seal ?? "—"} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
