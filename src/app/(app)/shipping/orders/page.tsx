import Link from "next/link";
import type { Metadata } from "next";
import { listOrders, orderCounts, listCustomers } from "@/domain/services/orders";
import { stockByProduct } from "@/domain/services/inventory";
import { NewOrder } from "./new-order";
import { PageHeader, Card, EmptyState, IdChip, Progress, Metric } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/Badge";
import { FilterBar } from "@/components/FilterBar";
import { SHIPPING_STATUS, SHIPPING_STATUS_META, PRIORITY, PRIORITY_META } from "@/domain/states";
import { fmtNumber, fmtMoney, fmtDateTime, relativeTime, isOverdue } from "@/lib/format";
import { IconDoc, IconArrowRight } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Pedidos de venda" };
export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: { searchParams: Promise<{ status?: string; search?: string; priority?: string }> }) {
  const sp = await searchParams;
  const rows = listOrders({ status: sp.status, search: sp.search, priority: sp.priority });
  const counts = orderCounts();
  const customers = listCustomers().map((c: any) => ({
    id: c.id, name: c.name, city: c.city, state: c.state,
  }));
  const products = stockByProduct().map((p) => ({
    id: p.product_id, sku: p.sku, description: p.description,
    unit: p.unit, available: p.available,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Saida"
        title="Pedidos de venda"
        description="Liberar um pedido reserva o estoque disponivel. O sistema nunca reserva acima do saldo — a falta e reportada linha a linha."
        actions={
          <>
            <Link href="/shipping" className="btn btn-sm">Painel de expedicao <IconArrowRight size={13} /></Link>
            <NewOrder customers={customers} products={products} warehouseId="CD-01" />
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
        {(["PENDING", "PICKING", "CHECKING", "READY_TO_LOAD", "LOADING", "LOADED", "SHIPPED"] as const).map((s) => (
          <Link key={s} href={`/shipping/orders?status=${s}`} className="card p-3.5 hover:border-[#363D3F] transition-colors">
            <p className="label truncate mb-1.5">{SHIPPING_STATUS_META[s].label}</p>
            <p className="text-[22px] font-[family-name:var(--font-display)] font-semibold tnum leading-none">
              {counts[s] ?? 0}
            </p>
          </Link>
        ))}
      </div>

      <FilterBar
        placeholder="Pedido, cliente, cidade…"
        selects={[
          {
            key: "status", label: "Todos os status",
            options: Object.keys(SHIPPING_STATUS).map((s) => ({
              value: s, label: SHIPPING_STATUS_META[s as keyof typeof SHIPPING_STATUS].label,
            })),
          },
          {
            key: "priority", label: "Todas as prioridades",
            options: Object.keys(PRIORITY).map((p) => ({
              value: p, label: PRIORITY_META[p as keyof typeof PRIORITY].label,
            })),
          },
        ]}
      />

      {rows.length === 0 ? (
        <Card><EmptyState icon={<IconDoc size={18} />} title="Nenhum pedido encontrado" /></Card>
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
            <table className="table">
              <thead>
                <tr>
                  <th>Pedido</th><th>Cliente</th><th>Destino</th><th>Prioridade</th><th>Status</th>
                  <th className="num">Itens</th><th className="num">Reservado</th><th className="num">Separado</th>
                  <th style={{ width: 100 }}>Progresso</th>
                  <th className="num">Volumes</th><th className="num">Valor</th><th>Prazo</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td><IdChip id={o.id} href={`/shipping/orders/${o.id}`} /></td>
                    <td className="max-w-[190px] truncate" title={o.customer_name}>{o.customer_name}</td>
                    <td className="text-secondary text-[12px]">{o.ship_to_city}/{o.ship_to_state}</td>
                    <td><StatusBadge status={o.priority} meta={PRIORITY_META} dot={false} /></td>
                    <td><StatusBadge status={o.status} meta={SHIPPING_STATUS_META} /></td>
                    <td className="num tnum">{fmtNumber(o.total_qty)}</td>
                    <td className="num tnum">
                      <span className={o.total_reserved >= o.total_qty ? "text-success" : o.total_reserved > 0 ? "text-warning" : "text-faint"}>
                        {fmtNumber(o.total_reserved)}
                      </span>
                    </td>
                    <td className="num tnum">{fmtNumber(o.total_picked)}</td>
                    <td>
                      <Progress value={o.total_picked} max={Math.max(1, o.total_qty)}
                        tone={o.total_picked >= o.total_qty ? "success" : "accent"} label={`Progresso de ${o.id}`} />
                    </td>
                    <td className="num tnum">{o.volume_count || "—"}</td>
                    <td className="num tnum text-secondary">{fmtMoney(o.total_value)}</td>
                    <td className={`text-[12px] ${isOverdue(o.due_at) && o.status !== "SHIPPED" ? "text-error" : "text-secondary"}`} title={fmtDateTime(o.due_at)}>
                      {relativeTime(o.due_at)}
                    </td>
                    <td>
                      <Link href={`/shipping/orders/${o.id}`} className="btn btn-sm btn-ghost" aria-label={`Abrir ${o.id}`}>
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
