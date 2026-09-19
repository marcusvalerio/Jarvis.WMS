import Link from "next/link";
import type { Metadata } from "next";
import { listOrders, orderCounts } from "@/domain/services/orders";
import { listManifests, listShipments, eligibleOrdersForManifest } from "@/domain/services/shipping";
import { listVolumes } from "@/domain/services/packing";
import { listDocks } from "@/domain/services/warehouse";
import { otif, avgShippingMinutes } from "@/domain/services/kpi";
import { PageHeader, Card, CardHeader, Metric, EmptyState, IdChip, Progress } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/Badge";
import {
  SHIPPING_STATUS_META, SHIPPING_FLOW, MANIFEST_STATUS_META, VOLUME_STATUS_META,
} from "@/domain/states";
import { fmtNumber, fmtWeight, fmtPercent, fmtDuration, fmtDateTime } from "@/lib/format";
import { IconTruckOut, IconArrowRight } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Expedicao" };
export const dynamic = "force-dynamic";

export default function ShippingPage() {
  const orders = listOrders();
  const counts = orderCounts();
  const manifests = listManifests();
  const shipments = listShipments();
  const volumes = listVolumes();
  const eligible = eligibleOrdersForManifest();
  const docks = listDocks().filter((d) => d.kind !== "INBOUND");
  const ot = otif();
  const cycle = avgShippingMinutes();

  return (
    <>
      <PageHeader
        eyebrow="Saida"
        title="Expedicao"
        description="Estado do fluxo de saida: separacao, conferencia, romaneio, carregamento e despacho."
        actions={
          <>
            <Link href="/shipping/manifests" className="btn btn-sm">Romaneios</Link>
            <Link href="/shipping/loading" className="btn btn-sm btn-primary">Carregamento <IconArrowRight size={13} /></Link>
          </>
        }
      />

      {/* --------------------------------------------------- funil do fluxo */}
      <Card className="mb-5">
        <CardHeader title="Fluxo de expedicao" subtitle="Quantidade de pedidos em cada estado operacional" />
        <ol className="flex flex-wrap gap-2">
          {SHIPPING_FLOW.map((s, i) => {
            const n = counts[s] ?? 0;
            return (
              <li key={s} className="flex items-center gap-2">
                <Link
                  href={`/shipping/orders?status=${s}`}
                  className={`flex flex-col items-center justify-center min-w-[112px] h-[74px] rounded-lg border px-3 transition-colors ${
                    n > 0 ? "border-accent/35 bg-accent/[0.06] hover:border-accent/60" : "border-border bg-surface hover:border-[#363D3F]"
                  }`}
                >
                  <span className={`text-[26px] leading-none font-[family-name:var(--font-display)] font-semibold tnum ${n > 0 ? "text-accent" : "text-faint"}`}>
                    {n}
                  </span>
                  <span className="text-[11px] text-secondary mt-1.5 text-center leading-tight">
                    {SHIPPING_STATUS_META[s].label}
                  </span>
                </Link>
                {i < SHIPPING_FLOW.length - 1 && <span className="text-faint"><IconArrowRight size={13} /></span>}
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Card className="p-4"><Metric label="Volumes conferidos" value={fmtNumber(volumes.filter((v) => v.status === "CHECKED").length)} tone="success" size="sm" /></Card>
        <Card className="p-4"><Metric label="Prontos p/ romaneio" value={fmtNumber(eligible.length)} tone={eligible.length ? "accent" : "muted"} size="sm" /></Card>
        <Card className="p-4"><Metric label="Romaneios abertos" value={fmtNumber(manifests.filter((m) => !["SHIPPED", "CANCELLED"].includes(m.status)).length)} size="sm" /></Card>
        <Card className="p-4"><Metric label="OTIF" value={ot.value === null ? "—" : fmtPercent(ot.value, 1)} tone="success" size="sm" hint={ot.total ? `${ot.otif}/${ot.total} pedidos` : "sem expedicao"} /></Card>
        <Card className="p-4"><Metric label="Ciclo de expedicao" value={cycle.value === null ? "—" : fmtDuration(cycle.value)} size="sm" hint="liberacao → despacho" /></Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <Card className="xl:col-span-2" padded={false}>
          <div className="p-5 pb-0">
            <CardHeader
              title="Pedidos prontos para carregar"
              subtitle="Conferencia de expedicao aprovada, aguardando inclusao em romaneio"
              action={<Link href="/shipping/manifests" className="btn btn-sm">Montar romaneio</Link>}
            />
          </div>
          {eligible.length === 0 ? (
            <EmptyState
              icon={<IconTruckOut size={18} />}
              title="Nenhum pedido pronto"
              description="Conclua separacao, embalagem e conferencia de expedicao para liberar o pedido."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Pedido</th><th>Cliente</th><th>Destino</th><th className="num">Volumes</th>
                    <th className="num">Peso</th><th>Prazo</th></tr>
                </thead>
                <tbody>
                  {eligible.map((o: any) => (
                    <tr key={o.id}>
                      <td><IdChip id={o.id} href={`/shipping/orders/${o.id}`} /></td>
                      <td className="max-w-[190px] truncate">{o.customer_name}</td>
                      <td className="text-secondary">{o.city}/{o.state}</td>
                      <td className="num tnum">{o.volume_count}</td>
                      <td className="num tnum text-secondary">{fmtWeight(o.total_weight_kg, 1)}</td>
                      <td className="text-secondary text-[12px]">{fmtDateTime(o.due_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Docas de expedicao" />
          <ul className="flex flex-col gap-2">
            {docks.map((d) => (
              <li key={d.id} className="flex items-center gap-2.5 h-10 px-3 rounded-md border border-border bg-bg">
                <span className={`w-2 h-2 rounded-full ${d.status === "OCCUPIED" ? "bg-accent pulse-dot" : d.status === "BLOCKED" ? "bg-error" : "bg-[#3A4245]"}`} />
                <span className="text-[13px]">{d.name}</span>
                <span className="ml-auto text-[12px] text-secondary">
                  {d.current_ref
                    ? <Link href={`/shipping/manifests/${d.current_ref}`} className="link code">{d.current_ref}</Link>
                    : "livre"}
                </span>
              </li>
            ))}
          </ul>

          <div className="hr my-4" />
          <p className="label mb-2.5">Romaneios recentes</p>
          {manifests.length === 0 ? (
            <p className="text-[12.5px] text-faint">Nenhum romaneio criado.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {manifests.slice(0, 5).map((m) => (
                <li key={m.id}>
                  <Link href={`/shipping/manifests/${m.id}`} className="flex items-center gap-2 p-2.5 rounded-md border border-border bg-bg hover:border-[#363D3F] transition-colors">
                    <span className="code text-[12.5px]">{m.id}</span>
                    <StatusBadge status={m.status} meta={MANIFEST_STATUS_META} />
                    <span className="ml-auto text-[11.5px] text-secondary tnum">{m.total_volumes} vol</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {shipments.length > 0 && (
        <Card className="mt-5" padded={false}>
          <div className="p-5 pb-0">
            <CardHeader title="Remessas expedidas" subtitle={`${shipments.length} despacho(s) concluido(s)`} />
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Remessa</th><th>Pedido</th><th>Cliente</th><th>Romaneio</th><th>Rota</th>
                  <th>Veiculo</th><th className="num">Volumes</th><th className="num">Peso</th><th>Expedido</th></tr>
              </thead>
              <tbody>
                {shipments.map((s) => (
                  <tr key={s.id}>
                    <td><IdChip id={s.id} /></td>
                    <td><IdChip id={s.sales_order_id} href={`/shipping/orders/${s.sales_order_id}`} /></td>
                    <td className="max-w-[180px] truncate">{s.customer_name}</td>
                    <td>{s.manifest_id ? <IdChip id={s.manifest_id} href={`/shipping/manifests/${s.manifest_id}`} /> : "—"}</td>
                    <td className="text-secondary">{s.route ?? "—"}</td>
                    <td className="code text-secondary">{s.vehicle_plate ?? "—"}</td>
                    <td className="num tnum">{s.volumes}</td>
                    <td className="num tnum text-secondary">{fmtWeight(s.weight_kg, 1)}</td>
                    <td className="text-secondary text-[12px]">{fmtDateTime(s.shipped_at)}</td>
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
