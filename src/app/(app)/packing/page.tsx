import Link from "next/link";
import type { Metadata } from "next";
import { listPacking, listVolumes } from "@/domain/services/packing";
import { PageHeader, Card, EmptyState, IdChip, Metric } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/Badge";
import { FilterBar } from "@/components/FilterBar";
import { TASK_STATUS, TASK_STATUS_META, VOLUME_STATUS_META, PRIORITY_META } from "@/domain/states";
import { fmtNumber, fmtWeight, fmtDateTime } from "@/lib/format";
import { IconPack, IconArrowRight, IconPrint } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Packing" };
export const dynamic = "force-dynamic";

export default async function PackingPage({
  searchParams,
}: { searchParams: Promise<{ status?: string; search?: string }> }) {
  const sp = await searchParams;
  const rows = listPacking({ status: sp.status, search: sp.search });
  const volumes = listVolumes();

  return (
    <>
      <PageHeader
        eyebrow="Saida"
        title="Packing"
        description="Embalagem do que foi efetivamente separado. Cada volume recebe identificador proprio, peso calculado e etiqueta com codigo de barras."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Card className="p-4"><Metric label="Ordens em curso" value={fmtNumber(rows.filter((r) => r.status === "IN_PROGRESS").length)} tone="accent" size="sm" /></Card>
        <Card className="p-4"><Metric label="Volumes criados" value={fmtNumber(volumes.length)} size="sm" /></Card>
        <Card className="p-4"><Metric label="Volumes conferidos" value={fmtNumber(volumes.filter((v) => ["CHECKED", "LOADED", "SHIPPED"].includes(v.status)).length)} tone="success" size="sm" /></Card>
        <Card className="p-4"><Metric label="Peso embalado" value={fmtNumber(volumes.reduce((s, v) => s + v.gross_weight_kg, 0), 1)} unit="kg" size="sm" /></Card>
      </div>

      <FilterBar
        placeholder="Ordem, pedido, cliente…"
        selects={[{
          key: "status", label: "Todos os status",
          options: Object.keys(TASK_STATUS).map((s) => ({
            value: s, label: TASK_STATUS_META[s as keyof typeof TASK_STATUS].label,
          })),
        }]}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconPack size={18} />}
            title="Nenhuma ordem de embalagem"
            description="A embalagem e aberta a partir de um pedido com separacao concluida."
            action={<Link href="/picking" className="btn btn-sm">Ir para picking</Link>}
          />
        </Card>
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Ordem</th><th>Pedido</th><th>Cliente</th><th>Status</th><th>Estacao</th>
                  <th className="num">Volumes</th><th className="num">Peso</th><th>Operador</th><th>Criada</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td><IdChip id={p.id} href={`/packing/${p.id}`} /></td>
                    <td><IdChip id={p.sales_order_id} href={`/shipping/orders/${p.sales_order_id}`} /></td>
                    <td className="max-w-[190px] truncate" title={p.customer_name}>{p.customer_name}</td>
                    <td><StatusBadge status={p.status} meta={TASK_STATUS_META} /></td>
                    <td className="text-secondary">{p.station ?? "—"}</td>
                    <td className="num tnum">{p.volume_count}</td>
                    <td className="num tnum text-secondary">{fmtWeight(p.total_weight_kg, 1)}</td>
                    <td className="text-secondary">{p.operator_name ?? "—"}</td>
                    <td className="text-secondary text-[12px]">{fmtDateTime(p.created_at)}</td>
                    <td><Link href={`/packing/${p.id}`} className="btn btn-sm btn-ghost"><IconArrowRight size={13} /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {volumes.length > 0 && (
        <Card className="mt-5" padded={false}>
          <div className="p-5 pb-0">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold">Volumes do cenario</h2>
                <p className="text-[12.5px] text-secondary mt-0.5 font-[family-name:var(--font-editorial)]">
                  Cada volume possui etiqueta propria com Code 128
                </p>
              </div>
              <Link href="/documents?group=saida" className="btn btn-sm"><IconPrint size={13} /> Etiquetas</Link>
            </div>
          </div>
          <div className="overflow-x-auto mt-4">
            <table className="table">
              <thead>
                <tr><th>Volume</th><th>Pedido</th><th>Cliente</th><th>Status</th><th>Tipo</th>
                  <th className="num">Itens</th><th className="num">Qtd</th><th className="num">Peso bruto</th><th /></tr>
              </thead>
              <tbody>
                {volumes.map((v) => (
                  <tr key={v.id}>
                    <td><IdChip id={v.id} href={`/documents/volume-label/${v.id}`} /></td>
                    <td><IdChip id={v.sales_order_id} href={`/shipping/orders/${v.sales_order_id}`} /></td>
                    <td className="max-w-[170px] truncate">{v.customer_name}</td>
                    <td><StatusBadge status={v.status} meta={VOLUME_STATUS_META} /></td>
                    <td className="text-secondary">{v.container_kind}</td>
                    <td className="num tnum">{v.line_count}</td>
                    <td className="num tnum">{fmtNumber(v.total_qty)}</td>
                    <td className="num tnum text-secondary">{fmtWeight(v.gross_weight_kg, 2)}</td>
                    <td>
                      <Link href={`/documents/volume-label/${v.id}`} className="btn btn-sm btn-ghost" aria-label={`Etiqueta ${v.id}`}>
                        <IconPrint size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
