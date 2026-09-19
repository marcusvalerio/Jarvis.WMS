import { all, one, scalar } from "@/lib/db";
import { minutesBetween, round2 } from "@/lib/format";
import { occupancy } from "./warehouse";
import { availability } from "./equipment";
import { globalAccuracy } from "./counting";

/**
 * KPIs OPERACIONAIS.
 *
 * Todos os indicadores abaixo sao CALCULADOS a partir dos registros reais de
 * operacao (movimentos, conferencias, tempos de tarefa). Nenhum valor e fixo.
 * Quando nao ha base para calcular, o indicador retorna `null` e a interface
 * mostra explicitamente "sem dados" — nunca um numero inventado.
 */

export interface Kpi {
  key: string;
  label: string;
  value: number | null;
  unit: "%" | "min" | "h" | "un" | "lin/h" | "un/h" | "";
  hint: string;
  /** Faixa boa/atencao para colorir o indicador. */
  target?: { good: number; warn: number; direction: "higher" | "lower" };
  sample: string;
}

function avg(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

// ------------------------------------------------- acuracidade de estoque
export function stockAccuracy() {
  const g = globalAccuracy();
  return { ...g, hasData: g.counted > 0 };
}

// ------------------------------------------------- tempo medio de localizacao
export function avgLocateMinutes(): { value: number | null; sample: number } {
  const rows = all<any>(
    `SELECT started_at, location_scanned_at FROM picking_items
      WHERE started_at IS NOT NULL AND location_scanned_at IS NOT NULL`,
  );
  const values = rows.map((r) => minutesBetween(r.started_at, r.location_scanned_at) ?? 0);
  return { value: avg(values), sample: values.length };
}

// ------------------------------------------------- indice de divergencia
/**
 * Divergencias / operacoes conferidas.
 * Considera as tres conferencias da operacao: recebimento, expedicao e inventario.
 */
export function divergenceIndex() {
  const recv = one<any>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'DIVERGENCE' THEN 1 ELSE 0 END) AS divs
       FROM receiving_check_items WHERE status <> 'PENDING'`,
  );
  const ship = one<any>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'DIVERGENCE' THEN 1 ELSE 0 END) AS divs
       FROM shipping_check_items WHERE status <> 'PENDING'`,
  );
  const count = one<any>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN divergence <> 0 THEN 1 ELSE 0 END) AS divs
       FROM inventory_count_items WHERE status <> 'PENDING'`,
  );
  const pick = one<any>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN status IN ('DIVERGENCE','SKIPPED') THEN 1 ELSE 0 END) AS divs
       FROM picking_items WHERE status NOT IN ('PENDING','LOCATION_SCANNED','PRODUCT_SCANNED')`,
  );
  const total = (recv?.total ?? 0) + (ship?.total ?? 0) + (count?.total ?? 0) + (pick?.total ?? 0);
  const divs = (recv?.divs ?? 0) + (ship?.divs ?? 0) + (count?.divs ?? 0) + (pick?.divs ?? 0);
  return {
    total, divergences: divs,
    index: total ? (divs / total) * 100 : null,
    breakdown: {
      receiving: { total: recv?.total ?? 0, divergences: recv?.divs ?? 0 },
      shipping: { total: ship?.total ?? 0, divergences: ship?.divs ?? 0 },
      counting: { total: count?.total ?? 0, divergences: count?.divs ?? 0 },
      picking: { total: pick?.total ?? 0, divergences: pick?.divs ?? 0 },
    },
  };
}

// ------------------------------------------------- produtividade de picking
export function pickingProductivity() {
  const items = all<any>(
    `SELECT started_at, completed_at, picked_qty FROM picking_items
      WHERE started_at IS NOT NULL AND completed_at IS NOT NULL`,
  );
  const minutes = items.reduce(
    (s, i) => s + Math.max(0, minutesBetween(i.started_at, i.completed_at) ?? 0), 0,
  );
  const units = items.reduce((s, i) => s + (i.picked_qty ?? 0), 0);
  return {
    lines: items.length,
    units,
    minutes,
    linesPerHour: minutes > 0 ? (items.length / minutes) * 60 : null,
    unitsPerHour: minutes > 0 ? (units / minutes) * 60 : null,
    avgLineMinutes: items.length ? minutes / items.length : null,
  };
}

// ------------------------------------------------- ciclos
export function avgReceivingMinutes(): { value: number | null; sample: number } {
  const rows = all<any>(
    `SELECT arrived_at, completed_at FROM inbound_orders
      WHERE arrived_at IS NOT NULL AND completed_at IS NOT NULL`,
  );
  const values = rows.map((r) => minutesBetween(r.arrived_at, r.completed_at) ?? 0);
  return { value: avg(values), sample: values.length };
}

export function avgPutawayMinutes(): { value: number | null; sample: number } {
  const rows = all<any>(
    `SELECT created_at, stored_at FROM pallets
      WHERE stored_at IS NOT NULL AND origin_kind = 'RECEIVING'`,
  );
  const values = rows.map((r) => minutesBetween(r.created_at, r.stored_at) ?? 0);
  return { value: avg(values), sample: values.length };
}

export function avgShippingMinutes(): { value: number | null; sample: number } {
  const rows = all<any>(
    `SELECT released_at, shipped_at FROM sales_orders
      WHERE released_at IS NOT NULL AND shipped_at IS NOT NULL`,
  );
  const values = rows.map((r) => minutesBetween(r.released_at, r.shipped_at) ?? 0);
  return { value: avg(values), sample: values.length };
}

// ------------------------------------------------- OTIF
/**
 * On Time In Full: pedidos expedidos ate o prazo E com quantidade completa.
 */
export function otif() {
  const rows = all<any>(
    `SELECT so.id, so.due_at, so.shipped_at,
            (SELECT COUNT(*) FROM sales_order_items si
              WHERE si.sales_order_id = so.id AND si.shipped_qty < si.quantity) AS incomplete
       FROM sales_orders so WHERE so.status = 'SHIPPED'`,
  );
  if (rows.length === 0) {
    return { value: null, total: 0, onTime: 0, inFull: 0, otif: 0 };
  }
  let onTime = 0, inFull = 0, both = 0;
  for (const r of rows) {
    const t = new Date(r.shipped_at) <= new Date(r.due_at);
    const f = (r.incomplete ?? 0) === 0;
    if (t) onTime++;
    if (f) inFull++;
    if (t && f) both++;
  }
  return {
    value: (both / rows.length) * 100,
    total: rows.length, onTime, inFull, otif: both,
  };
}

// ------------------------------------------------- painel consolidado
export function dashboardKpis(): Kpi[] {
  const acc = stockAccuracy();
  const locate = avgLocateMinutes();
  const div = divergenceIndex();
  const eq = availability();
  const occ = occupancy();
  const prod = pickingProductivity();
  const ot = otif();
  const recv = avgReceivingMinutes();
  const put = avgPutawayMinutes();
  const ship = avgShippingMinutes();

  return [
    {
      key: "accuracy", label: "Acuracidade de estoque",
      value: acc.hasData ? round2(acc.accuracy) : null, unit: "%",
      hint: "Posicoes sem divergencia / posicoes inventariadas",
      target: { good: 99, warn: 97, direction: "higher" },
      sample: acc.hasData ? `${acc.counted} posicoes contadas` : "nenhum inventario executado",
    },
    {
      key: "locate", label: "Tempo medio de localizacao",
      value: locate.value === null ? null : round2(locate.value), unit: "min",
      hint: "Inicio da linha ate a confirmacao do endereco na coletora",
      target: { good: 1.5, warn: 3, direction: "lower" },
      sample: `${locate.sample} linhas medidas`,
    },
    {
      key: "divergence", label: "Indice de divergencia",
      value: div.index === null ? null : round2(div.index), unit: "%",
      hint: "Divergencias / operacoes conferidas (recebimento, picking, expedicao, inventario)",
      target: { good: 1, warn: 3, direction: "lower" },
      sample: `${div.divergences} de ${div.total} conferencias`,
    },
    {
      key: "equipment", label: "Disponibilidade de equipamentos",
      value: round2(eq.availabilityPct), unit: "%",
      hint: "Tempo disponivel / tempo total monitorado",
      target: { good: 95, warn: 85, direction: "higher" },
      sample: `${eq.available + eq.inUse} de ${eq.total} operacionais`,
    },
    {
      key: "occupancy", label: "Ocupacao do armazem",
      value: round2(occ.occupancyPct), unit: "%",
      hint: "Posicoes-palete ocupadas / posicoes disponiveis",
      target: { good: 85, warn: 95, direction: "lower" },
      sample: `${occ.occupied} de ${occ.totalPositions} posicoes`,
    },
    {
      key: "productivity", label: "Produtividade de picking",
      value: prod.linesPerHour === null ? null : round2(prod.linesPerHour), unit: "lin/h",
      hint: "Linhas separadas por hora de operacao",
      target: { good: 60, warn: 30, direction: "higher" },
      sample: `${prod.lines} linhas em ${round2(prod.minutes)} min`,
    },
    {
      key: "otif", label: "OTIF",
      value: ot.value === null ? null : round2(ot.value), unit: "%",
      hint: "Pedidos entregues no prazo e completos",
      target: { good: 98, warn: 95, direction: "higher" },
      sample: ot.total ? `${ot.otif} de ${ot.total} pedidos` : "nenhum pedido expedido",
    },
    {
      key: "receiving", label: "Tempo medio de recebimento",
      value: recv.value === null ? null : round2(recv.value), unit: "min",
      hint: "Chegada do veiculo ate a conclusao do recebimento",
      target: { good: 60, warn: 120, direction: "lower" },
      sample: `${recv.sample} recebimentos concluidos`,
    },
    {
      key: "putaway", label: "Tempo medio de put-away",
      value: put.value === null ? null : round2(put.value), unit: "min",
      hint: "Montagem do palete ate a armazenagem confirmada",
      target: { good: 30, warn: 60, direction: "lower" },
      sample: `${put.sample} paletes armazenados`,
    },
    {
      key: "shipping", label: "Tempo medio de expedicao",
      value: ship.value === null ? null : round2(ship.value), unit: "min",
      hint: "Liberacao do pedido ate a expedicao",
      target: { good: 120, warn: 240, direction: "lower" },
      sample: `${ship.sample} pedidos expedidos`,
    },
  ];
}

export type KpiTone = "good" | "warn" | "bad" | "muted";

export function kpiTone(kpi: Kpi): KpiTone {
  if (kpi.value === null || !kpi.target) return "muted";
  const { good, warn, direction } = kpi.target;
  if (direction === "higher") {
    if (kpi.value >= good) return "good";
    if (kpi.value >= warn) return "warn";
    return "bad";
  }
  if (kpi.value <= good) return "good";
  if (kpi.value <= warn) return "warn";
  return "bad";
}

// ------------------------------------------------- pulso operacional
export interface PulseEvent {
  id: string;
  at: string;
  stage: string;
  label: string;
  detail: string;
  actor: string;
  tone: string;
}

/** Ultimos eventos relevantes, consolidados de varias fontes. */
export function operationalPulse(limit = 18): PulseEvent[] {
  const rows = all<any>(
    `SELECT id, occurred_at AS at, action, entity, entity_id, detail, actor, origin
       FROM audit_logs
      WHERE action IN ('RECEIVE','CHECK','MOVE','PICK','PACK','LOAD','SHIP','RESERVE','COUNT','WEIGH','APPROVE')
      ORDER BY occurred_at DESC, id DESC LIMIT ?`,
    limit,
  );
  const stageOf: Record<string, string> = {
    RECEIVE: "Recebimento", CHECK: "Conferencia", MOVE: "Movimentacao",
    PICK: "Picking", PACK: "Packing", LOAD: "Carregamento", SHIP: "Expedicao",
    RESERVE: "Reserva", COUNT: "Inventario", WEIGH: "Pesagem", APPROVE: "Aprovacao",
  };
  const toneOf: Record<string, string> = {
    SHIP: "success", APPROVE: "success", PICK: "accent", PACK: "info",
    LOAD: "accent", CHECK: "warning", COUNT: "info", RESERVE: "info",
    MOVE: "neutral", WEIGH: "neutral", RECEIVE: "accent",
  };
  return rows.map((r) => ({
    id: r.id, at: r.at, stage: stageOf[r.action] ?? r.action,
    label: r.entity_id, detail: r.detail ?? "", actor: r.actor,
    tone: toneOf[r.action] ?? "neutral",
  }));
}

// ------------------------------------------------- visao de operacao
export interface StageSnapshot {
  stage: string;
  pending: number;
  running: number;
  done: number;
  items: { id: string; label: string; status: string; progress?: string }[];
}

export function operationSnapshot(): StageSnapshot[] {
  const inbound = all<any>(
    `SELECT io.id, io.status, s.name AS supplier_name,
            (SELECT COUNT(*) FROM inbound_order_items ii WHERE ii.inbound_order_id = io.id) AS lines
       FROM inbound_orders io JOIN suppliers s ON s.id = io.supplier_id
      WHERE io.status <> 'CANCELLED' ORDER BY io.scheduled_at`,
  );
  const storage = all<any>(
    `SELECT so.id, so.status, so.pallet_id, l.code AS suggested
       FROM storage_orders so LEFT JOIN locations l ON l.id = so.suggested_location_id
      ORDER BY so.created_at`,
  );
  const picking = all<any>(
    `SELECT id, status, sales_order_id, done_lines, total_lines FROM picking_orders
      WHERE status <> 'CANCELLED' ORDER BY created_at`,
  );
  const packing = all<any>(
    `SELECT id, status, sales_order_id, total_volumes FROM packing_orders
      WHERE status <> 'CANCELLED' ORDER BY created_at`,
  );
  const checks = all<any>(
    `SELECT id, status, sales_order_id, divergence_count FROM shipping_checks ORDER BY started_at`,
  );
  const loading = all<any>(
    `SELECT id, status, manifest_id, loaded_volumes, expected_volumes FROM loading_operations
      ORDER BY created_at`,
  );
  const shipped = all<any>(
    `SELECT id, status, route, total_volumes FROM shipping_manifests
      WHERE status IN ('LOADED','SHIPPED') ORDER BY created_at`,
  );

  const mk = (
    stage: string, rows: any[],
    running: string[], done: string[],
    label: (r: any) => string, progress?: (r: any) => string,
  ): StageSnapshot => ({
    stage,
    pending: rows.filter((r) => !running.includes(r.status) && !done.includes(r.status)).length,
    running: rows.filter((r) => running.includes(r.status)).length,
    done: rows.filter((r) => done.includes(r.status)).length,
    items: rows.slice(0, 8).map((r) => ({
      id: r.id, label: label(r), status: r.status, progress: progress?.(r),
    })),
  });

  return [
    mk("Recebimento", inbound, ["ARRIVING", "RECEIVING"], ["COMPLETED"],
      (r) => r.supplier_name, (r) => `${r.lines} linhas`),
    mk("Armazenagem", storage, ["IN_PROGRESS"], ["COMPLETED"],
      (r) => r.pallet_id, (r) => r.suggested ?? "—"),
    mk("Picking", picking, ["IN_PROGRESS"], ["COMPLETED", "DIVERGENCE"],
      (r) => r.sales_order_id, (r) => `${r.done_lines}/${r.total_lines}`),
    mk("Packing", packing, ["IN_PROGRESS"], ["COMPLETED"],
      (r) => r.sales_order_id, (r) => `${r.total_volumes} vol`),
    mk("Conferencia", checks, ["IN_PROGRESS"], ["OK", "CLOSED"],
      (r) => r.sales_order_id, (r) => `${r.divergence_count} div`),
    mk("Carregamento", loading, ["IN_PROGRESS"], ["COMPLETED"],
      (r) => r.manifest_id, (r) => `${r.loaded_volumes}/${r.expected_volumes}`),
    mk("Expedicao", shipped, ["LOADED"], ["SHIPPED"],
      (r) => r.route, (r) => `${r.total_volumes} vol`),
  ];
}

// ------------------------------------------------- contadores de topo
export function headline() {
  return {
    inboundToday: scalar<number>(
      `SELECT COUNT(*) FROM inbound_orders WHERE status NOT IN ('COMPLETED','CANCELLED')`,
    ) ?? 0,
    ordersOpen: scalar<number>(
      `SELECT COUNT(*) FROM sales_orders WHERE status NOT IN ('SHIPPED','CANCELLED')`,
    ) ?? 0,
    pickingRunning: scalar<number>(
      `SELECT COUNT(*) FROM picking_orders WHERE status = 'IN_PROGRESS'`,
    ) ?? 0,
    volumesReady: scalar<number>(
      `SELECT COUNT(*) FROM volumes WHERE status = 'CHECKED'`,
    ) ?? 0,
    shippedToday: scalar<number>(
      `SELECT COUNT(*) FROM sales_orders WHERE status = 'SHIPPED'`,
    ) ?? 0,
    incidentsOpen: scalar<number>(
      `SELECT COUNT(*) FROM incidents WHERE status IN ('OPEN','IN_ANALYSIS')`,
    ) ?? 0,
    movements: scalar<number>(`SELECT COUNT(*) FROM inventory_movements`) ?? 0,
    skus: scalar<number>(
      `SELECT COUNT(DISTINCT product_id) FROM inventory WHERE qty_on_hand > 0`,
    ) ?? 0,
    unitsOnHand: scalar<number>(
      `SELECT COALESCE(SUM(qty_on_hand),0) FROM inventory`,
    ) ?? 0,
    unitsReserved: scalar<number>(
      `SELECT COALESCE(SUM(qty_reserved),0) FROM inventory`,
    ) ?? 0,
  };
}

/**
 * Serie de movimentacao por hora nas ultimas `hours` horas, ancorada em
 * AGORA. Durante a apresentacao as barras crescem em tempo real; o estoque
 * inicial (carregado com data retroativa) fica fora da janela, como deve.
 */
export function movementSeries(hours = 12) {
  const now = Date.now();
  const hourMs = 3_600_000;
  const start = Math.floor(now / hourMs) * hourMs - (hours - 1) * hourMs;

  const buckets = Array.from({ length: hours }, (_, i) => ({
    bucket: i,
    at: new Date(start + i * hourMs).toISOString(),
    in: 0, out: 0, internal: 0, total: 0,
  }));

  const rows = all<{ kind: string; occurred_at: string }>(
    `SELECT kind, occurred_at FROM inventory_movements WHERE occurred_at >= ?`,
    new Date(start).toISOString(),
  );
  for (const r of rows) {
    const idx = Math.floor((new Date(r.occurred_at).getTime() - start) / hourMs);
    if (idx < 0 || idx >= hours) continue;
    const b = buckets[idx];
    if (r.kind === "RECEIPT" || r.kind === "RETURN") b.in++;
    else if (r.kind === "SHIP") b.out++;
    else b.internal++;
    b.total++;
  }
  return buckets;
}
