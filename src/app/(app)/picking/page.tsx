import Link from "next/link";
import type { Metadata } from "next";
import { listPicking, pickingMetrics } from "@/domain/services/picking";
import { PageHeader, Card, EmptyState, IdChip, Progress, Metric } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/Badge";
import { FilterBar } from "@/components/FilterBar";
import { PICKING_STATUS, PICKING_STATUS_META, PRIORITY_META } from "@/domain/states";
import { fmtNumber, fmtDuration, relativeTime, fmtDateTime } from "@/lib/format";
import { IconPick, IconScan, IconArrowRight } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Picking" };
export const dynamic = "force-dynamic";

export default async function PickingPage({
  searchParams,
}: { searchParams: Promise<{ status?: string; search?: string }> }) {
  const sp = await searchParams;
  const rows = listPicking({ status: sp.status, search: sp.search });
  const m = pickingMetrics();

  return (
    <>
      <PageHeader
        eyebrow="Saida"
        title="Picking"
        description="Separacao guiada por coletora. Cada linha exige bip do endereco e do produto antes da confirmacao de quantidade."
        actions={<Link href="/mobile/picking" className="btn btn-sm btn-primary"><IconScan size={13} /> Abrir na coletora</Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Card className="p-4"><Metric label="Listas ativas" value={fmtNumber(rows.filter((r) => r.status === "IN_PROGRESS").length)} tone="accent" size="sm" /></Card>
        <Card className="p-4"><Metric label="Linhas separadas" value={fmtNumber(m.lines)} size="sm" /></Card>
        <Card className="p-4"><Metric label="Unidades" value={fmtNumber(m.units)} size="sm" /></Card>
        <Card className="p-4">
          <Metric label="Produtividade" value={m.linesPerHour === null ? "—" : fmtNumber(m.linesPerHour, 1)} unit="lin/h" tone="accent" size="sm" />
        </Card>
        <Card className="p-4">
          <Metric label="Tempo medio/linha" value={m.avgLineMinutes === null ? "—" : fmtDuration(m.avgLineMinutes)} size="sm" hint={`${m.divergences} divergencia(s)`} />
        </Card>
      </div>

      <FilterBar
        placeholder="Picklist, pedido, cliente…"
        selects={[{
          key: "status", label: "Todos os status",
          options: Object.keys(PICKING_STATUS).map((s) => ({
            value: s, label: PICKING_STATUS_META[s as keyof typeof PICKING_STATUS].label,
          })),
        }]}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconPick size={18} />}
            title="Nenhuma picklist"
            description="Libere um pedido de venda para reservar estoque e gerar a lista de separacao."
            action={<Link href="/shipping/orders" className="btn btn-sm">Ir para pedidos</Link>}
          />
        </Card>
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
            <table className="table">
              <thead>
                <tr>
                  <th>Picklist</th><th>Pedido</th><th>Cliente</th><th>Prioridade</th><th>Status</th>
                  <th className="num">Linhas</th><th style={{ width: 110 }}>Progresso</th>
                  <th className="num">Unidades</th><th>Operador</th><th>Inicio</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td><IdChip id={p.id} href={`/picking/${p.id}`} /></td>
                    <td><IdChip id={p.sales_order_id} href={`/shipping/orders/${p.sales_order_id}`} /></td>
                    <td className="max-w-[180px] truncate" title={p.customer_name}>{p.customer_name}</td>
                    <td><StatusBadge status={p.priority} meta={PRIORITY_META} dot={false} /></td>
                    <td><StatusBadge status={p.status} meta={PICKING_STATUS_META} /></td>
                    <td className="num tnum">{p.done_lines}/{p.total_lines}</td>
                    <td>
                      <Progress value={p.done_lines} max={Math.max(1, p.total_lines)}
                        tone={p.status === "COMPLETED" ? "success" : p.status === "DIVERGENCE" ? "warning" : "accent"}
                        label={`Progresso de ${p.id}`} />
                    </td>
                    <td className="num tnum">{fmtNumber(p.picked_units)}/{fmtNumber(p.total_units)}</td>
                    <td className="text-secondary">{p.operator_name ?? "—"}</td>
                    <td className="text-secondary text-[12px]">{p.started_at ? relativeTime(p.started_at) : "—"}</td>
                    <td>
                      <Link href={`/picking/${p.id}`} className="btn btn-sm btn-ghost" aria-label={`Abrir ${p.id}`}>
                        <IconArrowRight size={13} />
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
