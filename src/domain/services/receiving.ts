import { all, one, run, insert, update, scalar, tx } from "@/lib/db";
import { nextId, PREFIX } from "@/lib/ids";
import { nowIso, round3, minutesBetween } from "@/lib/format";
import { audit } from "./audit";
import { applyMovement, movePallet, StockError } from "./inventory";
import { suggestLocation, receivingLocation, setDock, getLocation } from "./warehouse";
import { openIncident } from "./incidents";
import {
  assertTransition, INBOUND_TRANSITIONS, type InboundStatus,
} from "@/domain/states";

export class ReceivingError extends Error {
  readonly code: string;
  constructor(message: string, code = "RECEIVING_ERROR") {
    super(message);
    this.name = "ReceivingError";
    this.code = code;
  }
}

// ------------------------------------------------------------------ consultas
export function listInbound(filter: { status?: string; search?: string } = {}) {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.status) { where.push("io.status = ?"); params.push(filter.status); }
  if (filter.search) {
    where.push("(io.id LIKE ? OR s.name LIKE ? OR io.vehicle_plate LIKE ? OR io.invoice_id LIKE ?)");
    const q = `%${filter.search}%`;
    params.push(q, q, q, q);
  }
  return all<any>(
    `SELECT io.*, s.name AS supplier_name, s.trade_name AS supplier_trade,
            d.name AS dock_name, o.name AS operator_name,
            inv.number AS invoice_number, inv.series AS invoice_series,
            (SELECT COUNT(*) FROM inbound_order_items ii WHERE ii.inbound_order_id = io.id) AS line_count,
            (SELECT COALESCE(SUM(expected_qty),0) FROM inbound_order_items ii WHERE ii.inbound_order_id = io.id) AS expected_qty,
            (SELECT COALESCE(SUM(checked_qty),0) FROM inbound_order_items ii WHERE ii.inbound_order_id = io.id) AS checked_qty
       FROM inbound_orders io
       JOIN suppliers s ON s.id = io.supplier_id
       LEFT JOIN docks d ON d.id = io.dock_id
       LEFT JOIN operators o ON o.id = io.operator_id
       LEFT JOIN invoices inv ON inv.id = io.invoice_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY io.scheduled_at ASC`,
    ...params,
  );
}

export function getInbound(id: string) {
  const order = one<any>(
    `SELECT io.*, s.name AS supplier_name, s.cnpj AS supplier_cnpj, s.city AS supplier_city,
            s.state AS supplier_state, d.name AS dock_name, o.name AS operator_name
       FROM inbound_orders io
       JOIN suppliers s ON s.id = io.supplier_id
       LEFT JOIN docks d ON d.id = io.dock_id
       LEFT JOIN operators o ON o.id = io.operator_id
      WHERE io.id = ?`,
    id,
  );
  if (!order) return null;

  const items = all<any>(
    `SELECT ii.*, p.sku, p.description, p.unit AS product_unit, p.unit_gross_kg
       FROM inbound_order_items ii
       JOIN products p ON p.id = ii.product_id
      WHERE ii.inbound_order_id = ? ORDER BY ii.line_no`,
    id,
  );
  const invoice = order.invoice_id
    ? one<any>(`SELECT * FROM invoices WHERE id = ?`, order.invoice_id)
    : null;
  const weighings = all<any>(
    `SELECT w.*, o.name AS operator_name, e.model AS equipment_model
       FROM weighings w
       LEFT JOIN operators o ON o.id = w.operator_id
       LEFT JOIN equipment e ON e.id = w.equipment_id
      WHERE w.ref_kind = 'INBOUND_ORDER' AND w.ref_id = ?
      ORDER BY w.weighed_at`,
    id,
  );
  const check = one<any>(
    `SELECT * FROM receiving_checks WHERE inbound_order_id = ? ORDER BY started_at DESC LIMIT 1`,
    id,
  );
  const checkItems = check
    ? all<any>(
        `SELECT ci.*, p.sku, p.description FROM receiving_check_items ci
           JOIN products p ON p.id = ci.product_id
          WHERE ci.check_id = ? ORDER BY ci.id`,
        check.id,
      )
    : [];
  const pallets = all<any>(
    `SELECT pl.*, l.code AS location_code,
            (SELECT COUNT(*) FROM pallet_items pi WHERE pi.pallet_id = pl.id) AS line_count
       FROM pallets pl
       LEFT JOIN locations l ON l.id = pl.location_id
      WHERE pl.origin_ref = ? ORDER BY pl.id`,
    id,
  );
  const storageOrders = all<any>(
    `SELECT so.*, sl.code AS suggested_code, fl.code AS final_code, o.name AS operator_name
       FROM storage_orders so
       LEFT JOIN locations sl ON sl.id = so.suggested_location_id
       LEFT JOIN locations fl ON fl.id = so.final_location_id
       LEFT JOIN operators o ON o.id = so.operator_id
      WHERE so.inbound_order_id = ? ORDER BY so.id`,
    id,
  );
  const incidents = all<any>(
    `SELECT * FROM incidents WHERE ref_kind = 'INBOUND_ORDER' AND ref_id = ? ORDER BY opened_at DESC`,
    id,
  );

  return { order, items, invoice, weighings, check, checkItems, pallets, storageOrders, incidents };
}

// ------------------------------------------------------------------ estados
function setStatus(id: string, to: InboundStatus, actor: string, extra: Record<string, any> = {}) {
  const cur = one<{ status: InboundStatus }>(`SELECT status FROM inbound_orders WHERE id = ?`, id);
  if (!cur) throw new ReceivingError(`Ordem de recebimento ${id} inexistente`, "NOT_FOUND");
  assertTransition("inbound_order", INBOUND_TRANSITIONS, cur.status, to);
  update("inbound_orders", id, { status: to, ...extra });
  const action =
    to === "APPROVED" ? "APPROVE"
    : to === "RECEIVING" || to === "COMPLETED" ? "RECEIVE"
    : "UPDATE";
  audit({
    actor, action,
    entity: "inbound_order", entityId: id,
    before: { status: cur.status }, after: { status: to, ...extra },
    detail: `Recebimento ${id}: ${cur.status} -> ${to}`,
  });
}

export function registerArrival(params: {
  inboundId: string; dockId?: string; vehiclePlate?: string;
  driverName?: string; driverDoc?: string; operatorId: string;
}) {
  return tx(() => {
    const at = nowIso();
    setStatus(params.inboundId, "ARRIVING", params.operatorId, {
      arrived_at: at,
      dock_id: params.dockId,
      vehicle_plate: params.vehiclePlate,
      driver_name: params.driverName,
      driver_doc: params.driverDoc,
      operator_id: params.operatorId,
    });
    if (params.dockId) setDock(params.dockId, "OCCUPIED", params.inboundId);
    return at;
  });
}

export function startReceiving(inboundId: string, operatorId: string) {
  return tx(() => {
    const at = nowIso();
    setStatus(inboundId, "RECEIVING", operatorId, { started_at: at, operator_id: operatorId });
    return at;
  });
}

// ------------------------------------------------------------------ pesagem
export function registerWeighing(params: {
  refKind: "INBOUND_ORDER" | "PALLET" | "VOLUME" | "SHIPMENT";
  refId: string;
  grossKg: number;
  tareKg: number;
  expectedKg?: number | null;
  equipmentId?: string;
  operatorId: string;
  notes?: string;
}): string {
  return tx(() => {
    const at = nowIso();
    const net = round3(params.grossKg - params.tareKg);
    if (net < 0) throw new ReceivingError("Tara maior que o peso bruto", "BAD_TARE");
    const divergence = params.expectedKg ? round3(net - params.expectedKg) : 0;
    const id = nextId(PREFIX.WEIGHING);
    insert("weighings", {
      id, ref_kind: params.refKind, ref_id: params.refId,
      gross_kg: round3(params.grossKg), tare_kg: round3(params.tareKg), net_kg: net,
      expected_kg: params.expectedKg ?? null, divergence_kg: divergence,
      equipment_id: params.equipmentId ?? null, operator_id: params.operatorId,
      weighed_at: at, notes: params.notes ?? null,
    });

    if (params.refKind === "PALLET") {
      run(
        `UPDATE pallets SET gross_weight_kg = ?, net_weight_kg = ?, tare_kg = ? WHERE id = ?`,
        round3(params.grossKg), net, round3(params.tareKg), params.refId,
      );
    }

    audit({
      actor: params.operatorId, action: "WEIGH", entity: "weighing", entityId: id,
      after: { gross: params.grossKg, tare: params.tareKg, net, divergence },
      detail: `Pesagem de ${params.refId}: liquido ${net} kg`,
    });

    // Tolerancia de 2% sobre o peso previsto gera ocorrencia.
    if (params.expectedKg && Math.abs(divergence) > params.expectedKg * 0.02) {
      openIncident({
        kind: "WEIGHT_DIVERGENCE",
        severity: Math.abs(divergence) > params.expectedKg * 0.05 ? "ALTA" : "MEDIA",
        refKind: params.refKind, refId: params.refId,
        description: `Divergencia de pesagem: previsto ${params.expectedKg} kg, aferido ${net} kg (${divergence > 0 ? "+" : ""}${divergence} kg)`,
        operatorId: params.operatorId,
      });
    }
    return id;
  });
}

export function listWeighings(refKind?: string, refId?: string) {
  const where: string[] = [];
  const params: any[] = [];
  if (refKind) { where.push("w.ref_kind = ?"); params.push(refKind); }
  if (refId) { where.push("w.ref_id = ?"); params.push(refId); }
  return all<any>(
    `SELECT w.*, o.name AS operator_name, e.model AS equipment_model
       FROM weighings w
       LEFT JOIN operators o ON o.id = w.operator_id
       LEFT JOIN equipment e ON e.id = w.equipment_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY w.weighed_at DESC`,
    ...params,
  );
}

export function getWeighing(id: string) {
  return one<any>(
    `SELECT w.*, o.name AS operator_name, e.model AS equipment_model, e.kind AS equipment_kind
       FROM weighings w
       LEFT JOIN operators o ON o.id = w.operator_id
       LEFT JOIN equipment e ON e.id = w.equipment_id
      WHERE w.id = ?`,
    id,
  );
}

// ------------------------------------------------------------------ conferencia
export function startCheck(inboundId: string, operatorId: string): string {
  return tx(() => {
    const at = nowIso();
    const existing = one<any>(
      `SELECT * FROM receiving_checks WHERE inbound_order_id = ? AND status = 'IN_PROGRESS'`,
      inboundId,
    );
    if (existing) return existing.id;

    const items = all<any>(
      `SELECT * FROM inbound_order_items WHERE inbound_order_id = ? ORDER BY line_no`,
      inboundId,
    );
    if (items.length === 0) throw new ReceivingError("Recebimento sem itens", "NO_ITEMS");

    const id = nextId(PREFIX.RECEIVING_CHECK);
    insert("receiving_checks", {
      id, inbound_order_id: inboundId, operator_id: operatorId,
      status: "IN_PROGRESS", started_at: at,
      total_expected: round3(items.reduce((s, i) => s + i.expected_qty, 0)),
      total_checked: 0, divergence_count: 0,
    });
    for (const it of items) {
      insert("receiving_check_items", {
        id: `${id}-L${String(it.line_no).padStart(2, "0")}`,
        check_id: id, inbound_item_id: it.id, product_id: it.product_id,
        lot_code: it.lot_code, expires_at: it.expires_at,
        expected_qty: it.expected_qty, checked_qty: 0, divergence: 0,
        status: "PENDING",
      });
    }
    const cur = one<{ status: InboundStatus }>(`SELECT status FROM inbound_orders WHERE id = ?`, inboundId);
    if (cur && cur.status === "RECEIVING") {
      setStatus(inboundId, "CHECKING", operatorId, { checked_at: at });
    }
    audit({
      actor: operatorId, action: "CHECK", entity: "receiving_check", entityId: id,
      after: { inbound: inboundId, lines: items.length },
      detail: `Conferencia iniciada para ${inboundId}`,
    });
    return id;
  });
}

export interface CheckItemResult {
  checkItemId: string;
  expected: number;
  checked: number;
  divergence: number;
  status: string;
  incidentId?: string;
}

/** Registra a contagem fisica de uma linha da conferencia. */
export function checkItem(params: {
  checkId: string;
  checkItemId: string;
  quantity: number;
  lotCode?: string;
  expiresAt?: string;
  palletId?: string;
  operatorId: string;
  origin?: "WEB" | "RF";
}): CheckItemResult {
  return tx(() => {
    const at = nowIso();
    const item = one<any>(`SELECT * FROM receiving_check_items WHERE id = ?`, params.checkItemId);
    if (!item) throw new ReceivingError("Linha de conferencia inexistente", "NOT_FOUND");
    if (item.check_id !== params.checkId) {
      throw new ReceivingError("Linha nao pertence a esta conferencia", "MISMATCH");
    }
    const checked = round3(params.quantity);
    if (checked < 0) throw new ReceivingError("Quantidade negativa", "BAD_QTY");

    const divergence = round3(checked - item.expected_qty);
    const status = divergence === 0 ? "OK" : "DIVERGENCE";

    run(
      `UPDATE receiving_check_items
          SET checked_qty = ?, divergence = ?, status = ?, checked_at = ?,
              lot_code = COALESCE(?, lot_code), expires_at = COALESCE(?, expires_at),
              pallet_id = COALESCE(?, pallet_id), operator_id = ?
        WHERE id = ?`,
      checked, divergence, status, at,
      params.lotCode ?? null, params.expiresAt ?? null, params.palletId ?? null,
      params.operatorId, params.checkItemId,
    );

    run(
      `UPDATE inbound_order_items SET checked_qty = ?, accepted_qty = ?,
              rejected_qty = ?, status = ? WHERE id = ?`,
      checked, checked, Math.max(0, -divergence), status, item.inbound_item_id,
    );

    const totals = one<any>(
      `SELECT COALESCE(SUM(checked_qty),0) AS checked,
              SUM(CASE WHEN status = 'DIVERGENCE' THEN 1 ELSE 0 END) AS divs
         FROM receiving_check_items WHERE check_id = ?`,
      params.checkId,
    );
    run(
      `UPDATE receiving_checks SET total_checked = ?, divergence_count = ? WHERE id = ?`,
      totals.checked, totals.divs, params.checkId,
    );

    let incidentId: string | undefined;
    if (divergence !== 0) {
      const product = one<any>(`SELECT sku, description FROM products WHERE id = ?`, item.product_id);
      const inbound = one<any>(`SELECT inbound_order_id FROM receiving_checks WHERE id = ?`, params.checkId);
      incidentId = openIncident({
        kind: "RECEIVING_DIVERGENCE",
        severity: Math.abs(divergence) / Math.max(1, item.expected_qty) > 0.1 ? "ALTA" : "MEDIA",
        refKind: "INBOUND_ORDER",
        refId: inbound?.inbound_order_id,
        productId: item.product_id,
        quantity: divergence,
        description:
          `${product?.sku}: esperado ${item.expected_qty}, conferido ${checked}, divergencia ${divergence > 0 ? "+" : ""}${divergence}`,
        operatorId: params.operatorId,
      });
    }

    audit({
      actor: params.operatorId, action: "CHECK", entity: "receiving_check_item",
      entityId: params.checkItemId,
      before: { checked: item.checked_qty }, after: { checked, divergence, status },
      origin: params.origin ?? "WEB",
      detail: `Conferencia ${item.product_id}: esperado ${item.expected_qty}, conferido ${checked}`,
    });

    return {
      checkItemId: params.checkItemId,
      expected: item.expected_qty,
      checked, divergence, status, incidentId,
    };
  });
}

export function finishCheck(checkId: string, operatorId: string) {
  return tx(() => {
    const at = nowIso();
    const check = one<any>(`SELECT * FROM receiving_checks WHERE id = ?`, checkId);
    if (!check) throw new ReceivingError("Conferencia inexistente", "NOT_FOUND");
    const pending = scalar<number>(
      `SELECT COUNT(*) FROM receiving_check_items WHERE check_id = ? AND status = 'PENDING'`,
      checkId,
    ) ?? 0;
    if (pending > 0) {
      throw new ReceivingError(`Ainda ha ${pending} linha(s) sem conferencia`, "PENDING_LINES");
    }
    const divs = check.divergence_count ?? 0;
    const status = divs > 0 ? "DIVERGENCE" : "OK";
    run(`UPDATE receiving_checks SET status = ?, finished_at = ? WHERE id = ?`, status, at, checkId);

    const cur = one<{ status: InboundStatus }>(
      `SELECT status FROM inbound_orders WHERE id = ?`, check.inbound_order_id,
    );
    if (cur) {
      setStatus(check.inbound_order_id, divs > 0 ? "DIVERGENCE" : "APPROVED", operatorId, {
        checked_at: at,
      });
    }
    audit({
      actor: operatorId, action: "CHECK", entity: "receiving_check", entityId: checkId,
      after: { status, divergences: divs },
      detail: `Conferencia encerrada com ${divs} divergencia(s)`,
    });
    return { status, divergences: divs };
  });
}

/** Aprova um recebimento que ficou em DIVERGENCE apos tratamento. */
export function approveWithDivergence(inboundId: string, operatorId: string, reason: string) {
  return tx(() => {
    setStatus(inboundId, "APPROVED", operatorId);
    audit({
      actor: operatorId, action: "APPROVE", entity: "inbound_order", entityId: inboundId,
      after: { reason }, detail: `Divergencia tratada: ${reason}`,
    });
  });
}

// ------------------------------------------------------------------ paletizacao
export interface PalletLine {
  productId: string;
  lotCode?: string | null;
  expiresAt?: string | null;
  quantity: number;
}

/**
 * Cria um palete a partir das linhas conferidas e da ENTRADA fisica no
 * estoque (movimento RECEIPT no endereco de recebimento).
 */
export function createPallet(params: {
  lines: PalletLine[];
  originKind: "RECEIVING" | "INITIAL_STOCK" | "REPACK";
  originRef?: string;
  operatorId: string;
  tareKg?: number;
  locationId?: string;
  occurredAt?: string;
  skipReceipt?: boolean;
}): string {
  const at = params.occurredAt ?? nowIso();
  const palletId = nextId(PREFIX.PALLET);
  const location = params.locationId ?? receivingLocation();
  if (params.lines.length === 0) throw new ReceivingError("Palete sem itens", "EMPTY");

  insert("pallets", {
    id: palletId,
    kind: "PBR",
    status: params.originKind === "INITIAL_STOCK" ? "STORED" : "AWAITING_PUTAWAY",
    location_id: location,
    origin_kind: params.originKind,
    origin_ref: params.originRef ?? null,
    tare_kg: params.tareKg ?? 25,
    gross_weight_kg: 0,
    net_weight_kg: 0,
    created_at: at,
    created_by: params.operatorId,
  });

  let net = 0;
  for (const line of params.lines) {
    const lotId = line.lotCode
      ? ensureLot(line.productId, line.lotCode, line.expiresAt ?? null, at)
      : null;
    insert("pallet_items", {
      id: `${palletId}-${line.productId}-${lotId ?? "NL"}`,
      pallet_id: palletId, product_id: line.productId, lot_id: lotId,
      quantity: round3(line.quantity),
    });
    const p = one<any>(`SELECT unit_gross_kg FROM products WHERE id = ?`, line.productId);
    net += round3(line.quantity * (p?.unit_gross_kg ?? 0));

    if (!params.skipReceipt) {
      applyMovement({
        kind: "RECEIPT",
        productId: line.productId,
        lotId,
        quantity: line.quantity,
        toLocationId: location,
        palletId,
        refKind: params.originKind === "RECEIVING" ? "INBOUND_ORDER" : "SIMULATION",
        refId: params.originRef,
        reason: `Entrada por ${params.originKind === "RECEIVING" ? "recebimento" : "estoque inicial"}`,
        operatorId: params.operatorId,
        occurredAt: at,
      });
    }
  }

  run(
    `UPDATE pallets SET net_weight_kg = ?, gross_weight_kg = ? WHERE id = ?`,
    round3(net), round3(net + (params.tareKg ?? 25)), palletId,
  );

  audit({
    actor: params.operatorId, action: "CREATE", entity: "pallet", entityId: palletId,
    after: { lines: params.lines.length, origin: params.originRef, location },
    detail: `Palete ${palletId} montado com ${params.lines.length} item(ns)`,
    occurredAt: at,
  });
  return palletId;
}

export function ensureLot(
  productId: string, code: string, expiresAt: string | null, at: string, supplierId?: string,
): string {
  const found = one<{ id: string }>(
    `SELECT id FROM lots WHERE product_id = ? AND code = ?`, productId, code,
  );
  if (found) return found.id;
  const id = nextId(PREFIX.LOT);
  insert("lots", {
    id, product_id: productId, code, expires_at: expiresAt,
    supplier_id: supplierId ?? null, created_at: at,
  });
  return id;
}

export function getPallet(id: string) {
  const pallet = one<any>(
    `SELECT pl.*, l.code AS location_code, z.name AS zone_name
       FROM pallets pl
       LEFT JOIN locations l ON l.id = pl.location_id
       LEFT JOIN zones z ON z.id = l.zone_id
      WHERE pl.id = ?`,
    id,
  );
  if (!pallet) return null;
  const items = all<any>(
    `SELECT pi.*, p.sku, p.description, p.unit, lt.code AS lot_code, lt.expires_at
       FROM pallet_items pi
       JOIN products p ON p.id = pi.product_id
       LEFT JOIN lots lt ON lt.id = pi.lot_id
      WHERE pi.pallet_id = ?`,
    id,
  );
  const stock = all<any>(
    `SELECT i.*, l.code AS location_code FROM inventory i
       JOIN locations l ON l.id = i.location_id
      WHERE i.pallet_id = ? AND i.qty_on_hand > 0`,
    id,
  );
  return { pallet, items, stock };
}

export function listPallets(filter: { status?: string; search?: string } = {}) {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.status) { where.push("pl.status = ?"); params.push(filter.status); }
  if (filter.search) {
    where.push("(pl.id LIKE ? OR l.code LIKE ? OR pl.origin_ref LIKE ?)");
    const q = `%${filter.search}%`;
    params.push(q, q, q);
  }
  return all<any>(
    `SELECT pl.*, l.code AS location_code,
            (SELECT COUNT(*) FROM pallet_items pi WHERE pi.pallet_id = pl.id) AS line_count,
            (SELECT COALESCE(SUM(quantity),0) FROM pallet_items pi WHERE pi.pallet_id = pl.id) AS total_qty,
            (SELECT COALESCE(SUM(qty_on_hand),0) FROM inventory i WHERE i.pallet_id = pl.id) AS on_hand,
            (SELECT p.sku FROM pallet_items pi JOIN products p ON p.id = pi.product_id
              WHERE pi.pallet_id = pl.id LIMIT 1) AS main_sku
       FROM pallets pl
       LEFT JOIN locations l ON l.id = pl.location_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY pl.id DESC`,
    ...params,
  );
}

// ------------------------------------------------------------------ armazenagem
/** Gera uma Ordem de Armazenagem por palete aguardando put-away. */
export function generateStorageOrders(inboundId: string, operatorId: string): string[] {
  return tx(() => {
    const at = nowIso();
    const pallets = all<any>(
      `SELECT * FROM pallets WHERE origin_ref = ? AND status = 'AWAITING_PUTAWAY'`,
      inboundId,
    );
    const created: string[] = [];
    for (const p of pallets) {
      const exists = one<any>(
        `SELECT id FROM storage_orders WHERE pallet_id = ? AND status IN ('PENDING','IN_PROGRESS')`,
        p.id,
      );
      if (exists) continue;
      const item = one<any>(
        `SELECT product_id FROM pallet_items WHERE pallet_id = ? LIMIT 1`, p.id,
      );
      const suggestion = item ? suggestLocation(item.product_id, p.id) : null;
      const id = nextId(PREFIX.STORAGE_ORDER);
      insert("storage_orders", {
        id, pallet_id: p.id, inbound_order_id: inboundId,
        suggested_location_id: suggestion?.locationId ?? null,
        status: "PENDING", created_at: at,
      });
      if (suggestion) {
        run(`UPDATE locations SET status = 'RESERVED' WHERE id = ? AND status = 'AVAILABLE'`, suggestion.locationId);
      }
      created.push(id);
      audit({
        actor: operatorId, action: "CREATE", entity: "storage_order", entityId: id,
        after: { pallet: p.id, suggested: suggestion?.locationId, reason: suggestion?.reason },
        detail: `Ordem de armazenagem para ${p.id}${suggestion ? ` -> ${suggestion.code}` : ""}`,
      });
    }
    return created;
  });
}

export function listStorageOrders(filter: { status?: string } = {}) {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.status) { where.push("so.status = ?"); params.push(filter.status); }
  return all<any>(
    `SELECT so.*, sl.code AS suggested_code, fl.code AS final_code,
            pl.status AS pallet_status, o.name AS operator_name,
            (SELECT p.sku FROM pallet_items pi JOIN products p ON p.id = pi.product_id
              WHERE pi.pallet_id = so.pallet_id LIMIT 1) AS sku,
            (SELECT COALESCE(SUM(quantity),0) FROM pallet_items pi WHERE pi.pallet_id = so.pallet_id) AS qty
       FROM storage_orders so
       JOIN pallets pl ON pl.id = so.pallet_id
       LEFT JOIN locations sl ON sl.id = so.suggested_location_id
       LEFT JOIN locations fl ON fl.id = so.final_location_id
       LEFT JOIN operators o ON o.id = so.operator_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY so.created_at, so.id`,
    ...params,
  );
}

export function getStorageOrder(id: string) {
  return one<any>(
    `SELECT so.*, sl.code AS suggested_code, fl.code AS final_code
       FROM storage_orders so
       LEFT JOIN locations sl ON sl.id = so.suggested_location_id
       LEFT JOIN locations fl ON fl.id = so.final_location_id
      WHERE so.id = ?`,
    id,
  );
}

export function storageOrderForPallet(palletId: string) {
  return one<any>(
    `SELECT so.*, sl.code AS suggested_code FROM storage_orders so
       LEFT JOIN locations sl ON sl.id = so.suggested_location_id
      WHERE so.pallet_id = ? AND so.status IN ('PENDING','IN_PROGRESS')
      ORDER BY so.created_at DESC LIMIT 1`,
    palletId,
  );
}

/**
 * Executa a armazenagem: valida o endereco, move o palete inteiro e
 * encerra a ordem. Chamada tanto pelo desktop quanto pela coletora.
 */
export function executeStorage(params: {
  storageOrderId: string;
  locationId: string;
  operatorId: string;
  origin?: "WEB" | "RF";
  overrideReason?: string;
}) {
  return tx(() => {
    const at = nowIso();
    const so = one<any>(`SELECT * FROM storage_orders WHERE id = ?`, params.storageOrderId);
    if (!so) throw new ReceivingError("Ordem de armazenagem inexistente", "NOT_FOUND");
    if (so.status === "COMPLETED") {
      throw new ReceivingError("Ordem de armazenagem ja concluida", "ALREADY_DONE");
    }
    const loc = getLocation(params.locationId);
    if (!loc) throw new ReceivingError(`Endereco ${params.locationId} inexistente`, "NO_LOCATION");
    if (loc.status === "BLOCKED") {
      throw new ReceivingError(`Endereco ${loc.code} esta bloqueado`, "LOCATION_BLOCKED");
    }
    if (loc.kind !== "PALLET") {
      throw new ReceivingError(`Endereco ${loc.code} nao aceita palete`, "BAD_LOCATION_KIND");
    }
    const occupied = scalar<number>(
      `SELECT COUNT(DISTINCT pallet_id) FROM inventory
        WHERE location_id = ? AND qty_on_hand > 0 AND pallet_id IS NOT NULL AND pallet_id <> ?`,
      params.locationId, so.pallet_id,
    ) ?? 0;
    if (occupied >= loc.capacity_pallets) {
      openIncident({
        kind: "LOCATION_OCCUPIED", severity: "MEDIA",
        refKind: "STORAGE_ORDER", refId: so.id, locationId: params.locationId,
        description: `Endereco ${loc.code} ja ocupado ao tentar armazenar ${so.pallet_id}`,
        operatorId: params.operatorId,
      });
      throw new ReceivingError(`Endereco ${loc.code} ja esta ocupado`, "LOCATION_OCCUPIED");
    }

    const diverged = so.suggested_location_id && so.suggested_location_id !== params.locationId;
    if (diverged && !params.overrideReason) {
      const sug = getLocation(so.suggested_location_id);
      throw new ReceivingError(
        `Endereco divergente da sugestao (${sug?.code}). Informe a justificativa.`,
        "LOCATION_MISMATCH",
      );
    }

    movePallet({
      palletId: so.pallet_id,
      toLocationId: params.locationId,
      kind: "PUTAWAY",
      refKind: "STORAGE_ORDER",
      refId: so.id,
      reason: diverged ? `Armazenagem com desvio: ${params.overrideReason}` : "Armazenagem",
      operatorId: params.operatorId,
      occurredAt: at,
      origin: params.origin ?? "WEB",
    });

    run(
      `UPDATE storage_orders SET status = 'COMPLETED', final_location_id = ?, operator_id = ?,
              started_at = COALESCE(started_at, ?), completed_at = ?, override_reason = ?
        WHERE id = ?`,
      params.locationId, params.operatorId, at, at, params.overrideReason ?? null, so.id,
    );
    run(`UPDATE pallets SET status = 'STORED', stored_at = ? WHERE id = ?`, at, so.pallet_id);

    // Libera a reserva do endereco sugerido que nao foi usado.
    if (diverged && so.suggested_location_id) {
      run(
        `UPDATE locations SET status = 'AVAILABLE' WHERE id = ? AND status = 'RESERVED'`,
        so.suggested_location_id,
      );
    }

    audit({
      actor: params.operatorId, action: "MOVE", entity: "storage_order", entityId: so.id,
      before: { status: so.status, suggested: so.suggested_location_id },
      after: { status: "COMPLETED", final: params.locationId },
      origin: params.origin ?? "WEB",
      detail: `Palete ${so.pallet_id} armazenado em ${loc.code}`,
    });

    maybeCompleteInbound(so.inbound_order_id, params.operatorId);
    return { palletId: so.pallet_id, locationCode: loc.code };
  });
}

/** Conclui o recebimento quando todos os paletes foram armazenados. */
export function maybeCompleteInbound(inboundId: string | null, operatorId: string) {
  if (!inboundId) return false;
  const pending = scalar<number>(
    `SELECT COUNT(*) FROM storage_orders WHERE inbound_order_id = ? AND status <> 'COMPLETED'`,
    inboundId,
  ) ?? 0;
  const total = scalar<number>(
    `SELECT COUNT(*) FROM storage_orders WHERE inbound_order_id = ?`, inboundId,
  ) ?? 0;
  if (total === 0 || pending > 0) return false;

  const cur = one<{ status: InboundStatus }>(`SELECT status FROM inbound_orders WHERE id = ?`, inboundId);
  if (!cur || cur.status === "COMPLETED") return false;
  const at = nowIso();
  setStatus(inboundId, "COMPLETED", operatorId, { completed_at: at });

  // Libera a doca ocupada por este recebimento.
  const io = one<any>(`SELECT dock_id FROM inbound_orders WHERE id = ?`, inboundId);
  if (io?.dock_id) setDock(io.dock_id, "FREE", null);

  const po = one<any>(`SELECT purchase_order_id FROM inbound_orders WHERE id = ?`, inboundId);
  if (po?.purchase_order_id) {
    run(`UPDATE purchase_orders SET status = 'RECEIVED' WHERE id = ?`, po.purchase_order_id);
  }
  return true;
}

// ------------------------------------------------------------------ metricas
export function receivingCycleMinutes(inboundId: string): number | null {
  const io = one<any>(`SELECT arrived_at, completed_at, checked_at FROM inbound_orders WHERE id = ?`, inboundId);
  if (!io) return null;
  return minutesBetween(io.arrived_at, io.completed_at ?? io.checked_at);
}
