import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPicking, currentItem, pickingMetrics } from "@/domain/services/picking";
import { listEquipment } from "@/domain/services/equipment";
import { PageHeader, Card, CardHeader, MetaItem, Metric, Progress, IdChip } from "@/components/ui/Primitives";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { StartPicking, PickExecutor } from "./parts";
import {
  PICKING_STATUS_META, PICKING_ITEM_STATUS_META, PRIORITY_META,
} from "@/domain/states";
import { fmtNumber, fmtDuration, fmtDateTime, fmtDate } from "@/lib/format";
import { IconPrint, IconScan, IconArrowRight } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Picking ${id}` };
}

export default async function PickingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = getPicking(id);
  if (!data) notFound();
  const { picking, items } = data;
  const current = currentItem(id);
  const metrics = pickingMetrics(id);
  const scanners = listEquipment({ kind: "COLETORA" }).map((e) => ({ id: e.id, model: e.model }));

  return (
    <>
      <PageHeader
        eyebrow={`Separacao · ${picking.customer_name}`}
        title={picking.id}
        description={`Pedido ${picking.sales_order_id} · estrategia ${picking.strategy} · ${picking.total_lines} linhas`}
        meta={
          <>
            <StatusBadge status={picking.status} meta={PICKING_STATUS_META} />
            <StatusBadge status={picking.priority} meta={PRIORITY_META} dot={false} />
            <MetaItem label="Operador" value={picking.operator_name ?? "—"} />
            <MetaItem label="Inicio" value={fmtDateTime(picking.started_at)} />
            <MetaItem label="Conclusao" value={fmtDateTime(picking.completed_at)} />
          </>
        }
        actions={
          <>
            <Link href={`/documents/picklist/${picking.id}`} className="btn btn-sm"><IconPrint size={13} /> Picklist</Link>
            <Link href={`/mobile/picking?id=${picking.id}`} className="btn btn-sm btn-primary"><IconScan size={13} /> Coletora</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Card className="p-4"><Metric label="Linhas" value={`${picking.done_lines}/${picking.total_lines}`} size="sm" /></Card>
        <Card className="p-4"><Metric label="Unidades" value={`${fmtNumber(picking.picked_units)}/${fmtNumber(picking.total_units)}`} size="sm" /></Card>
        <Card className="p-4">
          <Metric label="Tempo de localizacao" value={metrics.avgLocateMinutes === null ? "—" : fmtDuration(metrics.avgLocateMinutes)} size="sm" hint="media por linha" />
        </Card>
        <Card className="p-4">
          <Metric label="Produtividade" value={metrics.linesPerHour === null ? "—" : fmtNumber(metrics.linesPerHour, 1)} unit="lin/h" tone="accent" size="sm" />
        </Card>
        <Card className="p-4">
          <Metric label="Divergencias" value={fmtNumber(metrics.divergences)} tone={metrics.divergences > 0 ? "warning" : "muted"} size="sm" />
        </Card>
      </div>

      {picking.status === "PENDING" && (
        <Card className="mb-5 border-l-2 border-l-accent">
          <CardHeader title="Iniciar separacao" subtitle="Selecione a coletora que sera usada na operacao" />
          <StartPicking pickingId={picking.id} equipment={scanners} />
        </Card>
      )}

      {picking.status === "IN_PROGRESS" && current && (
        <div className="mb-5">
          <PickExecutor pickingId={picking.id} item={current} />
        </div>
      )}

      {["COMPLETED", "DIVERGENCE"].includes(picking.status) && (
        <Card className="mb-5 border-l-2 border-l-success">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[15px] font-semibold text-primary">Separacao concluida</p>
              <p className="text-[12.5px] text-secondary mt-1">
                {picking.done_lines} linhas · {fmtNumber(picking.picked_units)} unidades
                {metrics.divergences > 0 && ` · ${metrics.divergences} divergencia(s) registrada(s)`}
              </p>
            </div>
            <Link href={`/shipping/orders/${picking.sales_order_id}`} className="btn btn-primary">
              Seguir para embalagem <IconArrowRight size={13} />
            </Link>
          </div>
        </Card>
      )}

      <Card padded={false}>
        <div className="p-5 pb-0">
          <CardHeader
            title="Linhas da picklist"
            subtitle="Sequencia otimizada pela rota fisica do armazem"
            action={
              <div className="w-[160px]">
                <Progress value={picking.done_lines} max={Math.max(1, picking.total_lines)}
                  tone={picking.status === "COMPLETED" ? "success" : "accent"} height={6} />
              </div>
            }
          />
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>Endereco</th><th>Zona</th><th>SKU</th><th>Produto</th>
                <th>Lote</th><th>Validade</th><th className="num">Esperado</th>
                <th className="num">Coletado</th><th>Status</th><th>Operador</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: any) => (
                <tr key={it.id} className={current?.id === it.id ? "bg-[#171C18]" : undefined}>
                  <td className="tnum text-secondary">{it.sequence}</td>
                  <td>
                    <Link href={`/warehouse/${it.location_id}`} className="link code font-medium">
                      {it.location_code}
                    </Link>
                  </td>
                  <td className="text-secondary text-[12px]">{it.zone_name}</td>
                  <td><span className="chip-id">{it.sku}</span></td>
                  <td className="max-w-[200px] truncate" title={it.description}>{it.description}</td>
                  <td className="code text-secondary">{it.lot_code ?? "—"}</td>
                  <td className="text-secondary text-[12px]">{it.expires_at ? fmtDate(it.expires_at) : "—"}</td>
                  <td className="num tnum">{fmtNumber(it.expected_qty)}</td>
                  <td className="num tnum">
                    <span className={it.picked_qty === it.expected_qty ? "text-success" : it.picked_qty > 0 ? "text-warning" : "text-faint"}>
                      {it.status === "PENDING" ? "—" : fmtNumber(it.picked_qty)}
                    </span>
                  </td>
                  <td><StatusBadge status={it.status} meta={PICKING_ITEM_STATUS_META} /></td>
                  <td className="text-secondary text-[12px]">{it.operator_id ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
