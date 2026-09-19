import { all, one, run, insert, update, scalar, tx } from "@/lib/db";
import { nextId, PREFIX } from "@/lib/ids";
import { nowIso, round3 } from "@/lib/format";
import { audit } from "./audit";
import { reserve, releaseReservations, stockOf, StockError } from "./inventory";
import {
  assertTransition, SHIPPING_TRANSITIONS, type ShippingStatus,
} from "@/domain/states";

export class OrderError extends Error {
  readonly code: string;
  constructor(message: string, code = "ORDER_ERROR") {
    super(message);
    this.name = "OrderError";
    this.code = code;
  }
}

export function listOrders(filter: { status?: string; search?: string; priority?: string } = {}) {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.status) { where.push("so.status = ?"); params.push(filter.status); }
  if (filter.priority) { where.push("so.priority = ?"); params.push(filter.priority); }
  if (filter.search) {
    where.push("(so.id LIKE ? OR c.name LIKE ? OR so.ship_to_city LIKE ?)");
    const q = `%${filter.search}%`;
    params.push(q, q, q);
  }
  return all<any>(
    `SELECT so.*, c.name AS customer_name, c.trade_name AS customer_trade, c.cnpj AS customer_cnpj,
            (SELECT COUNT(*) FROM sales_order_items si WHERE si.sales_order_id = so.id) AS line_count,
            (SELECT COALESCE(SUM(quantity),0) FROM sales_order_items si WHERE si.sales_order_id = so.id) AS total_qty,
            (SELECT COALESCE(SUM(reserved_qty),0) FROM sales_order_items si WHERE si.sales_order_id = so.id) AS total_reserved,
            (SELECT COALESCE(SUM(picked_qty),0) FROM sales_order_items si WHERE si.sales_order_id = so.id) AS total_picked,
            (SELECT COUNT(*) FROM volumes v WHERE v.sales_order_id = so.id AND v.status <> 'CANCELLED') AS volume_count,
            (SELECT pk.id FROM picking_orders pk WHERE pk.sales_order_id = so.id ORDER BY pk.created_at DESC LIMIT 1) AS picking_id,
            (SELECT pa.id FROM packing_orders pa WHERE pa.sales_order_id = so.id ORDER BY pa.created_at DESC LIMIT 1) AS packing_id,
            (SELECT mo.manifest_id FROM manifest_orders mo WHERE mo.sales_order_id = so.id LIMIT 1) AS manifest_id
       FROM sales_orders so
       JOIN customers c ON c.id = so.customer_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY
        CASE so.priority WHEN 'URGENTE' THEN 0 WHEN 'ALTA' THEN 1 WHEN 'NORMAL' THEN 2 ELSE 3 END,
        so.due_at ASC`,
    ...params,
  );
}

export function getOrder(id: string) {
  const order = one<any>(
    `SELECT so.*, c.name AS customer_name, c.trade_name AS customer_trade, c.cnpj AS customer_cnpj,
            c.address AS customer_address, c.city AS customer_city, c.state AS customer_state,
            c.zip AS customer_zip, c.phone AS customer_phone
       FROM sales_orders so JOIN customers c ON c.id = so.customer_id WHERE so.id = ?`,
    id,
  );
  if (!order) return null;

  const items = all<any>(
    `SELECT si.*, p.sku, p.description, p.unit AS product_unit, p.unit_gross_kg, p.ncm, p.cfop_out
       FROM sales_order_items si JOIN products p ON p.id = si.product_id
      WHERE si.sales_order_id = ? ORDER BY si.line_no`,
    id,
  ).map((it) => ({ ...it, stock: stockOf(it.product_id) }));

  const reservations = all<any>(
    `SELECT r.*, p.sku, l.code AS location_code, lt.code AS lot_code, lt.expires_at
       FROM stock_reservations r
       JOIN products p ON p.id = r.product_id
       JOIN locations l ON l.id = r.location_id
       LEFT JOIN lots lt ON lt.id = r.lot_id
      WHERE r.sales_order_id = ? ORDER BY r.id`,
    id,
  );

  const picking = one<any>(
    `SELECT pk.*, o.name AS operator_name FROM picking_orders pk
       LEFT JOIN operators o ON o.id = pk.operator_id
      WHERE pk.sales_order_id = ? ORDER BY pk.created_at DESC LIMIT 1`,
    id,
  );
  const packing = one<any>(
    `SELECT * FROM packing_orders WHERE sales_order_id = ? ORDER BY created_at DESC LIMIT 1`, id,
  );
  const volumes = all<any>(
    `SELECT v.*, (SELECT COUNT(*) FROM volume_items vi WHERE vi.volume_id = v.id) AS line_count
       FROM volumes v WHERE v.sales_order_id = ? AND v.status <> 'CANCELLED' ORDER BY v.sequence`,
    id,
  );
  const check = one<any>(
    `SELECT * FROM shipping_checks WHERE sales_order_id = ? ORDER BY started_at DESC LIMIT 1`, id,
  );
  const manifest = one<any>(
    `SELECT m.*, mo.stop_sequence FROM manifest_orders mo
       JOIN shipping_manifests m ON m.id = mo.manifest_id
      WHERE mo.sales_order_id = ? LIMIT 1`,
    id,
  );
  const shipment = one<any>(`SELECT * FROM shipments WHERE sales_order_id = ?`, id);

  return { order, items, reservations, picking, packing, volumes, check, manifest, shipment };
}

export function setOrderStatus(
  id: string, to: ShippingStatus, actor: string, extra: Record<string, any> = {},
) {
  const cur = one<{ status: ShippingStatus }>(`SELECT status FROM sales_orders WHERE id = ?`, id);
  if (!cur) throw new OrderError(`Pedido ${id} inexistente`, "NOT_FOUND");
  assertTransition("sales_order", SHIPPING_TRANSITIONS, cur.status, to);
  update("sales_orders", id, { status: to, ...extra });
  audit({
    actor, action: to === "SHIPPED" ? "SHIP" : "UPDATE",
    entity: "sales_order", entityId: id,
    before: { status: cur.status }, after: { status: to, ...extra },
    detail: `Pedido ${id}: ${cur.status} -> ${to}`,
  });
}

export interface ReleaseResult {
  orderId: string;
  fullyReserved: boolean;
  lines: {
    productId: string; sku: string; requested: number;
    reserved: number; shortage: number; available: number;
  }[];
}

/**
 * Libera o pedido para separacao: reserva o estoque item a item.
 * NUNCA reserva acima do disponivel — a falta e reportada por linha e o
 * pedido permanece em PENDING se nao houver cobertura total.
 */
export function releaseOrder(orderId: string, actor: string): ReleaseResult {
  return tx(() => {
    const at = nowIso();
    const order = one<any>(`SELECT * FROM sales_orders WHERE id = ?`, orderId);
    if (!order) throw new OrderError(`Pedido ${orderId} inexistente`, "NOT_FOUND");
    if (order.status !== "PENDING") {
      throw new OrderError(`Pedido ja liberado (status ${order.status})`, "ALREADY_RELEASED");
    }
    if (order.reserved) {
      throw new OrderError("Pedido ja reservado integralmente", "ALREADY_RESERVED");
    }

    const items = all<any>(
      `SELECT si.*, p.sku FROM sales_order_items si JOIN products p ON p.id = si.product_id
        WHERE si.sales_order_id = ? ORDER BY si.line_no`,
      orderId,
    );
    if (items.length === 0) throw new OrderError("Pedido sem itens", "NO_ITEMS");

    const lines: ReleaseResult["lines"] = [];
    let complete = true;

    for (const it of items) {
      const pending = round3(it.quantity - it.reserved_qty);
      if (pending <= 0) {
        lines.push({
          productId: it.product_id, sku: it.sku, requested: it.quantity,
          reserved: it.reserved_qty, shortage: 0, available: stockOf(it.product_id).available,
        });
        continue;
      }
      const res = reserve({
        salesOrderId: orderId,
        salesOrderItemId: it.id,
        productId: it.product_id,
        quantity: pending,
        strategy: "FEFO",
        operatorId: actor,
        occurredAt: at,
      });
      run(
        `UPDATE sales_order_items SET reserved_qty = reserved_qty + ? WHERE id = ?`,
        res.reserved, it.id,
      );
      if (res.shortage > 0) complete = false;
      lines.push({
        productId: it.product_id, sku: it.sku, requested: it.quantity,
        reserved: round3(it.reserved_qty + res.reserved), shortage: res.shortage,
        available: stockOf(it.product_id).available,
      });
    }

    run(
      `UPDATE sales_orders SET reserved = ?, released_at = COALESCE(released_at, ?) WHERE id = ?`,
      complete ? 1 : 0, at, orderId,
    );

    audit({
      actor, action: "RESERVE", entity: "sales_order", entityId: orderId,
      after: { fullyReserved: complete, lines },
      detail: complete
        ? `Pedido ${orderId} totalmente reservado`
        : `Pedido ${orderId} reservado parcialmente — ha falta de estoque`,
      occurredAt: at,
    });

    return { orderId, fullyReserved: complete, lines };
  });
}

export function cancelOrder(orderId: string, actor: string, reason: string) {
  return tx(() => {
    const order = one<any>(`SELECT * FROM sales_orders WHERE id = ?`, orderId);
    if (!order) throw new OrderError("Pedido inexistente", "NOT_FOUND");
    if (order.status === "SHIPPED") {
      throw new OrderError("Pedido ja expedido nao pode ser cancelado", "ALREADY_SHIPPED");
    }
    releaseReservations(orderId, actor);
    run(`UPDATE sales_order_items SET reserved_qty = 0 WHERE sales_order_id = ?`, orderId);
    run(`UPDATE picking_orders SET status = 'CANCELLED' WHERE sales_order_id = ? AND status <> 'COMPLETED'`, orderId);
    setOrderStatus(orderId, "CANCELLED", actor, { reserved: 0, notes: reason });
    return true;
  });
}

export interface CreateOrderInput {
  customerId: string;
  warehouseId: string;
  priority?: string;
  dueAt: string;
  carrier?: string;
  notes?: string;
  items: { productId: string; quantity: number }[];
  actor: string;
  id?: string;
  issuedAt?: string;
}

export function createOrder(input: CreateOrderInput): string {
  return tx(() => {
    const at = input.issuedAt ?? nowIso();
    if (input.items.length === 0) throw new OrderError("Pedido sem itens", "NO_ITEMS");
    const id = input.id ?? nextId(PREFIX.SALES_ORDER);
    const customer = one<any>(`SELECT * FROM customers WHERE id = ?`, input.customerId);
    if (!customer) throw new OrderError("Cliente inexistente", "NO_CUSTOMER");

    insert("sales_orders", {
      id, customer_id: input.customerId, warehouse_id: input.warehouseId,
      status: "PENDING", priority: input.priority ?? "NORMAL",
      issued_at: at, due_at: input.dueAt,
      ship_to_address: customer.address, ship_to_city: customer.city,
      ship_to_state: customer.state, ship_to_zip: customer.zip,
      carrier: input.carrier ?? null, total_value: 0, total_weight_kg: 0,
      total_volumes: 0, reserved: 0, notes: input.notes ?? null, created_at: at,
    });

    let value = 0;
    let weight = 0;
    input.items.forEach((it, idx) => {
      const p = one<any>(`SELECT * FROM products WHERE id = ?`, it.productId);
      if (!p) throw new OrderError(`Produto ${it.productId} inexistente`, "NO_PRODUCT");
      const lineValue = round3(it.quantity * p.unit_price);
      const lineWeight = round3(it.quantity * p.unit_gross_kg);
      value += lineValue;
      weight += lineWeight;
      insert("sales_order_items", {
        id: `${id}-L${String(idx + 1).padStart(2, "0")}`,
        sales_order_id: id, line_no: idx + 1, product_id: it.productId,
        quantity: round3(it.quantity), unit: p.unit, unit_price: p.unit_price,
        reserved_qty: 0, picked_qty: 0, packed_qty: 0, shipped_qty: 0,
        weight_kg: lineWeight,
      });
    });

    run(
      `UPDATE sales_orders SET total_value = ?, total_weight_kg = ? WHERE id = ?`,
      Math.round(value * 100) / 100, round3(weight), id,
    );

    audit({
      actor: input.actor, action: "CREATE", entity: "sales_order", entityId: id,
      after: { customer: input.customerId, lines: input.items.length, value },
      detail: `Pedido de venda ${id} criado`, occurredAt: at,
    });
    return id;
  });
}

/** Cobertura de estoque do pedido, linha a linha (usado antes de liberar). */
export function coverage(orderId: string) {
  return all<any>(
    `SELECT si.*, p.sku, p.description FROM sales_order_items si
       JOIN products p ON p.id = si.product_id
      WHERE si.sales_order_id = ? ORDER BY si.line_no`,
    orderId,
  ).map((it) => {
    const s = stockOf(it.product_id);
    const needed = round3(it.quantity - it.reserved_qty);
    return {
      ...it,
      onHand: s.onHand,
      available: s.available,
      needed,
      covered: s.available >= needed,
      shortage: Math.max(0, round3(needed - s.available)),
    };
  });
}

export function orderCounts() {
  const rows = all<{ status: string; n: number }>(
    `SELECT status, COUNT(*) AS n FROM sales_orders GROUP BY status`,
  );
  const map: Record<string, number> = {};
  for (const r of rows) map[r.status] = r.n;
  return map;
}

export function listCustomers() {
  return all<any>(`SELECT * FROM customers ORDER BY name`);
}

export function listSuppliers() {
  return all<any>(`SELECT * FROM suppliers ORDER BY name`);
}

export function listPurchaseOrders(filter: { status?: string; search?: string } = {}) {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.status) { where.push("po.status = ?"); params.push(filter.status); }
  if (filter.search) {
    where.push("(po.id LIKE ? OR s.name LIKE ?)");
    const q = `%${filter.search}%`;
    params.push(q, q);
  }
  return all<any>(
    `SELECT po.*, s.name AS supplier_name, s.cnpj AS supplier_cnpj,
            (SELECT COUNT(*) FROM purchase_order_items pi WHERE pi.purchase_order_id = po.id) AS line_count,
            (SELECT COALESCE(SUM(quantity),0) FROM purchase_order_items pi WHERE pi.purchase_order_id = po.id) AS total_qty,
            (SELECT io.id FROM inbound_orders io WHERE io.purchase_order_id = po.id LIMIT 1) AS inbound_id
       FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY po.expected_at`,
    ...params,
  );
}

export function getPurchaseOrder(id: string) {
  const po = one<any>(
    `SELECT po.*, s.name AS supplier_name, s.cnpj AS supplier_cnpj, s.address AS supplier_address,
            s.city AS supplier_city, s.state AS supplier_state, s.phone AS supplier_phone,
            s.email AS supplier_email
       FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE po.id = ?`,
    id,
  );
  if (!po) return null;
  const items = all<any>(
    `SELECT pi.*, p.sku, p.description, p.ncm FROM purchase_order_items pi
       JOIN products p ON p.id = pi.product_id
      WHERE pi.purchase_order_id = ? ORDER BY pi.line_no`,
    id,
  );
  const inbound = one<any>(`SELECT * FROM inbound_orders WHERE purchase_order_id = ?`, id);
  return { po, items, inbound };
}
