import { all, one, insert, run, tx } from "@/lib/db";
import { nextId, PREFIX } from "@/lib/ids";
import { nowIso, round3 } from "@/lib/format";
import { audit } from "./audit";
import { simulatedKey } from "./shipping";

/**
 * NOTA FISCAL SIMULADA — uso academico.
 *
 * Nao ha qualquer integracao com SEFAZ. A chave de acesso e gerada por
 * funcao deterministica local e o documento e marcado, em todas as vias,
 * como "DOCUMENTO SIMULADO — USO ACADEMICO".
 */
export const SIMULATION_NOTICE = "DOCUMENTO SIMULADO — USO ACADEMICO";

export function createInboundInvoice(params: {
  inboundOrderId: string;
  supplierId: string;
  warehouseId: string;
  number?: string;
  series?: string;
  issuedAt?: string;
  actor: string;
  id?: string;
}): string {
  return tx(() => {
    const at = params.issuedAt ?? nowIso();
    const id = params.id ?? nextId(PREFIX.INVOICE);
    const items = all<any>(
      `SELECT ii.*, p.sku, p.description, p.ncm, p.cfop_in, p.unit_price, p.unit_gross_kg
         FROM inbound_order_items ii JOIN products p ON p.id = ii.product_id
        WHERE ii.inbound_order_id = ? ORDER BY ii.line_no`,
      params.inboundOrderId,
    );
    if (items.length === 0) throw new Error("Recebimento sem itens para faturar");

    let totalProducts = 0;
    let totalWeight = 0;
    const volumes = one<any>(
      `SELECT expected_volumes FROM inbound_orders WHERE id = ?`, params.inboundOrderId,
    );

    insert("invoices", {
      id, number: params.number ?? id.split("-")[1], series: params.series ?? "001",
      access_key: simulatedKey(id, at), issued_at: at,
      kind: "INBOUND", issuer_kind: "SUPPLIER", issuer_id: params.supplierId,
      recipient_kind: "WAREHOUSE", recipient_id: params.warehouseId,
      nature_op: "Venda de mercadoria adquirida (SIMULADO)",
      total_products: 0, total_invoice: 0, total_weight_kg: 0,
      total_volumes: volumes?.expected_volumes ?? 0,
      inbound_order_id: params.inboundOrderId, simulated: 1, created_at: at,
    });

    items.forEach((it, idx) => {
      const total = round3(it.expected_qty * it.unit_price);
      const weight = round3(it.expected_qty * it.unit_gross_kg);
      totalProducts += total;
      totalWeight += weight;
      insert("invoice_items", {
        id: `${id}-L${String(idx + 1).padStart(2, "0")}`,
        invoice_id: id, line_no: idx + 1, product_id: it.product_id,
        description: it.description, ncm: it.ncm, cfop: it.cfop_in ?? "1102",
        unit: it.unit, quantity: it.expected_qty, unit_price: it.unit_price,
        total_price: total, weight_kg: weight,
        lot_code: it.lot_code, expires_at: it.expires_at,
      });
    });

    run(
      `UPDATE invoices SET total_products = ?, total_invoice = ?, total_weight_kg = ? WHERE id = ?`,
      Math.round(totalProducts * 100) / 100,
      Math.round(totalProducts * 100) / 100,
      round3(totalWeight), id,
    );
    run(`UPDATE inbound_orders SET invoice_id = ? WHERE id = ?`, id, params.inboundOrderId);

    audit({
      actor: params.actor, action: "CREATE", entity: "invoice", entityId: id,
      after: { kind: "INBOUND", inbound: params.inboundOrderId, total: totalProducts },
      detail: `Nota fiscal simulada ${id} emitida para ${params.inboundOrderId}`,
      occurredAt: at,
    });
    return id;
  });
}

export function createOutboundInvoice(params: {
  salesOrderId: string; warehouseId: string; actor: string; issuedAt?: string;
}): string {
  return tx(() => {
    const at = params.issuedAt ?? nowIso();
    const existing = one<any>(
      `SELECT id FROM invoices WHERE sales_order_id = ? AND kind = 'OUTBOUND'`, params.salesOrderId,
    );
    if (existing) return existing.id;

    const order = one<any>(`SELECT * FROM sales_orders WHERE id = ?`, params.salesOrderId);
    if (!order) throw new Error("Pedido inexistente");
    const items = all<any>(
      `SELECT si.*, p.sku, p.description, p.ncm, p.cfop_out, p.unit_gross_kg
         FROM sales_order_items si JOIN products p ON p.id = si.product_id
        WHERE si.sales_order_id = ? ORDER BY si.line_no`,
      params.salesOrderId,
    );

    const id = nextId(PREFIX.INVOICE);
    insert("invoices", {
      id, number: id.split("-")[1], series: "001",
      access_key: simulatedKey(id, at), issued_at: at,
      kind: "OUTBOUND", issuer_kind: "WAREHOUSE", issuer_id: params.warehouseId,
      recipient_kind: "CUSTOMER", recipient_id: order.customer_id,
      nature_op: "Venda de mercadoria (SIMULADO)",
      total_products: 0, total_invoice: 0, total_weight_kg: 0,
      total_volumes: order.total_volumes, sales_order_id: params.salesOrderId,
      simulated: 1, created_at: at,
    });

    let totalProducts = 0;
    let totalWeight = 0;
    items.forEach((it, idx) => {
      const qty = it.shipped_qty > 0 ? it.shipped_qty : it.quantity;
      const total = round3(qty * it.unit_price);
      const weight = round3(qty * it.unit_gross_kg);
      totalProducts += total;
      totalWeight += weight;
      insert("invoice_items", {
        id: `${id}-L${String(idx + 1).padStart(2, "0")}`,
        invoice_id: id, line_no: idx + 1, product_id: it.product_id,
        description: it.description, ncm: it.ncm, cfop: it.cfop_out ?? "5102",
        unit: it.unit, quantity: qty, unit_price: it.unit_price,
        total_price: total, weight_kg: weight,
      });
    });

    run(
      `UPDATE invoices SET total_products = ?, total_invoice = ?, total_weight_kg = ? WHERE id = ?`,
      Math.round(totalProducts * 100) / 100,
      Math.round(totalProducts * 100) / 100,
      round3(totalWeight), id,
    );
    audit({
      actor: params.actor, action: "CREATE", entity: "invoice", entityId: id,
      after: { kind: "OUTBOUND", order: params.salesOrderId, total: totalProducts },
      detail: `Nota fiscal simulada de saida ${id} emitida para ${params.salesOrderId}`,
      occurredAt: at,
    });
    return id;
  });
}

export function getInvoice(id: string) {
  const invoice = one<any>(`SELECT * FROM invoices WHERE id = ?`, id);
  if (!invoice) return null;
  const items = all<any>(
    `SELECT ii.*, p.sku FROM invoice_items ii JOIN products p ON p.id = ii.product_id
      WHERE ii.invoice_id = ? ORDER BY ii.line_no`,
    id,
  );
  const issuer = invoice.issuer_kind === "SUPPLIER"
    ? one<any>(`SELECT * FROM suppliers WHERE id = ?`, invoice.issuer_id)
    : one<any>(`SELECT * FROM warehouses WHERE id = ?`, invoice.issuer_id);
  const recipient = invoice.recipient_kind === "CUSTOMER"
    ? one<any>(`SELECT * FROM customers WHERE id = ?`, invoice.recipient_id)
    : one<any>(`SELECT * FROM warehouses WHERE id = ?`, invoice.recipient_id);
  return { invoice, items, issuer, recipient };
}

export function listInvoices(filter: { kind?: string; search?: string } = {}) {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.kind) { where.push("kind = ?"); params.push(filter.kind); }
  if (filter.search) {
    where.push("(id LIKE ? OR number LIKE ? OR access_key LIKE ?)");
    const q = `%${filter.search}%`;
    params.push(q, q, q);
  }
  return all<any>(
    `SELECT * FROM invoices ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY issued_at DESC`,
    ...params,
  );
}
