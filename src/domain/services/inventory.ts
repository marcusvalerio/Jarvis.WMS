import { all, one, run, insert, scalar } from "@/lib/db";
import { nextId, PREFIX } from "@/lib/ids";
import { nowIso, round3 } from "@/lib/format";
import { audit } from "./audit";
import type { MovementKind } from "@/domain/states";

/**
 * NUCLEO DE ESTOQUE.
 *
 * Regra absoluta do sistema: nenhuma quantidade de estoque muda sem passar
 * por `applyMovement`, que grava um inventory_movement correspondente.
 * Nao existe UPDATE direto em `inventory` fora deste modulo.
 *
 * Invariantes garantidos:
 *   qty_on_hand >= 0
 *   qty_on_hand >= qty_reserved + qty_blocked
 *   reserva nunca excede o disponivel
 */

export class StockError extends Error {
  readonly code: string;
  constructor(message: string, code = "STOCK_ERROR") {
    super(message);
    this.name = "StockError";
    this.code = code;
  }
}

export interface InventoryRow {
  id: string;
  product_id: string;
  lot_id: string | null;
  location_id: string;
  pallet_id: string | null;
  qty_on_hand: number;
  qty_reserved: number;
  qty_blocked: number;
  qty_in_transit: number;
  status: string;
  weight_kg: number;
  received_at: string | null;
  updated_at: string;
}

export interface StockSummary {
  onHand: number;
  reserved: number;
  blocked: number;
  inTransit: number;
  available: number;
  weightKg: number;
  locations: number;
}

// ------------------------------------------------------------------ consultas
export async function stockOf(productId: string): Promise<StockSummary> {
  const r = await one<any>(
    `SELECT COALESCE(SUM(qty_on_hand),0) oh, COALESCE(SUM(qty_reserved),0) rs,
            COALESCE(SUM(qty_blocked),0) bk, COALESCE(SUM(qty_in_transit),0) it,
            COALESCE(SUM(weight_kg),0) wt, COUNT(DISTINCT location_id) locs
       FROM inventory WHERE product_id = ?`,
    productId,
  );
  const onHand = round3(r?.oh ?? 0);
  const reserved = round3(r?.rs ?? 0);
  const blocked = round3(r?.bk ?? 0);
  return {
    onHand,
    reserved,
    blocked,
    inTransit: round3(r?.it ?? 0),
    available: round3(onHand - reserved - blocked),
    weightKg: round3(r?.wt ?? 0),
    locations: r?.locs ?? 0,
  };
}

export async function rowsOf(productId: string): Promise<InventoryRow[]> {
  return await all<InventoryRow>(
    `SELECT * FROM inventory WHERE product_id = ? AND qty_on_hand > 0
     ORDER BY location_id`,
    productId,
  );
}

export async function rowsAtLocation(locationId: string): Promise<InventoryRow[]> {
  return await all<InventoryRow>(
    `SELECT * FROM inventory WHERE location_id = ? AND qty_on_hand > 0`,
    locationId,
  );
}

export async function rowsOnPallet(palletId: string): Promise<InventoryRow[]> {
  return await all<InventoryRow>(
    `SELECT * FROM inventory WHERE pallet_id = ? AND qty_on_hand > 0`,
    palletId,
  );
}

export async function getRow(id: string): Promise<InventoryRow | undefined> {
  return await one<InventoryRow>(`SELECT * FROM inventory WHERE id = ?`, id);
}

export function availableIn(row: InventoryRow): number {
  return round3(row.qty_on_hand - row.qty_reserved - row.qty_blocked);
}

/** Saldo total do produto no armazem (fisico). */
export async function onHandOf(productId: string): Promise<number> {
  return round3(
    await scalar<number>(
      `SELECT COALESCE(SUM(qty_on_hand),0) FROM inventory WHERE product_id = ?`,
      productId,
    ) ?? 0,
  );
}

// ------------------------------------------------------------------ interno
async function rowKey(
  productId: string, lotId: string | null, locationId: string, palletId: string | null,
) {
  return await one<InventoryRow>(
    `SELECT * FROM inventory
      WHERE product_id = ? AND location_id = ?
        AND lot_id IS ? AND pallet_id IS ?`,
    productId, locationId, lotId, palletId,
  );
}

async function ensureRow(
  productId: string, lotId: string | null, locationId: string,
  palletId: string | null, at: string,
): Promise<InventoryRow> {
  const existing = await rowKey(productId, lotId, locationId, palletId);
  if (existing) return existing;
  const id = `STK-${productId}-${lotId ?? "NL"}-${locationId}-${palletId ?? "NP"}`;
  await insert("inventory", {
    id, product_id: productId, lot_id: lotId, location_id: locationId,
    pallet_id: palletId, qty_on_hand: 0, qty_reserved: 0, qty_blocked: 0,
    qty_in_transit: 0, status: "AVAILABLE", weight_kg: 0,
    received_at: at, updated_at: at,
  });
  return (await getRow(id))!;
}

async function unitWeight(productId: string): Promise<number> {
  return (
    (await one<{ w: number }>(`SELECT unit_gross_kg AS w FROM products WHERE id = ?`, productId))?.w ?? 0
  );
}

function deriveStatus(row: { qty_on_hand: number; qty_reserved: number; qty_blocked: number }) {
  if (row.qty_blocked > 0 && row.qty_blocked >= row.qty_on_hand) return "BLOCKED";
  if (row.qty_reserved > 0) return "RESERVED";
  return "AVAILABLE";
}

async function writeRow(id: string, at: string) {
  const r = await getRow(id);
  if (!r) return;
  if (r.qty_on_hand < -0.0001) {
    throw new StockError(`Estoque negativo impedido em ${id}`, "NEGATIVE_STOCK");
  }
  if (round3(r.qty_reserved + r.qty_blocked) > round3(r.qty_on_hand) + 0.0001) {
    throw new StockError(
      `Reserva/bloqueio (${r.qty_reserved}+${r.qty_blocked}) excede o saldo (${r.qty_on_hand}) em ${id}`,
      "OVER_ALLOCATION",
    );
  }
  await run(
    `UPDATE inventory SET weight_kg = ?, status = ?, updated_at = ? WHERE id = ?`,
    round3(r.qty_on_hand * await unitWeight(r.product_id)),
    deriveStatus(r),
    at,
    id,
  );
}

/** Mantem o status do endereco coerente com a ocupacao real. */
export async function refreshLocationStatus(locationId: string) {
  const loc = await one<{ status: string }>(`SELECT status FROM locations WHERE id = ?`, locationId);
  if (!loc || loc.status === "BLOCKED") return;
  const occupied =
    (await scalar<number>(
      `SELECT COUNT(*) FROM inventory WHERE location_id = ? AND qty_on_hand > 0`,
      locationId,
    ) ?? 0) > 0;
  const next = occupied ? "OCCUPIED" : "AVAILABLE";
  if (next !== loc.status) {
    await run(`UPDATE locations SET status = ? WHERE id = ?`, next, locationId);
  }
}

// ------------------------------------------------------------------ movimento
export interface MovementInput {
  kind: MovementKind;
  productId: string;
  lotId?: string | null;
  quantity: number;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  /** Palete envolvido em ambas as pontas (movimentacao de palete inteiro). */
  palletId?: string | null;
  /** Palete de origem, quando difere do de destino. */
  fromPalletId?: string | null;
  /**
   * Palete de destino. No picking a mercadoria SAI do palete e segue solta
   * para o staging — por isso origem e destino sao declarados separadamente.
   */
  toPalletId?: string | null;
  refKind?: string;
  refId?: string;
  reason?: string;
  operatorId?: string;
  occurredAt?: string;
  origin?: "WEB" | "RF" | "SYSTEM" | "SEED";
}

/**
 * Unico ponto de mutacao de estoque do sistema.
 * - com `toLocationId` e sem `fromLocationId`  -> entrada
 * - com `fromLocationId` e sem `toLocationId`  -> saida
 * - com ambos                                   -> transferencia
 */
export async function applyMovement(input: MovementInput): Promise<string> {
  const at = input.occurredAt ?? nowIso();
  const qty = round3(input.quantity);
  if (qty <= 0) throw new StockError("Quantidade do movimento deve ser positiva", "BAD_QTY");
  if (!input.fromLocationId && !input.toLocationId) {
    throw new StockError("Movimento exige origem e/ou destino", "NO_ENDPOINT");
  }

  const lotId = input.lotId ?? null;
  const fromPallet = input.fromPalletId !== undefined ? input.fromPalletId : (input.palletId ?? null);
  const toPallet = input.toPalletId !== undefined ? input.toPalletId : (input.palletId ?? null);
  const palletId = fromPallet ?? toPallet;

  // --- saida da origem
  if (input.fromLocationId) {
    const src = await rowKey(input.productId, lotId, input.fromLocationId, fromPallet);
    if (!src) {
      throw new StockError(
        `Sem estoque de ${input.productId} em ${input.fromLocationId} para movimentar`,
        "NO_SOURCE",
      );
    }
    const free = round3(src.qty_on_hand - src.qty_blocked);
    if (free < qty - 0.0001) {
      throw new StockError(
        `Saldo insuficiente em ${input.fromLocationId}: disponivel ${free}, solicitado ${qty}`,
        "INSUFFICIENT",
      );
    }
    await run(
      `UPDATE inventory SET qty_on_hand = qty_on_hand - ? WHERE id = ?`,
      qty, src.id,
    );
    await writeRow(src.id, at);
    await refreshLocationStatus(input.fromLocationId);
  }

  // --- entrada no destino
  if (input.toLocationId) {
    const dst = await ensureRow(input.productId, lotId, input.toLocationId, toPallet, at);
    await run(`UPDATE inventory SET qty_on_hand = qty_on_hand + ? WHERE id = ?`, qty, dst.id);
    await writeRow(dst.id, at);
    await refreshLocationStatus(input.toLocationId);
  }

  const balance = await onHandOf(input.productId);
  const movId = await nextId(PREFIX.MOVEMENT);
  await insert("inventory_movements", {
    id: movId,
    kind: input.kind,
    product_id: input.productId,
    lot_id: lotId,
    quantity: qty,
    unit: (await one<{ unit: string }>(`SELECT unit FROM products WHERE id = ?`, input.productId))?.unit ?? "CX",
    from_location_id: input.fromLocationId ?? null,
    to_location_id: input.toLocationId ?? null,
    pallet_id: palletId,
    ref_kind: input.refKind ?? null,
    ref_id: input.refId ?? null,
    reason: input.reason ?? null,
    operator_id: input.operatorId ?? null,
    balance_after: balance,
    weight_kg: round3(qty * await unitWeight(input.productId)),
    occurred_at: at,
  });

  await audit({
    actor: input.operatorId ?? "SISTEMA",
    action: "MOVE",
    entity: "inventory_movement",
    entityId: movId,
    after: {
      kind: input.kind, product: input.productId, qty,
      from: input.fromLocationId, to: input.toLocationId, balance,
    },
    origin: input.origin ?? "WEB",
    detail: `${input.kind} ${qty} ${input.productId}`,
    occurredAt: at,
  });

  return movId;
}

// ------------------------------------------------------------------ reservas
export interface ReservationCandidate {
  inventoryId: string;
  productId: string;
  lotId: string | null;
  locationId: string;
  palletId: string | null;
  available: number;
  expiresAt: string | null;
  pickSequence: number;
}

/**
 * Candidatos a atender uma demanda, ordenados por FEFO
 * (First Expired, First Out) e depois pela rota de picking.
 */
export async function allocationCandidates(
  productId: string,
  strategy: "FEFO" | "FIFO" = "FEFO",
): Promise<ReservationCandidate[]> {
  const order =
    strategy === "FEFO"
      ? `COALESCE(l.expires_at, '9999-12-31') ASC, loc.pick_sequence ASC, i.id ASC`
      : `COALESCE(i.received_at, '9999-12-31') ASC, loc.pick_sequence ASC, i.id ASC`;
  return await all<any>(
    `SELECT i.id AS "inventoryId", i.product_id AS "productId", i.lot_id AS "lotId",
            i.location_id AS "locationId", i.pallet_id AS "palletId",
            -- ROUND(double precision, int) nao existe no PostgreSQL;
            -- a forma de duas casas so vale para numeric.
            ROUND((i.qty_on_hand - i.qty_reserved - i.qty_blocked)::numeric, 3)::double precision AS available,
            l.expires_at AS "expiresAt", loc.pick_sequence AS "pickSequence"
       FROM inventory i
       JOIN locations loc ON loc.id = i.location_id
       LEFT JOIN lots l ON l.id = i.lot_id
      WHERE i.product_id = ?
        AND loc.status <> 'BLOCKED'
        AND loc.kind <> 'STAGING'
        AND (i.qty_on_hand - i.qty_reserved - i.qty_blocked) > 0
      ORDER BY ${order}`,
    productId,
  );
}

export interface ReserveResult {
  reservationIds: string[];
  reserved: number;
  shortage: number;
}

/**
 * Reserva `quantity` do produto para um item de pedido.
 * Nunca reserva mais do que o disponivel — a falta e devolvida em `shortage`.
 */
export async function reserve(params: {
  salesOrderId: string;
  salesOrderItemId: string;
  productId: string;
  quantity: number;
  strategy?: "FEFO" | "FIFO";
  operatorId?: string;
  occurredAt?: string;
}): Promise<ReserveResult> {
  const at = params.occurredAt ?? nowIso();
  let remaining = round3(params.quantity);
  const ids: string[] = [];

  for (const c of await allocationCandidates(params.productId, params.strategy ?? "FEFO")) {
    if (remaining <= 0.0001) break;
    const take = round3(Math.min(c.available, remaining));
    if (take <= 0) continue;

    await run(`UPDATE inventory SET qty_reserved = qty_reserved + ? WHERE id = ?`, take, c.inventoryId);
    await writeRow(c.inventoryId, at);

    const resId = await nextId(PREFIX.RESERVATION);
    await insert("stock_reservations", {
      id: resId,
      sales_order_id: params.salesOrderId,
      sales_order_item_id: params.salesOrderItemId,
      inventory_id: c.inventoryId,
      product_id: params.productId,
      lot_id: c.lotId,
      location_id: c.locationId,
      pallet_id: c.palletId,
      quantity: take,
      picked_qty: 0,
      status: "ACTIVE",
      created_at: at,
    });
    ids.push(resId);
    remaining = round3(remaining - take);

    await audit({
      actor: params.operatorId ?? "SISTEMA",
      action: "RESERVE",
      entity: "stock_reservation",
      entityId: resId,
      after: { product: params.productId, qty: take, location: c.locationId, lot: c.lotId },
      detail: `Reserva de ${take} ${params.productId} em ${c.locationId} para ${params.salesOrderId}`,
      occurredAt: at,
    });
  }

  return {
    reservationIds: ids,
    reserved: round3(params.quantity - remaining),
    shortage: round3(remaining),
  };
}

/** Libera reservas ativas (cancelamento de pedido, replanejamento). */
export async function releaseReservations(
  salesOrderId: string,
  operatorId?: string,
  occurredAt?: string,
): Promise<number> {
  const at = occurredAt ?? nowIso();
  const list = await all<any>(
    `SELECT * FROM stock_reservations WHERE sales_order_id = ? AND status = 'ACTIVE'`,
    salesOrderId,
  );
  for (const r of list) {
    const open = round3(r.quantity - r.picked_qty);
    if (open > 0) {
      await run(`UPDATE inventory SET qty_reserved = qty_reserved - ? WHERE id = ?`, open, r.inventory_id);
      await writeRow(r.inventory_id, at);
    }
    await run(
      `UPDATE stock_reservations SET status = 'RELEASED', released_at = ? WHERE id = ?`,
      at, r.id,
    );
    await audit({
      actor: operatorId ?? "SISTEMA",
      action: "RELEASE",
      entity: "stock_reservation",
      entityId: r.id,
      before: { status: "ACTIVE", quantity: r.quantity },
      after: { status: "RELEASED", released: open },
      detail: `Liberacao de reserva de ${salesOrderId}`,
      occurredAt: at,
    });
  }
  return list.length;
}

/**
 * Consome uma reserva ao coletar fisicamente (picking).
 * Reduz simultaneamente o saldo e a reserva na origem e transfere para o
 * endereco de staging de expedicao.
 */
export async function consumeReservation(params: {
  reservationId: string;
  quantity: number;
  toLocationId: string;
  operatorId?: string;
  refKind?: string;
  refId?: string;
  occurredAt?: string;
  origin?: "WEB" | "RF" | "SYSTEM" | "SEED";
}): Promise<string> {
  const at = params.occurredAt ?? nowIso();
  const res = await one<any>(`SELECT * FROM stock_reservations WHERE id = ?`, params.reservationId);
  if (!res) throw new StockError("Reserva inexistente", "NO_RESERVATION");
  if (res.status !== "ACTIVE") throw new StockError("Reserva nao esta ativa", "RESERVATION_CLOSED");

  const qty = round3(params.quantity);
  const open = round3(res.quantity - res.picked_qty);
  if (qty > open + 0.0001) {
    throw new StockError(
      `Quantidade ${qty} excede a reserva em aberto (${open})`,
      "OVER_PICK",
    );
  }

  // Baixa a reserva antes de mover, para que o invariante siga valido.
  await run(`UPDATE inventory SET qty_reserved = qty_reserved - ? WHERE id = ?`, qty, res.inventory_id);
  await run(`UPDATE stock_reservations SET picked_qty = picked_qty + ? WHERE id = ?`, qty, res.id);

  const movId = await applyMovement({
    kind: "PICK",
    productId: res.product_id,
    lotId: res.lot_id,
    quantity: qty,
    fromLocationId: res.location_id,
    toLocationId: params.toLocationId,
    fromPalletId: res.pallet_id,
    toPalletId: null, // ao ser separada, a mercadoria sai do palete
    refKind: params.refKind ?? "SALES_ORDER",
    refId: params.refId ?? res.sales_order_id,
    reason: `Picking da reserva ${res.id}`,
    operatorId: params.operatorId,
    occurredAt: at,
    origin: params.origin,
  });

  const after = await one<any>(`SELECT * FROM stock_reservations WHERE id = ?`, res.id);
  if (round3(after.picked_qty) >= round3(after.quantity) - 0.0001) {
    await run(`UPDATE stock_reservations SET status = 'CONSUMED' WHERE id = ?`, res.id);
  }

  // Palete esvaziado pela separacao deixa de ocupar posicao.
  if (res.pallet_id && (await rowsOnPallet(res.pallet_id)).length === 0) {
    await run(`UPDATE pallets SET status = 'CONSUMED' WHERE id = ?`, res.pallet_id);
  }
  return movId;
}

// ------------------------------------------------------------------ bloqueios
export async function block(params: {
  inventoryId: string; quantity: number; reason: string;
  operatorId?: string; occurredAt?: string;
}) {
  const at = params.occurredAt ?? nowIso();
  const row = await getRow(params.inventoryId);
  if (!row) throw new StockError("Registro de estoque inexistente", "NO_ROW");
  const free = availableIn(row);
  if (params.quantity > free + 0.0001) {
    throw new StockError(`Nao ha ${params.quantity} disponivel para bloquear (livre ${free})`, "INSUFFICIENT");
  }
  await run(`UPDATE inventory SET qty_blocked = qty_blocked + ? WHERE id = ?`, round3(params.quantity), row.id);
  await writeRow(row.id, at);
  await applyMovement({
    kind: "BLOCK", productId: row.product_id, lotId: row.lot_id,
    quantity: params.quantity, fromLocationId: row.location_id, toLocationId: row.location_id,
    palletId: row.pallet_id, reason: params.reason, operatorId: params.operatorId, occurredAt: at,
  });
}

export async function unblock(params: {
  inventoryId: string; quantity: number; reason: string;
  operatorId?: string; occurredAt?: string;
}) {
  const at = params.occurredAt ?? nowIso();
  const row = await getRow(params.inventoryId);
  if (!row) throw new StockError("Registro de estoque inexistente", "NO_ROW");
  const qty = round3(Math.min(params.quantity, row.qty_blocked));
  await run(`UPDATE inventory SET qty_blocked = qty_blocked - ? WHERE id = ?`, qty, row.id);
  await writeRow(row.id, at);
  await applyMovement({
    kind: "UNBLOCK", productId: row.product_id, lotId: row.lot_id,
    quantity: qty, fromLocationId: row.location_id, toLocationId: row.location_id,
    palletId: row.pallet_id, reason: params.reason, operatorId: params.operatorId, occurredAt: at,
  });
}

/** Ajuste de inventario: leva o saldo do registro para `countedQty`. */
export async function adjustTo(params: {
  inventoryId: string; countedQty: number; reason: string;
  refKind?: string; refId?: string; operatorId?: string; occurredAt?: string;
}): Promise<string | null> {
  const at = params.occurredAt ?? nowIso();
  const row = await getRow(params.inventoryId);
  if (!row) throw new StockError("Registro de estoque inexistente", "NO_ROW");
  const diff = round3(params.countedQty - row.qty_on_hand);
  if (Math.abs(diff) < 0.0001) return null;

  if (diff > 0) {
    return await applyMovement({
      kind: "COUNT", productId: row.product_id, lotId: row.lot_id, quantity: diff,
      toLocationId: row.location_id, palletId: row.pallet_id,
      refKind: params.refKind, refId: params.refId,
      reason: params.reason, operatorId: params.operatorId, occurredAt: at,
    });
  }
  return await applyMovement({
    kind: "COUNT", productId: row.product_id, lotId: row.lot_id, quantity: -diff,
    fromLocationId: row.location_id, palletId: row.pallet_id,
    refKind: params.refKind, refId: params.refId,
    reason: params.reason, operatorId: params.operatorId, occurredAt: at,
  });
}

// ------------------------------------------------------------------ paletes
/** Move fisicamente TODO o conteudo de um palete para outro endereco. */
export async function movePallet(params: {
  palletId: string; toLocationId: string; kind?: MovementKind;
  refKind?: string; refId?: string; reason?: string;
  operatorId?: string; occurredAt?: string; origin?: "WEB" | "RF" | "SYSTEM" | "SEED";
}): Promise<string[]> {
  const at = params.occurredAt ?? nowIso();
  const rows = await rowsOnPallet(params.palletId);
  if (rows.length === 0) throw new StockError(`Palete ${params.palletId} esta vazio`, "EMPTY_PALLET");

  const movs: string[] = [];
  for (const r of rows) {
    if (r.location_id === params.toLocationId) continue;
    movs.push(
      await applyMovement({
        kind: params.kind ?? "PUTAWAY",
        productId: r.product_id,
        lotId: r.lot_id,
        quantity: r.qty_on_hand,
        fromLocationId: r.location_id,
        toLocationId: params.toLocationId,
        palletId: params.palletId,
        refKind: params.refKind,
        refId: params.refId,
        reason: params.reason,
        operatorId: params.operatorId,
        occurredAt: at,
        origin: params.origin,
      }),
    );
  }
  await run(`UPDATE pallets SET location_id = ? WHERE id = ?`, params.toLocationId, params.palletId);
  return movs;
}

// ------------------------------------------------------------------ listagens
export interface StockLine {
  product_id: string;
  sku: string;
  description: string;
  unit: string;
  abc_class: string;
  category: string;
  min_stock: number;
  on_hand: number;
  reserved: number;
  blocked: number;
  available: number;
  weight_kg: number;
  locations: number;
}

export async function stockByProduct(filter?: { search?: string; onlyWithStock?: boolean }): Promise<StockLine[]> {
  const where: string[] = ["p.active = 1"];
  const params: any[] = [];
  if (filter?.search) {
    where.push("(p.sku LIKE ? OR p.description LIKE ? OR p.category LIKE ?)");
    const q = `%${filter.search}%`;
    params.push(q, q, q);
  }
  const rows = await all<StockLine>(
    `SELECT p.id AS product_id, p.sku, p.description, p.unit, p.abc_class, p.category, p.min_stock,
            COALESCE(SUM(i.qty_on_hand),0) AS on_hand,
            COALESCE(SUM(i.qty_reserved),0) AS reserved,
            COALESCE(SUM(i.qty_blocked),0) AS blocked,
            COALESCE(SUM(i.qty_on_hand - i.qty_reserved - i.qty_blocked),0) AS available,
            COALESCE(SUM(i.weight_kg),0) AS weight_kg,
            COUNT(DISTINCT CASE WHEN i.qty_on_hand > 0 THEN i.location_id END) AS locations
       FROM products p
       LEFT JOIN inventory i ON i.product_id = p.id
      WHERE ${where.join(" AND ")}
      GROUP BY p.id
      ORDER BY p.sku`,
    ...params,
  );
  return filter?.onlyWithStock ? rows.filter((r) => r.on_hand > 0) : rows;
}

export interface MovementRow {
  id: string; kind: MovementKind; product_id: string; sku: string; description: string;
  lot_code: string | null; quantity: number; unit: string;
  from_location_id: string | null; to_location_id: string | null;
  from_code: string | null; to_code: string | null;
  pallet_id: string | null; ref_kind: string | null; ref_id: string | null;
  reason: string | null; operator_id: string | null; operator_name: string | null;
  balance_after: number | null; weight_kg: number; occurred_at: string;
}

export async function listMovements(filter: {
  productId?: string; refKind?: string; refId?: string; kind?: string;
  locationId?: string; palletId?: string; search?: string;
  limit?: number; offset?: number;
} = {}): Promise<MovementRow[]> {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.productId) { where.push("m.product_id = ?"); params.push(filter.productId); }
  if (filter.kind) { where.push("m.kind = ?"); params.push(filter.kind); }
  if (filter.refKind) { where.push("m.ref_kind = ?"); params.push(filter.refKind); }
  if (filter.refId) { where.push("m.ref_id = ?"); params.push(filter.refId); }
  if (filter.palletId) { where.push("m.pallet_id = ?"); params.push(filter.palletId); }
  if (filter.locationId) {
    where.push("(m.from_location_id = ? OR m.to_location_id = ?)");
    params.push(filter.locationId, filter.locationId);
  }
  if (filter.search) {
    where.push("(m.id LIKE ? OR m.ref_id LIKE ? OR p.sku LIKE ? OR m.pallet_id LIKE ?)");
    const q = `%${filter.search}%`;
    params.push(q, q, q, q);
  }
  return await all<MovementRow>(
    `SELECT m.*, p.sku, p.description, lt.code AS lot_code,
            fl.code AS from_code, tl.code AS to_code, o.name AS operator_name
       FROM inventory_movements m
       JOIN products p ON p.id = m.product_id
       LEFT JOIN lots lt ON lt.id = m.lot_id
       LEFT JOIN locations fl ON fl.id = m.from_location_id
       LEFT JOIN locations tl ON tl.id = m.to_location_id
       LEFT JOIN operators o ON o.id = m.operator_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY m.occurred_at DESC, m.id DESC
      LIMIT ? OFFSET ?`,
    ...params, filter.limit ?? 100, filter.offset ?? 0,
  );
}

export async function countMovements(): Promise<number> {
  return await scalar<number>(`SELECT COUNT(*) FROM inventory_movements`) ?? 0;
}
