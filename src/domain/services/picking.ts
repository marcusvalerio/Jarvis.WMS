import { all, one, run, insert, scalar, tx } from "@/lib/db";
import { nextId, PREFIX, normalizeLocationInput } from "@/lib/ids";
import { nowIso, round3, minutesBetween } from "@/lib/format";
import { audit } from "./audit";
import { consumeReservation, StockError } from "./inventory";
import { shippingLocation } from "./warehouse";
import { openIncident } from "./incidents";
import { setOrderStatus } from "./orders";
import {
  assertTransition, PICKING_TRANSITIONS, type PickingStatus,
} from "@/domain/states";

export class PickingError extends Error {
  readonly code: string;
  constructor(message: string, code = "PICKING_ERROR") {
    super(message);
    this.name = "PickingError";
    this.code = code;
  }
}

// ------------------------------------------------------------------ geracao
/**
 * Gera a picklist a partir das RESERVAS ativas do pedido.
 * A sequencia segue a rota fisica do armazem (pick_sequence do endereco),
 * minimizando o deslocamento do operador.
 */
export async function generatePicklist(orderId: string, actor: string): Promise<string> {
  return await tx(async () => {
    const at = nowIso();
    const order = await one<any>(`SELECT * FROM sales_orders WHERE id = ?`, orderId);
    if (!order) throw new PickingError("Pedido inexistente", "NOT_FOUND");

    const existing = await one<any>(
      `SELECT * FROM picking_orders WHERE sales_order_id = ? AND status IN ('PENDING','IN_PROGRESS')`,
      orderId,
    );
    if (existing) return existing.id;

    const reservations = await all<any>(
      `SELECT r.*, l.pick_sequence, l.code AS location_code
         FROM stock_reservations r
         JOIN locations l ON l.id = r.location_id
        WHERE r.sales_order_id = ? AND r.status = 'ACTIVE'
        ORDER BY l.pick_sequence, r.id`,
      orderId,
    );
    if (reservations.length === 0) {
      throw new PickingError(
        "Pedido sem reservas ativas. Libere o pedido (reserva) antes de gerar a picklist.",
        "NO_RESERVATIONS",
      );
    }

    const pickId = await nextId(PREFIX.PICKING_ORDER);
    const totalUnits = round3(reservations.reduce((s, r) => s + (r.quantity - r.picked_qty), 0));
    await insert("picking_orders", {
      id: pickId, sales_order_id: orderId, status: "PENDING", strategy: "FEFO",
      priority: order.priority, total_lines: reservations.length, done_lines: 0,
      total_units: totalUnits, picked_units: 0, created_at: at,
    });

    for (const [idx, r] of reservations.entries()) {
      await insert("picking_items", {
        id: await nextId(PREFIX.PICKING_ITEM),
        picking_order_id: pickId,
        sequence: idx + 1,
        reservation_id: r.id,
        sales_order_item_id: r.sales_order_item_id,
        product_id: r.product_id,
        lot_id: r.lot_id,
        location_id: r.location_id,
        pallet_id: r.pallet_id,
        expected_qty: round3(r.quantity - r.picked_qty),
        picked_qty: 0,
        status: "PENDING",
      });
    }

    if (order.status === "PENDING") await setOrderStatus(orderId, "PICKING", actor);

    await audit({
      actor, action: "CREATE", entity: "picking_order", entityId: pickId,
      after: { order: orderId, lines: reservations.length, units: totalUnits },
      detail: `Picklist ${pickId} gerada para ${orderId} (${reservations.length} linhas)`,
      occurredAt: at,
    });
    return pickId;
  });
}

// ------------------------------------------------------------------ consultas
export async function listPicking(filter: { status?: string; search?: string } = {}) {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.status) { where.push("pk.status = ?"); params.push(filter.status); }
  if (filter.search) {
    where.push("(pk.id LIKE ? OR pk.sales_order_id LIKE ? OR c.name LIKE ?)");
    const q = `%${filter.search}%`;
    params.push(q, q, q);
  }
  return await all<any>(
    `SELECT pk.*, so.priority AS order_priority, so.due_at, c.name AS customer_name,
            o.name AS operator_name
       FROM picking_orders pk
       JOIN sales_orders so ON so.id = pk.sales_order_id
       JOIN customers c ON c.id = so.customer_id
       LEFT JOIN operators o ON o.id = pk.operator_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY
        CASE pk.status WHEN 'IN_PROGRESS' THEN 0 WHEN 'PENDING' THEN 1 WHEN 'DIVERGENCE' THEN 2 ELSE 3 END,
        CASE pk.priority WHEN 'URGENTE' THEN 0 WHEN 'ALTA' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
        pk.created_at`,
    ...params,
  );
}

export async function getPicking(id: string) {
  const picking = await one<any>(
    `SELECT pk.*, so.priority AS order_priority, so.due_at, so.status AS order_status,
            c.name AS customer_name, c.city AS customer_city, o.name AS operator_name
       FROM picking_orders pk
       JOIN sales_orders so ON so.id = pk.sales_order_id
       JOIN customers c ON c.id = so.customer_id
       LEFT JOIN operators o ON o.id = pk.operator_id
      WHERE pk.id = ?`,
    id,
  );
  if (!picking) return null;
  const items = await pickingItems(id);
  return { picking, items };
}

export async function pickingItems(pickingId: string) {
  return await all<any>(
    `SELECT pi.*, p.sku, p.description, p.unit, l.code AS location_code,
            z.name AS zone_name, lt.code AS lot_code, lt.expires_at
       FROM picking_items pi
       JOIN products p ON p.id = pi.product_id
       JOIN locations l ON l.id = pi.location_id
       JOIN zones z ON z.id = l.zone_id
       LEFT JOIN lots lt ON lt.id = pi.lot_id
      WHERE pi.picking_order_id = ? ORDER BY pi.sequence`,
    pickingId,
  );
}

/** Proxima linha a executar (a coletora sempre trabalha na sequencia). */
export async function currentItem(pickingId: string) {
  return await one<any>(
    `SELECT pi.*, p.sku, p.description, p.unit, l.code AS location_code,
            z.name AS zone_name, lt.code AS lot_code, lt.expires_at
       FROM picking_items pi
       JOIN products p ON p.id = pi.product_id
       JOIN locations l ON l.id = pi.location_id
       JOIN zones z ON z.id = l.zone_id
       LEFT JOIN lots lt ON lt.id = pi.lot_id
      WHERE pi.picking_order_id = ?
        AND pi.status IN ('PENDING','LOCATION_SCANNED','PRODUCT_SCANNED')
      ORDER BY pi.sequence LIMIT 1`,
    pickingId,
  );
}

// ------------------------------------------------------------------ execucao
export async function startPicking(pickingId: string, operatorId: string, equipmentId?: string) {
  return await tx(async () => {
    const at = nowIso();
    const pk = await one<any>(`SELECT * FROM picking_orders WHERE id = ?`, pickingId);
    if (!pk) throw new PickingError("Picklist inexistente", "NOT_FOUND");
    if (pk.status === "IN_PROGRESS") return pk;
    assertTransition("picking_order", PICKING_TRANSITIONS, pk.status as PickingStatus, "IN_PROGRESS");
    await run(
      `UPDATE picking_orders SET status = 'IN_PROGRESS', operator_id = ?, equipment_id = ?,
              started_at = COALESCE(started_at, ?) WHERE id = ?`,
      operatorId, equipmentId ?? null, at, pickingId,
    );
    // Marca o inicio da primeira linha para medir o tempo de localizacao.
    const first = await currentItem(pickingId);
    if (first && !first.started_at) {
      await run(`UPDATE picking_items SET started_at = ? WHERE id = ?`, at, first.id);
    }
    if (equipmentId) {
      await run(`UPDATE equipment SET status = 'IN_USE', assigned_to = ?, last_event_at = ? WHERE id = ?`,
        operatorId, at, equipmentId);
    }
    await audit({
      actor: operatorId, action: "PICK", entity: "picking_order", entityId: pickingId,
      before: { status: pk.status }, after: { status: "IN_PROGRESS", operator: operatorId },
      detail: `Picking ${pickingId} iniciado`,
    });
    return await one<any>(`SELECT * FROM picking_orders WHERE id = ?`, pickingId);
  });
}

export interface ScanOutcome {
  ok: boolean;
  code: string;
  message: string;
  item?: any;
  nextStep?: "SCAN_LOCATION" | "SCAN_PRODUCT" | "CONFIRM_QTY" | "DONE";
}

/**
 * BIP do endereco. Rejeita qualquer endereco diferente do da linha atual —
 * esta e a validacao que impede separar do lugar errado.
 */
export async function scanLocation(params: {
  pickingId: string; rawCode: string; operatorId: string;
}): Promise<ScanOutcome> {
  return await tx(async () => {
    const at = nowIso();
    const item = await currentItem(params.pickingId);
    if (!item) {
      return { ok: false, code: "NO_PENDING", message: "Nao ha linha pendente nesta picklist.", nextStep: "DONE" };
    }
    if (item.status !== "PENDING") {
      return {
        ok: true, code: "ALREADY", item,
        message: `Endereco ${item.location_code} ja confirmado.`,
        nextStep: item.status === "LOCATION_SCANNED" ? "SCAN_PRODUCT" : "CONFIRM_QTY",
      };
    }

    const normalized = normalizeLocationInput(params.rawCode);
    if (!normalized) {
      return {
        ok: false, code: "INVALID_CODE",
        message: `"${params.rawCode}" nao e um endereco valido.`,
        item, nextStep: "SCAN_LOCATION",
      };
    }
    if (normalized !== item.location_id) {
      const read = await one<any>(`SELECT code FROM locations WHERE id = ?`, normalized);
      await audit({
        actor: params.operatorId, action: "SCAN", entity: "picking_item", entityId: item.id,
        after: { expected: item.location_id, read: normalized, result: "REJECTED" },
        origin: "RF",
        detail: `ENDERECO INCORRETO: esperado ${item.location_code}, lido ${read?.code ?? normalized}`,
      });
      return {
        ok: false, code: "WRONG_LOCATION", item,
        message: `ENDERECO INCORRETO. Esperado ${item.location_code}, lido ${read?.code ?? normalized}.`,
        nextStep: "SCAN_LOCATION",
      };
    }

    await run(
      `UPDATE picking_items SET status = 'LOCATION_SCANNED', location_scanned_at = ?,
              started_at = COALESCE(started_at, ?), operator_id = ? WHERE id = ?`,
      at, at, params.operatorId, item.id,
    );
    await audit({
      actor: params.operatorId, action: "SCAN", entity: "picking_item", entityId: item.id,
      after: { location: normalized, result: "OK" }, origin: "RF",
      detail: `Endereco ${item.location_code} confirmado`,
    });
    return {
      ok: true, code: "OK", item: { ...item, status: "LOCATION_SCANNED" },
      message: `Endereco ${item.location_code} confirmado. Bipe o produto.`,
      nextStep: "SCAN_PRODUCT",
    };
  });
}

/** BIP do produto. Rejeita SKU diferente do da linha atual. */
export async function scanProduct(params: {
  pickingId: string; rawCode: string; operatorId: string;
}): Promise<ScanOutcome> {
  return await tx(async () => {
    const at = nowIso();
    const item = await currentItem(params.pickingId);
    if (!item) {
      return { ok: false, code: "NO_PENDING", message: "Nao ha linha pendente.", nextStep: "DONE" };
    }
    if (item.status === "PENDING") {
      return {
        ok: false, code: "OUT_OF_SEQUENCE", item,
        message: `Bipe primeiro o endereco ${item.location_code}.`,
        nextStep: "SCAN_LOCATION",
      };
    }
    if (item.status === "PRODUCT_SCANNED") {
      return {
        ok: true, code: "ALREADY", item,
        message: "Produto ja confirmado. Informe a quantidade.", nextStep: "CONFIRM_QTY",
      };
    }

    const code = params.rawCode.trim().toUpperCase();
    const bc = await one<any>(
      `SELECT pb.*, p.sku FROM product_barcodes pb JOIN products p ON p.id = pb.product_id
        WHERE pb.code = ?`,
      code,
    );
    const direct = await one<any>(`SELECT id, sku FROM products WHERE id = ? OR sku = ?`, code, code);
    const productId = bc?.product_id ?? direct?.id;

    if (!productId) {
      return {
        ok: false, code: "UNKNOWN_PRODUCT", item,
        message: `Codigo "${params.rawCode}" nao corresponde a nenhum produto.`,
        nextStep: "SCAN_PRODUCT",
      };
    }
    if (productId !== item.product_id) {
      const read = await one<any>(`SELECT sku FROM products WHERE id = ?`, productId);
      await audit({
        actor: params.operatorId, action: "SCAN", entity: "picking_item", entityId: item.id,
        after: { expected: item.product_id, read: productId, result: "REJECTED" }, origin: "RF",
        detail: `PRODUTO INCORRETO: esperado ${item.sku}, lido ${read?.sku ?? productId}`,
      });
      return {
        ok: false, code: "WRONG_PRODUCT", item,
        message: `PRODUTO INCORRETO. Esperado ${item.sku}, lido ${read?.sku ?? productId}.`,
        nextStep: "SCAN_PRODUCT",
      };
    }

    await run(
      `UPDATE picking_items SET status = 'PRODUCT_SCANNED', product_scanned_at = ? WHERE id = ?`,
      at, item.id,
    );
    await audit({
      actor: params.operatorId, action: "SCAN", entity: "picking_item", entityId: item.id,
      after: { product: productId, result: "OK" }, origin: "RF",
      detail: `Produto ${item.sku} confirmado em ${item.location_code}`,
    });
    return {
      ok: true, code: "OK", item: { ...item, status: "PRODUCT_SCANNED" },
      message: `Produto ${item.sku} confirmado. Informe a quantidade (esperado ${item.expected_qty}).`,
      nextStep: "CONFIRM_QTY",
    };
  });
}

/** Confirma a quantidade coletada e baixa o estoque pela reserva. */
export async function confirmPick(params: {
  pickingId: string; quantity: number; operatorId: string;
  origin?: "WEB" | "RF"; divergenceReason?: string;
}): Promise<ScanOutcome> {
  return await tx(async () => {
    const at = nowIso();
    const item = await currentItem(params.pickingId);
    if (!item) {
      return { ok: false, code: "NO_PENDING", message: "Nao ha linha pendente.", nextStep: "DONE" };
    }
    if (item.status !== "PRODUCT_SCANNED") {
      return {
        ok: false, code: "OUT_OF_SEQUENCE", item,
        message: item.status === "PENDING"
          ? `Bipe o endereco ${item.location_code}.`
          : "Bipe o produto antes de confirmar a quantidade.",
        nextStep: item.status === "PENDING" ? "SCAN_LOCATION" : "SCAN_PRODUCT",
      };
    }

    const qty = round3(params.quantity);
    if (qty < 0) {
      return { ok: false, code: "BAD_QTY", item, message: "Quantidade invalida.", nextStep: "CONFIRM_QTY" };
    }
    if (qty > item.expected_qty + 0.0001) {
      return {
        ok: false, code: "OVER_QTY", item,
        message: `QUANTIDADE EXCEDENTE. Maximo permitido: ${item.expected_qty}.`,
        nextStep: "CONFIRM_QTY",
      };
    }

    if (qty > 0) {
      await consumeReservation({
        reservationId: item.reservation_id,
        quantity: qty,
        toLocationId: shippingLocation(),
        operatorId: params.operatorId,
        refKind: "PICKING",
        refId: params.pickingId,
        occurredAt: at,
        origin: params.origin ?? "RF",
      });
    }

    const divergence = round3(qty - item.expected_qty);
    const status = divergence === 0 ? "COMPLETED" : "DIVERGENCE";
    await run(
      `UPDATE picking_items SET picked_qty = ?, status = ?, completed_at = ?,
              operator_id = ?, divergence_reason = ? WHERE id = ?`,
      qty, status, at, params.operatorId,
      divergence === 0 ? null : (params.divergenceReason ?? "Quantidade divergente na coleta"),
      item.id,
    );
    await run(
      `UPDATE sales_order_items SET picked_qty = picked_qty + ? WHERE id = ?`,
      qty, item.sales_order_item_id,
    );

    if (divergence !== 0) {
      await openIncident({
        kind: "PICKING_ERROR",
        severity: Math.abs(divergence) / Math.max(1, item.expected_qty) > 0.2 ? "ALTA" : "MEDIA",
        refKind: "PICKING", refId: params.pickingId,
        productId: item.product_id, locationId: item.location_id, quantity: divergence,
        description: `${item.sku} em ${item.location_code}: esperado ${item.expected_qty}, coletado ${qty}`,
        operatorId: params.operatorId,
      });
    }

    const totals = await one<any>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status IN ('COMPLETED','DIVERGENCE','SKIPPED') THEN 1 ELSE 0 END) AS done,
              COALESCE(SUM(picked_qty),0) AS picked
         FROM picking_items WHERE picking_order_id = ?`,
      params.pickingId,
    );
    await run(
      `UPDATE picking_orders SET done_lines = ?, picked_units = ? WHERE id = ?`,
      totals.done, totals.picked, params.pickingId,
    );

    await audit({
      actor: params.operatorId, action: "PICK", entity: "picking_item", entityId: item.id,
      after: { picked: qty, expected: item.expected_qty, divergence },
      origin: params.origin ?? "RF",
      detail: `Coletado ${qty}/${item.expected_qty} de ${item.sku} em ${item.location_code}`,
    });

    const next = await currentItem(params.pickingId);
    if (next && !next.started_at) {
      await run(`UPDATE picking_items SET started_at = ? WHERE id = ?`, at, next.id);
    }
    if (!next) await completePicking(params.pickingId, params.operatorId);

    return {
      ok: true, code: divergence === 0 ? "OK" : "DIVERGENCE",
      item: { ...item, picked_qty: qty, status },
      message: divergence === 0
        ? `Coleta confirmada: ${qty} ${item.unit} de ${item.sku}.`
        : `Coleta com divergencia (${divergence > 0 ? "+" : ""}${divergence}). Ocorrencia registrada.`,
      nextStep: next ? "SCAN_LOCATION" : "DONE",
    };
  });
}

/** Pula a linha (produto nao localizado) — gera ocorrencia e divergencia. */
export async function skipItem(params: {
  pickingId: string; reason: string; operatorId: string;
}): Promise<ScanOutcome> {
  return await tx(async () => {
    const at = nowIso();
    const item = await currentItem(params.pickingId);
    if (!item) return { ok: false, code: "NO_PENDING", message: "Nao ha linha pendente.", nextStep: "DONE" };
    await run(
      `UPDATE picking_items SET status = 'SKIPPED', completed_at = ?, operator_id = ?,
              divergence_reason = ? WHERE id = ?`,
      at, params.operatorId, params.reason, item.id,
    );
    await openIncident({
      kind: "PRODUCT_NOT_FOUND", severity: "ALTA",
      refKind: "PICKING", refId: params.pickingId,
      productId: item.product_id, locationId: item.location_id, quantity: item.expected_qty,
      description: `${item.sku} nao localizado em ${item.location_code}: ${params.reason}`,
      operatorId: params.operatorId,
    });
    const totals = await one<any>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status IN ('COMPLETED','DIVERGENCE','SKIPPED') THEN 1 ELSE 0 END) AS done
         FROM picking_items WHERE picking_order_id = ?`,
      params.pickingId,
    );
    await run(`UPDATE picking_orders SET done_lines = ? WHERE id = ?`, totals.done, params.pickingId);
    await audit({
      actor: params.operatorId, action: "PICK", entity: "picking_item", entityId: item.id,
      after: { status: "SKIPPED", reason: params.reason }, origin: "RF",
      detail: `Linha pulada: ${item.sku} em ${item.location_code}`,
    });
    const next = await currentItem(params.pickingId);
    if (!next) await completePicking(params.pickingId, params.operatorId);
    return {
      ok: true, code: "SKIPPED", item,
      message: `Linha pulada. Ocorrencia aberta para ${item.sku}.`,
      nextStep: next ? "SCAN_LOCATION" : "DONE",
    };
  });
}

export async function completePicking(pickingId: string, operatorId: string) {
  const at = nowIso();
  const pk = await one<any>(`SELECT * FROM picking_orders WHERE id = ?`, pickingId);
  if (!pk || pk.status === "COMPLETED") return;
  const divs = await scalar<number>(
    `SELECT COUNT(*) FROM picking_items WHERE picking_order_id = ? AND status IN ('DIVERGENCE','SKIPPED')`,
    pickingId,
  ) ?? 0;
  const status: PickingStatus = divs > 0 ? "DIVERGENCE" : "COMPLETED";
  await run(
    `UPDATE picking_orders SET status = ?, completed_at = ? WHERE id = ?`,
    status, at, pickingId,
  );
  if (pk.equipment_id) {
    await run(`UPDATE equipment SET status = 'AVAILABLE', assigned_to = NULL, last_event_at = ? WHERE id = ?`,
      at, pk.equipment_id);
  }
  await audit({
    actor: operatorId, action: "PICK", entity: "picking_order", entityId: pickingId,
    before: { status: pk.status }, after: { status, divergences: divs },
    detail: `Picking ${pickingId} finalizado com ${divs} divergencia(s)`,
  });
}

// ------------------------------------------------------------------ metricas
export interface PickingMetrics {
  /** Minutos medios entre o inicio da linha e a confirmacao do endereco. */
  avgLocateMinutes: number | null;
  /** Minutos medios para concluir uma linha. */
  avgLineMinutes: number | null;
  /** Linhas por hora. */
  linesPerHour: number | null;
  /** Unidades por hora. */
  unitsPerHour: number | null;
  lines: number;
  units: number;
  divergences: number;
}

export async function pickingMetrics(pickingId?: string): Promise<PickingMetrics> {
  const where = pickingId ? `WHERE pi.picking_order_id = ?` : "";
  const params = pickingId ? [pickingId] : [];
  const items = await all<any>(
    `SELECT pi.* FROM picking_items pi ${where}`, ...params,
  );
  const done = items.filter((i) => i.completed_at && i.started_at);
  const locate = items
    .filter((i) => i.started_at && i.location_scanned_at)
    .map((i) => minutesBetween(i.started_at, i.location_scanned_at) ?? 0);
  const line = done.map((i) => minutesBetween(i.started_at, i.completed_at) ?? 0);
  const units = round3(items.reduce((s, i) => s + i.picked_qty, 0));
  const totalMinutes = line.reduce((a, b) => a + b, 0);

  return {
    avgLocateMinutes: locate.length ? locate.reduce((a, b) => a + b, 0) / locate.length : null,
    avgLineMinutes: line.length ? totalMinutes / line.length : null,
    linesPerHour: totalMinutes > 0 ? (done.length / totalMinutes) * 60 : null,
    unitsPerHour: totalMinutes > 0 ? (units / totalMinutes) * 60 : null,
    lines: items.length,
    units,
    divergences: items.filter((i) => i.status === "DIVERGENCE" || i.status === "SKIPPED").length,
  };
}
