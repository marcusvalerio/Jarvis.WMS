import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPacking, getVolume } from "@/domain/services/packing";
import { PageHeader, Card, CardHeader, MetaItem, Metric, EmptyState, IdChip, Progress } from "@/components/ui/Primitives";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Barcode } from "@/components/Barcode";
import {
  StartPacking, CreateVolume, AddToVolume, RemoveFromVolume, CloseVolume, CompletePacking,
} from "./parts";
import { TASK_STATUS_META, VOLUME_STATUS_META } from "@/domain/states";
import { fmtNumber, fmtWeight, fmtDateTime, fmtDimensions, round3 } from "@/lib/format";
import { IconPrint, IconArrowRight } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Packing ${id}` };
}

export default async function PackingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = getPacking(id);
  if (!data) notFound();
  const { packing, items, volumes } = data;

  const remaining = items.map((i: any) => ({
    product_id: i.product_id, sku: i.sku, unit: i.unit,
    remaining: round3(i.expected_qty - i.packed_qty),
  })).filter((i: any) => i.remaining > 0);

  const totalExpected = items.reduce((s: number, i: any) => s + i.expected_qty, 0);
  const totalPacked = items.reduce((s: number, i: any) => s + i.packed_qty, 0);
  const openVolumes = volumes.filter((v: any) => v.status === "OPEN");
  const done = packing.status === "COMPLETED";

  const volumeDetails = volumes.map((v: any) => getVolume(v.id)!);

  return (
    <>
      <PageHeader
        eyebrow={`Embalagem · ${packing.customer_name}`}
        title={packing.id}
        description={`Pedido ${packing.sales_order_id} · estacao ${packing.station ?? "—"}`}
        meta={
          <>
            <StatusBadge status={packing.status} meta={TASK_STATUS_META} />
            <MetaItem label="Operador" value={packing.operator_name ?? "—"} />
            <MetaItem label="Criada" value={fmtDateTime(packing.created_at)} />
            <MetaItem label="Concluida" value={fmtDateTime(packing.completed_at)} />
          </>
        }
        actions={
          <>
            <Link href={`/shipping/orders/${packing.sales_order_id}`} className="btn btn-sm">Pedido</Link>
            {volumes.length > 0 && (
              <Link href={`/documents/packing-list/${packing.sales_order_id}`} className="btn btn-sm">
                <IconPrint size={13} /> Packing list
              </Link>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Card className="p-4"><Metric label="A embalar" value={fmtNumber(totalExpected)} size="sm" /></Card>
        <Card className="p-4"><Metric label="Embalado" value={fmtNumber(totalPacked)} tone={totalPacked >= totalExpected ? "success" : "accent"} size="sm" /></Card>
        <Card className="p-4"><Metric label="Volumes" value={fmtNumber(volumes.length)} size="sm" /></Card>
        <Card className="p-4"><Metric label="Peso total" value={fmtNumber(volumes.reduce((s: number, v: any) => s + v.gross_weight_kg, 0), 2)} unit="kg" size="sm" /></Card>
      </div>

      {packing.status === "PENDING" && (
        <Card className="mb-5 border-l-2 border-l-accent">
          <CardHeader title="Iniciar embalagem" subtitle="Abre a estacao e libera a criacao de volumes" />
          <StartPacking packingId={packing.id} />
        </Card>
      )}

      {packing.status === "IN_PROGRESS" && (
        <Card className="mb-5 border-l-2 border-l-accent">
          <CardHeader
            title="Material separado a embalar"
            subtitle="So e possivel embalar o que foi efetivamente coletado no picking"
            action={<CreateVolume packingId={packing.id} />}
          />
          <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
            <table className="table">
              <thead>
                <tr><th>SKU</th><th>Lote</th><th className="num">Separado</th><th className="num">Embalado</th>
                  <th className="num">Restante</th><th style={{ width: 130 }}>Progresso</th></tr>
              </thead>
              <tbody>
                {items.map((i: any) => (
                  <tr key={i.id}>
                    <td><span className="chip-id">{i.sku}</span></td>
                    <td className="code text-secondary">{i.lot_code ?? "—"}</td>
                    <td className="num tnum">{fmtNumber(i.expected_qty)}</td>
                    <td className="num tnum">{fmtNumber(i.packed_qty)}</td>
                    <td className="num tnum">
                      <span className={i.packed_qty >= i.expected_qty ? "text-success" : "text-warning"}>
                        {fmtNumber(round3(i.expected_qty - i.packed_qty))}
                      </span>
                    </td>
                    <td>
                      <Progress value={i.packed_qty} max={Math.max(1, i.expected_qty)}
                        tone={i.packed_qty >= i.expected_qty ? "success" : "accent"} label={`Embalagem de ${i.sku}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {remaining.length === 0 && (
            <div className="mt-5 flex items-center gap-4">
              <CompletePacking packingId={packing.id} disabled={volumes.length === 0} />
              <p className="text-[12.5px] text-secondary">
                Todo o material separado esta embalado. Concluir fecha os volumes abertos e libera a conferencia.
              </p>
            </div>
          )}
        </Card>
      )}

      {done && (
        <Card className="mb-5 border-l-2 border-l-success">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[15px] font-semibold">Embalagem concluida</p>
              <p className="text-[12.5px] text-secondary mt-1">
                {packing.total_volumes} volume(s) · {fmtWeight(packing.total_weight_kg, 2)}
              </p>
            </div>
            <Link href={`/shipping/orders/${packing.sales_order_id}`} className="btn btn-primary">
              Seguir para conferencia <IconArrowRight size={13} />
            </Link>
          </div>
        </Card>
      )}

      {volumes.length === 0 ? (
        <Card><EmptyState title="Nenhum volume criado" description="Crie o primeiro volume para comecar a embalar." /></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {volumeDetails.map(({ volume, items: vItems }: any) => (
            <Card key={volume.id}>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[17px] font-[family-name:var(--font-display)] font-semibold">{volume.id}</span>
                    <StatusBadge status={volume.status} meta={VOLUME_STATUS_META} />
                  </div>
                  <p className="text-[12px] text-secondary">
                    {volume.container_kind} · {fmtDimensions(volume.length_cm, volume.width_cm, volume.height_cm)}
                  </p>
                  <p className="text-[12px] text-secondary mt-0.5">
                    liquido {fmtWeight(volume.net_weight_kg, 2)} · bruto {fmtWeight(volume.gross_weight_kg, 2)}
                  </p>
                </div>
                <Barcode value={volume.id} height={38} moduleWidth={1.4} showText={false} quietZone={6} />
              </div>

              {vItems.length === 0 ? (
                <p className="text-[12.5px] text-faint">Volume vazio.</p>
              ) : (
                <ul className="flex flex-col gap-1.5 mb-4">
                  {vItems.map((vi: any) => (
                    <li key={vi.id} className="flex items-center gap-2 py-1.5 px-2.5 rounded-md bg-bg border border-border">
                      <span className="chip-id">{vi.sku}</span>
                      <span className="text-[12px] text-secondary truncate flex-1">{vi.description}</span>
                      <span className="text-[13px] tnum">{fmtNumber(vi.quantity)} {vi.unit}</span>
                      {volume.status === "OPEN" && (
                        <RemoveFromVolume packingId={packing.id} volumeId={volume.id} productId={vi.product_id} />
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {volume.status === "OPEN" && packing.status === "IN_PROGRESS" && (
                <>
                  <AddToVolume packingId={packing.id} volumeId={volume.id} items={remaining} />
                  {vItems.length > 0 && (
                    <div className="mt-3"><CloseVolume packingId={packing.id} volumeId={volume.id} /></div>
                  )}
                </>
              )}

              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                <Link href={`/documents/volume-label/${volume.id}`} className="btn btn-sm">
                  <IconPrint size={12} /> Etiqueta do volume
                </Link>
                <span className="text-[11.5px] text-faint">Sequencia {volume.sequence}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
