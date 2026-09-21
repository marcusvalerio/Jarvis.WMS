import Link from "next/link";
import type { Metadata } from "next";
import {
  dashboardKpis, headline, operationalPulse, movementSeries, operationSnapshot,
} from "@/domain/services/kpi";
import { occupancy, listDocks, locationMap, listZones } from "@/domain/services/warehouse";
import { incidentCounts } from "@/domain/services/incidents";
import { listInbound } from "@/domain/services/receiving";
import { listOrders } from "@/domain/services/orders";
import { scenarioProgress } from "@/domain/services/simulation";
import { KpiCard } from "@/components/KpiCard";
import { MovementChart } from "@/components/MovementChart";
import { OperationalFlow } from "@/components/OperationalFlow";
import { WarehouseMap } from "../warehouse/map";
import { Card, CardHeader, PageHeader, EmptyState, Progress, IdChip, MetaItem } from "@/components/ui/Primitives";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { INBOUND_STATUS_META, SHIPPING_STATUS_META, PRIORITY_META } from "@/domain/states";
import { fmtNumber, fmtTime, fmtPercent, fmtDateTime, relativeTime, isOverdue } from "@/lib/format";
import { IconArrowRight, IconAlert, IconCheck } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const kpis = await dashboardKpis();
  const head = await headline();
  const pulse = await operationalPulse(14);
  const occ = await occupancy();
  const docks = await listDocks();
  const inc = await incidentCounts();
  const series = await movementSeries(12);
  const flow = await operationSnapshot();
  const inbound = (await listInbound()).filter((i) => i.status !== "COMPLETED" && i.status !== "CANCELLED").slice(0, 5);
  const orders = (await listOrders()).filter((o) => o.status !== "SHIPPED" && o.status !== "CANCELLED").slice(0, 6);
  const progress = await scenarioProgress();

  const zones = (await listZones()).filter((z) => ["PICKING", "STORAGE"].includes(z.kind));
  const mapLocations = (await locationMap()).filter((l) => l.kind === "PALLET");

  const featured = ["accuracy", "occupancy", "otif", "equipment", "divergence"];
  const primary = kpis.filter((k) => featured.includes(k.key));
  const secondary = kpis.filter((k) => !featured.includes(k.key));

  const operationActive = head.pickingRunning > 0 || head.inboundToday > 0;

  return (
    <>
      <PageHeader
        eyebrow="Centro de distribuicao · CD-01"
        title="Dashboard operacional"
        description="Indicadores calculados a partir das operacoes registradas — movimentos, conferencias e tempos de tarefa. Nenhum valor e fixo."
        meta={
          <>
            <MetaItem label="Data" value={fmtDateTime(new Date().toISOString())} />
            <span className="flex items-center gap-1.5 text-[13px] text-primary">
              <span
                className={`w-1.5 h-1.5 rounded-full ${operationActive ? "bg-accent pulse-dot" : "bg-neutral"}`}
                aria-hidden
              />
              {operationActive ? "Operacao em andamento" : "Operacao parada"}
            </span>
          </>
        }
        actions={
          <>
            <Link href="/operations" className="btn btn-sm">Painel de operacao</Link>
            <Link href="/simulation" className="btn btn-sm btn-primary">Cenario da apresentacao</Link>
          </>
        }
      />

      {/* ------------------------------------------------ contadores de topo */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border border-border mb-5">
        <Headline label="Recebimentos abertos" value={head.inboundToday} href="/receiving" />
        <Headline label="Pedidos abertos" value={head.ordersOpen} href="/shipping/orders" />
        <Headline label="Picking em curso" value={head.pickingRunning} href="/picking" accent={head.pickingRunning > 0} />
        <Headline label="Volumes conferidos" value={head.volumesReady} href="/packing" />
        <Headline label="Pedidos expedidos" value={head.shippedToday} href="/shipping" />
        <Headline label="SKUs em estoque" value={head.skus} href="/inventory" />
        <Headline
          label="Ocorrencias abertas" value={inc.open + inc.analysis} href="/incidents"
          danger={inc.critical > 0}
        />
      </div>

      {/* ------------------------------------------------ KPIs principais */}
      <section aria-label="Indicadores principais" className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-3">
        {primary.map((k) => <KpiCard key={k.key} kpi={k} featured />)}
      </section>
      <section aria-label="Indicadores de ciclo" className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
        {secondary.map((k) => <KpiCard key={k.key} kpi={k} />)}
      </section>

      {/* ------------------------------------------------ fluxo operacional */}
      <Card className="mb-5" padded={false}>
        <div className="p-5 pb-3">
          <CardHeader
            title="Fluxo operacional"
            subtitle="Recebimento → armazenagem → picking → conferencia → expedicao — volume em execucao agora, por etapa"
          />
        </div>
        <div className="px-2 pb-3">
          <OperationalFlow stages={flow} />
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5 items-start">
        {/* --------------------------------------------- atividade recente */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Atividade recente"
            subtitle="Ultimos eventos registrados pela operacao"
            action={<Link href="/audit" className="btn btn-sm btn-ghost">Auditoria <IconArrowRight size={13} /></Link>}
          />
          {pulse.length === 0 ? (
            <EmptyState
              title="Nenhum evento ainda"
              description="Execute uma etapa da operacao — recebimento, armazenagem ou separacao — para o registro comecar."
              action={<Link href="/receiving" className="btn btn-sm btn-primary">Abrir recebimento</Link>}
            />
          ) : (
            <ol className="relative">
              <span className="absolute left-[5px] top-2 bottom-2 w-px bg-border" aria-hidden />
              {pulse.map((e) => (
                <li key={e.id} className="relative pl-6 py-[7px]">
                  <span
                    className={`absolute left-0 top-[13px] w-[11px] h-[11px] rounded-full border-2 border-bg ${dotClass(e.tone)}`}
                    aria-hidden
                  />
                  <div className="flex items-baseline gap-2.5 flex-wrap">
                    <span className="text-[11px] text-faint tnum w-[42px] flex-none">{fmtTime(e.at)}</span>
                    <span className="eyebrow w-[104px] flex-none truncate">{e.stage}</span>
                    <span className="text-[12.5px] text-primary flex-1 min-w-0 truncate" title={e.detail}>
                      {e.detail || e.label}
                    </span>
                    <span className="text-[11px] text-faint flex-none">{e.actor}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {/* --------------------------------------------- roteiro da apresentacao */}
        <Card>
          <CardHeader
            title="Roteiro da operacao"
            subtitle={`${progress.done} de ${progress.total} etapas executadas`}
            action={<span className="text-[19px] font-[family-name:var(--font-display)] font-semibold tnum text-accent-fg">{fmtPercent(progress.pct, 0)}</span>}
          />
          <Progress value={progress.done} max={progress.total} label="Progresso do roteiro" />
          <ol className="mt-4 flex flex-col gap-px">
            {progress.steps.map((s) => (
              <li key={s.key}>
                <Link
                  href={s.href}
                  className="flex items-center gap-2.5 h-[30px] px-2 -mx-2 rounded-md hover:bg-elevated transition-colors"
                >
                  <span className={`flex-none ${s.done ? "text-accent-fg" : "text-faint"}`}>
                    {s.done
                      ? <IconCheck size={13} />
                      : <span className="block w-[13px] h-[13px] rounded-full border border-current" />}
                  </span>
                  <span className={`text-[12.5px] truncate flex-1 ${s.done ? "text-primary" : "text-secondary"}`}>
                    {s.label}
                  </span>
                  <span className="text-[11px] text-faint tnum flex-none truncate max-w-[110px]">{s.detail}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {/* ------------------------------------------------ mapa do armazem */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5 mb-5 items-start">
        <div className="xl:col-span-3">
          <WarehouseMap
            locations={mapLocations.map((l) => ({
              id: l.id, code: l.code, zoneId: l.zone_id, zoneName: l.zone_name,
              aisle: l.aisle, rack: l.rack, level: l.level, status: l.status,
              sku: l.sku, description: l.description, qty: l.qty, reserved: l.reserved,
              lot: l.lot_code, expires: l.expires_at, pallet: l.pallet_id,
              capacity: l.capacity_units, skuCount: l.sku_count,
            }))}
            zones={zones.map((z) => ({ id: z.id, name: z.name, kind: z.kind }))}
          />
        </div>

        <Card>
          <CardHeader title="Ocupacao do armazem" subtitle={`${occ.occupied} de ${occ.totalPositions} posicoes-palete`} />
          <div className="flex items-end gap-3 mb-4">
            <span className="text-[38px] leading-none font-[family-name:var(--font-display)] font-semibold tnum text-primary">
              {fmtPercent(occ.occupancyPct, 1)}
            </span>
            <span className="text-[12px] text-secondary pb-1">
              {occ.available} livres · {occ.reserved} reservadas · {occ.blocked} bloqueadas
            </span>
          </div>
          <ul className="flex flex-col gap-2.5">
            {occ.byZone.map((z) => (
              <li key={z.zoneId}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-[12.5px] text-primary truncate">{z.zoneName}</span>
                  <span className="text-[11.5px] text-secondary tnum flex-none ml-2">
                    {z.occupied}/{z.total}
                  </span>
                </div>
                <Progress value={z.occupied} max={z.total} tone={z.pct > 90 ? "warning" : "accent"} label={z.zoneName} />
              </li>
            ))}
          </ul>

          <div className="hr my-4" />
          <p className="label mb-2.5">Docas</p>
          <ul className="grid grid-cols-2 gap-2">
            {docks.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-2 h-8 px-2.5 rounded-md border border-border bg-bg"
                title={d.current_ref ? `Em uso por ${d.current_ref}` : "Livre"}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-none ${
                    d.status === "OCCUPIED" ? "bg-accent pulse-dot" : d.status === "BLOCKED" ? "bg-error" : "bg-neutral"
                  }`}
                  aria-hidden
                />
                <span className="text-[11.5px] text-primary truncate">{d.id.replace("DOCA-", "Doca ")}</span>
                <span className="ml-auto text-[10.5px] text-faint truncate max-w-[70px]">
                  {d.current_ref ?? "livre"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* ------------------------------------------------ movimentacao */}
      <Card className="mb-5">
        <CardHeader
          title="Movimentacao de estoque"
          subtitle={`${fmtNumber(head.movements)} movimentos registrados no cenario`}
          action={<Link href="/inventory/movements" className="btn btn-sm btn-ghost">Ver todos <IconArrowRight size={13} /></Link>}
        />
        <MovementChart data={series} />
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        {/* --------------------------------------------- recebimentos */}
        <Card>
          <CardHeader
            title="Recebimentos"
            subtitle="Cargas previstas e em andamento"
            action={
              <Link href="/receiving" className="btn btn-sm btn-ghost" aria-label="Ver todos os recebimentos">
                <IconArrowRight size={13} />
              </Link>
            }
          />
          {inbound.length === 0 ? (
            <EmptyState title="Nenhum recebimento aberto" description="Todas as cargas previstas foram concluidas." />
          ) : (
            <ul className="flex flex-col gap-px">
              {inbound.map((io) => (
                <li key={io.id}>
                  <Link href={`/receiving/${io.id}`} className="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-md hover:bg-elevated transition-colors">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="chip-id">{io.id}</span>
                        <StatusBadge status={io.status} meta={INBOUND_STATUS_META} />
                      </span>
                      <span className="block text-[12px] text-secondary truncate mt-1">{io.supplier_name}</span>
                    </span>
                    <span className="text-right flex-none">
                      <span className="block text-[12.5px] text-primary tnum">{fmtNumber(io.expected_qty)} un</span>
                      <span className="block text-[11px] text-faint">{fmtTime(io.scheduled_at)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* --------------------------------------------- pedidos */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Pedidos em operacao"
            subtitle="Ordenados por prioridade e prazo"
            action={<Link href="/shipping/orders" className="btn btn-sm btn-ghost">Todos os pedidos <IconArrowRight size={13} /></Link>}
          />
          {orders.length === 0 ? (
            <EmptyState title="Nenhum pedido aberto" description="Todos os pedidos do cenario foram expedidos." />
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="table">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Prioridade</th>
                    <th>Status</th>
                    <th className="num">Itens</th>
                    <th className="num">Reservado</th>
                    <th>Prazo</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td><IdChip id={o.id} href={`/shipping/orders/${o.id}`} /></td>
                      <td className="max-w-[170px] truncate" title={o.customer_name}>{o.customer_name}</td>
                      <td><StatusBadge status={o.priority} meta={PRIORITY_META} dot={false} /></td>
                      <td><StatusBadge status={o.status} meta={SHIPPING_STATUS_META} /></td>
                      <td className="num tnum">{fmtNumber(o.total_qty)}</td>
                      <td className="num tnum">
                        <span className={o.total_reserved >= o.total_qty ? "text-success-fg" : "text-secondary"}>
                          {fmtNumber(o.total_reserved)}
                        </span>
                      </td>
                      <td
                        className={`text-[12px] ${isOverdue(o.due_at) ? "text-error-fg" : "text-secondary"}`}
                        title={fmtDateTime(o.due_at)}
                      >
                        {relativeTime(o.due_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {inc.critical > 0 && (
        <Link
          href="/incidents"
          className="mt-5 flex items-center gap-3 p-4 rounded-lg border border-error-line bg-error-soft hover:border-error transition-colors"
        >
          <span className="text-error-fg flex-none"><IconAlert size={17} /></span>
          <span className="min-w-0">
            <span className="block text-[13px] text-primary font-medium">
              {inc.critical} ocorrencia(s) de severidade alta ou critica em aberto
            </span>
            <span className="block text-[12px] text-secondary mt-0.5">
              Divergencias nao tratadas bloqueiam a expedicao dos pedidos afetados.
            </span>
          </span>
          <span className="ml-auto text-error-fg flex-none"><IconArrowRight size={15} /></span>
        </Link>
      )}
    </>
  );
}

function Headline({
  label, value, href, accent, danger,
}: { label: string; value: number; href: string; accent?: boolean; danger?: boolean }) {
  return (
    <Link href={href} className="bg-surface hover:bg-elevated transition-colors p-3.5 block">
      <p className="label truncate mb-1.5">{label}</p>
      <p
        className={`text-[24px] leading-none font-[family-name:var(--font-display)] font-semibold tnum ${
          danger ? "text-error-fg" : accent ? "text-accent-fg" : "text-primary"
        }`}
      >
        {fmtNumber(value)}
      </p>
    </Link>
  );
}

function dotClass(tone: string) {
  return {
    success: "bg-success", accent: "bg-accent", warning: "bg-warning",
    error: "bg-error", info: "bg-info", neutral: "bg-neutral",
  }[tone] ?? "bg-neutral";
}
