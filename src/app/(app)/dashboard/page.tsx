import Link from "next/link";
import type { Metadata } from "next";
import {
  dashboardKpis, headline, operationalPulse, movementSeries, operationSnapshot,
  divergenceIndex, pickingActivitySeries, avgPickingMinutes, avgCheckMinutes, otif,
  type Kpi,
} from "@/domain/services/kpi";
import { occupancy, listDocks, locationMap, listZones } from "@/domain/services/warehouse";
import { incidentCounts } from "@/domain/services/incidents";
import { listInbound } from "@/domain/services/receiving";
import { listOrders } from "@/domain/services/orders";
import { scenarioProgress } from "@/domain/services/simulation";
import { KpiCard } from "@/components/KpiCard";
import { OperationalFlow } from "@/components/OperationalFlow";
import { MovementTrend } from "@/components/charts/MovementTrend";
import { Donut, type DonutSegment } from "@/components/charts/Donut";
import { HorizontalBars, type BarItem } from "@/components/charts/HorizontalBars";
import { Sparkline } from "@/components/charts/Sparkline";
import { WarehouseMap } from "../warehouse/map";
import { Card, CardHeader, PageHeader, EmptyState, IdChip, MetaItem } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/Badge";
import { INBOUND_STATUS_META, SHIPPING_STATUS_META, PRIORITY_META } from "@/domain/states";
import { fmtNumber, fmtTime, fmtPercent, fmtDateTime, fmtDuration, relativeTime, isOverdue } from "@/lib/format";
import { IconArrowRight, IconAlert } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const kpis = await dashboardKpis();
  const head = await headline();
  const pulse = await operationalPulse(8);
  const occ = await occupancy();
  const docks = await listDocks();
  const inc = await incidentCounts();
  const series = await movementSeries(12);
  const flow = await operationSnapshot();
  const div = await divergenceIndex();
  const otifData = await otif();
  const pickSeries = await pickingActivitySeries(12);
  const pickAvg = await avgPickingMinutes();
  const checkAvg = await avgCheckMinutes();
  const inbound = (await listInbound()).filter((i) => i.status !== "COMPLETED" && i.status !== "CANCELLED").slice(0, 5);
  const orders = (await listOrders()).filter((o) => o.status !== "SHIPPED" && o.status !== "CANCELLED").slice(0, 6);
  const progress = await scenarioProgress();

  const zones = (await listZones()).filter((z) => ["PICKING", "STORAGE"].includes(z.kind));
  const mapLocations = (await locationMap()).filter((l) => l.kind === "PALLET");

  const byKey: Record<string, Kpi> = Object.fromEntries(kpis.map((k) => [k.key, k] as const));
  const primary = ["accuracy", "occupancy", "otif", "equipment", "divergence"]
    .map((k) => byKey[k]).filter((k): k is Kpi => Boolean(k));

  const operationActive = head.pickingRunning > 0 || head.inboundToday > 0;

  const processBars: BarItem[] = [
    { label: "Recebimento", value: byKey.receiving?.value ?? null, display: fmtDuration(byKey.receiving?.value ?? null) },
    { label: "Put-away (Armazenagem)", value: byKey.putaway?.value ?? null, display: fmtDuration(byKey.putaway?.value ?? null) },
    { label: "Picking (Separacao)", value: pickAvg.value, display: fmtDuration(pickAvg.value), sample: pickAvg.sample ? `${pickAvg.sample} ordens` : undefined },
    { label: "Conferencia", value: checkAvg.value, display: fmtDuration(checkAvg.value), sample: checkAvg.sample ? `${checkAvg.sample} conferencias` : undefined },
    { label: "Expedicao", value: byKey.shipping?.value ?? null, display: fmtDuration(byKey.shipping?.value ?? null) },
  ];

  const occDonut: DonutSegment[] = [
    { label: "Ocupado", value: occ.occupied, tone: "accent" },
    { label: "Livre", value: occ.available, tone: "neutral" },
    { label: "Reservado", value: occ.reserved, tone: "warning" },
    { label: "Bloqueado", value: occ.blocked, tone: "error" },
  ];

  const otifDonut: DonutSegment[] = [
    { label: "No prazo e completo", value: otifData.otif, tone: "success" },
    { label: "Fora da meta", value: Math.max(0, otifData.total - otifData.otif), tone: "neutral" },
  ];

  const checksDonut: DonutSegment[] = [
    { label: "Recebimento", value: div.breakdown.receiving.total, tone: "accent" },
    { label: "Expedicao", value: div.breakdown.shipping.total, tone: "info" },
    { label: "Picking", value: div.breakdown.picking.total, tone: "success" },
    { label: "Inventario", value: div.breakdown.counting.total, tone: "warning" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Centro de distribuicao · CD-01"
        title="Dashboard operacional"
        description="Indicadores calculados a partir das operacoes registradas — movimentos, conferencias e tempos de tarefa. Nenhum valor e fixo."
        meta={
          <>
            <MetaItem label="Data" value={fmtDateTime(new Date().toISOString())} />
            <MetaItem label="SKUs em estoque" value={fmtNumber(head.skus)} />
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
            <Link href="/simulation" className="btn btn-sm btn-primary">
              Cenario · {progress.done}/{progress.total}
            </Link>
          </>
        }
      />

      {/* ------------------------------------------------ KPIs principais */}
      <section aria-label="Indicadores principais" className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
        {primary.map((k) => <KpiCard key={k.key} kpi={k} featured />)}
      </section>

      {/* ------------------------------------------------ movimentacao (grafico principal) */}
      <Card className="mb-5">
        <CardHeader
          title="Movimentacao de estoque"
          subtitle={`${fmtNumber(head.movements)} movimentos registrados · entradas, saidas e internos por hora`}
          action={<Link href="/inventory/movements" className="btn btn-sm btn-ghost">Ver todos <IconArrowRight size={13} /></Link>}
        />
        <MovementTrend data={series} />
      </Card>

      {/* ------------------------------------------------ analises */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5 items-stretch">
        <Card>
          <CardHeader title="Ocupacao do armazem" subtitle={`${occ.occupied} de ${occ.totalPositions} posicoes-palete`} />
          <Donut segments={occDonut} centerValue={fmtPercent(occ.occupancyPct, 1)} centerLabel="ocupado" />
          <p className="text-[11.5px] text-faint mt-4">
            {occ.totalPositions} posicoes · {occ.occupied} ocupadas · {occ.available} disponiveis
          </p>
        </Card>

        <Card>
          <CardHeader title="Tempo medio por processo" subtitle="Comparativo entre as etapas da operacao" />
          <HorizontalBars items={processBars} />
        </Card>
      </div>

      {/* ------------------------------------------------ performance */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5 items-stretch">
        <Card>
          <CardHeader title="Produtividade de picking" subtitle="Linhas separadas por hora" />
          <div className="flex items-end justify-between gap-4">
            <div>
              {byKey.productivity?.value != null ? (
                <p className="text-[38px] leading-none font-[family-name:var(--font-display)] font-semibold tnum text-primary">
                  {fmtNumber(byKey.productivity.value, 1)}
                  <span className="text-[0.42em] font-medium text-secondary ml-1">lin/h</span>
                </p>
              ) : (
                <p className="text-[19px] text-faint font-[family-name:var(--font-display)] leading-none">sem dados</p>
              )}
              <p className="text-[11.5px] text-faint mt-2">{byKey.productivity?.sample}</p>
            </div>
            <Sparkline values={pickSeries.map((p) => p.picks)} tone="accent" />
          </div>
        </Card>

        <Card>
          <CardHeader title="OTIF (No prazo e completo)" subtitle="Pedidos entregues no prazo e completos" />
          <Donut
            segments={otifDonut}
            centerValue={otifData.value === null ? "—" : fmtPercent(otifData.value, 1)}
            centerLabel="OTIF"
          />
          <p className="text-[11.5px] text-faint mt-4">
            {otifData.total ? `${otifData.otif} de ${otifData.total} pedidos no prazo e completos` : "nenhum pedido expedido"}
          </p>
        </Card>
      </div>

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

      {/* ------------------------------------------------ mapa + distribuicao */}
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
          <CardHeader title="Conferencias por processo" subtitle="Composicao das conferencias do cenario" />
          {div.total === 0 ? (
            <EmptyState title="Nenhuma conferencia" description="Ainda nao ha conferencias registradas no cenario." />
          ) : (
            <Donut segments={checksDonut} centerValue={fmtNumber(div.total)} centerLabel="conferencias" />
          )}

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

      {/* ------------------------------------------------ atividade recente + alertas */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5 items-start">
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
              <span className="absolute left-[5px] top-1.5 bottom-1.5 w-px bg-border" aria-hidden />
              {pulse.map((e) => (
                <li key={e.id} className="relative pl-6 py-[6px]">
                  <span
                    className={`absolute left-0 top-[11px] w-[11px] h-[11px] rounded-full border-2 border-bg ${dotClass(e.tone)}`}
                    aria-hidden
                  />
                  <div className="flex items-baseline gap-2.5 flex-wrap">
                    <span className="text-[11px] text-faint tnum w-[42px] flex-none">{fmtTime(e.at)}</span>
                    <span className="eyebrow w-[104px] flex-none truncate">{e.stage}</span>
                    <span className="text-[12.5px] text-primary flex-1 min-w-0 truncate" title={e.detail}>
                      {e.detail || e.label}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className={inc.critical > 0 ? "border-error-line bg-error-soft" : ""}>
          <CardHeader
            title="Alertas e excecoes"
            subtitle={inc.critical > 0 ? "Requer atencao imediata" : "Nenhuma ocorrencia critica"}
            action={<Link href="/incidents" className="btn btn-sm btn-ghost">Ver <IconArrowRight size={13} /></Link>}
          />
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Abertas" value={inc.open} tone={inc.open > 0 ? "warning" : "neutral"} />
            <MiniStat label="Em analise" value={inc.analysis} tone="info" />
            <MiniStat label="Criticas" value={inc.critical} tone={inc.critical > 0 ? "error" : "neutral"} />
          </div>
          {inc.critical > 0 && (
            <p className="flex items-start gap-2 text-[12px] text-error-fg mt-3.5">
              <IconAlert size={14} className="flex-none mt-0.5" />
              Divergencias nao tratadas bloqueiam a expedicao dos pedidos afetados.
            </p>
          )}
        </Card>
      </div>

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
    </>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: "neutral" | "warning" | "info" | "error" }) {
  const color = {
    neutral: "text-primary", warning: "text-warning-fg", info: "text-info-fg", error: "text-error-fg",
  }[tone];
  return (
    <div className="text-center py-2 rounded-md bg-bg border border-border">
      <p className={`text-[22px] leading-none font-[family-name:var(--font-display)] font-semibold tnum ${color}`}>
        {fmtNumber(value)}
      </p>
      <p className="text-[10px] text-faint mt-1 uppercase tracking-[0.06em]">{label}</p>
    </div>
  );
}

function dotClass(tone: string) {
  return {
    success: "bg-success", accent: "bg-accent", warning: "bg-warning",
    error: "bg-error", info: "bg-info", neutral: "bg-neutral",
  }[tone] ?? "bg-neutral";
}
