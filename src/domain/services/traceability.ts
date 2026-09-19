import { all, one } from "@/lib/db";
import { auditFor } from "./audit";

/**
 * RASTREABILIDADE BIDIRECIONAL.
 * Cada consulta devolve a cadeia completa de eventos ligada a entidade,
 * montada a partir de movimentos, documentos e auditoria — nunca fabricada.
 */

export interface TraceNode {
  at: string;
  stage: string;
  title: string;
  detail: string;
  refKind?: string;
  refId?: string;
  tone: "neutral" | "accent" | "success" | "warning" | "info" | "error";
}

export interface TraceResult {
  kind: string;
  id: string;
  title: string;
  subtitle: string;
  timeline: TraceNode[];
  related: { label: string; kind: string; id: string; href: string }[];
  notFound?: boolean;
}

const MOVE_STAGE: Record<string, { stage: string; tone: TraceNode["tone"] }> = {
  RECEIPT: { stage: "Recebimento", tone: "accent" },
  PUTAWAY: { stage: "Armazenagem", tone: "info" },
  TRANSFER: { stage: "Movimentacao", tone: "neutral" },
  PICK: { stage: "Picking", tone: "accent" },
  PACK: { stage: "Packing", tone: "info" },
  SHIP: { stage: "Expedicao", tone: "success" },
  COUNT: { stage: "Inventario", tone: "warning" },
  ADJUSTMENT: { stage: "Ajuste", tone: "warning" },
  BLOCK: { stage: "Bloqueio", tone: "error" },
  UNBLOCK: { stage: "Desbloqueio", tone: "info" },
  RETURN: { stage: "Devolucao", tone: "info" },
};

function movementNodes(where: string, ...params: any[]): TraceNode[] {
  return all<any>(
    `SELECT m.*, p.sku, fl.code AS from_code, tl.code AS to_code, lt.code AS lot_code
       FROM inventory_movements m
       JOIN products p ON p.id = m.product_id
       LEFT JOIN locations fl ON fl.id = m.from_location_id
       LEFT JOIN locations tl ON tl.id = m.to_location_id
       LEFT JOIN lots lt ON lt.id = m.lot_id
      WHERE ${where} ORDER BY m.occurred_at, m.id`,
    ...params,
  ).map((m) => {
    const meta = MOVE_STAGE[m.kind] ?? { stage: m.kind, tone: "neutral" as const };
    const path = m.from_code && m.to_code
      ? `${m.from_code} → ${m.to_code}`
      : m.to_code ? `entrada em ${m.to_code}`
      : m.from_code ? `saida de ${m.from_code}` : "";
    return {
      at: m.occurred_at, stage: meta.stage, tone: meta.tone,
      title: `${m.sku} · ${m.quantity} ${m.unit}`,
      detail: [path, m.lot_code ? `lote ${m.lot_code}` : "", m.pallet_id ?? "", m.reason ?? ""]
        .filter(Boolean).join(" · "),
      refKind: m.ref_kind, refId: m.ref_id,
    };
  });
}

// ------------------------------------------------------------------ produto
export function traceProduct(productId: string): TraceResult {
  const p = one<any>(`SELECT * FROM products WHERE id = ? OR sku = ?`, productId, productId);
  if (!p) {
    return { kind: "PRODUCT", id: productId, title: productId, subtitle: "", timeline: [], related: [], notFound: true };
  }
  const lots = all<any>(`SELECT * FROM lots WHERE product_id = ?`, p.id);
  const locations = all<any>(
    `SELECT i.*, l.code FROM inventory i JOIN locations l ON l.id = i.location_id
      WHERE i.product_id = ? AND i.qty_on_hand > 0`,
    p.id,
  );
  const related = [
    ...lots.map((l) => ({ label: `Lote ${l.code}`, kind: "LOT", id: l.id, href: `/inventory?search=${p.sku}` })),
    ...locations.map((l) => ({ label: `Endereco ${l.code}`, kind: "LOCATION", id: l.location_id, href: `/warehouse/${l.location_id}` })),
    ...all<any>(
      `SELECT DISTINCT pallet_id FROM inventory WHERE product_id = ? AND pallet_id IS NOT NULL`, p.id,
    ).map((r) => ({ label: `Palete ${r.pallet_id}`, kind: "PALLET", id: r.pallet_id, href: `/warehouse/pallets/${r.pallet_id}` })),
    ...all<any>(
      `SELECT DISTINCT si.sales_order_id FROM sales_order_items si WHERE si.product_id = ?`, p.id,
    ).map((r) => ({ label: `Pedido ${r.sales_order_id}`, kind: "SALES_ORDER", id: r.sales_order_id, href: `/shipping/orders/${r.sales_order_id}` })),
  ];
  return {
    kind: "PRODUCT", id: p.id, title: p.sku, subtitle: p.description,
    timeline: movementNodes("m.product_id = ?", p.id),
    related,
  };
}

// ------------------------------------------------------------------ palete
export function tracePallet(palletId: string): TraceResult {
  const pl = one<any>(
    `SELECT pl.*, l.code AS location_code FROM pallets pl
       LEFT JOIN locations l ON l.id = pl.location_id WHERE pl.id = ?`,
    palletId,
  );
  if (!pl) {
    return { kind: "PALLET", id: palletId, title: palletId, subtitle: "", timeline: [], related: [], notFound: true };
  }
  const items = all<any>(
    `SELECT pi.*, p.sku FROM pallet_items pi JOIN products p ON p.id = pi.product_id
      WHERE pi.pallet_id = ?`,
    palletId,
  );
  const timeline: TraceNode[] = [
    {
      at: pl.created_at, stage: "Paletizacao", tone: "accent",
      title: `Palete ${pl.id} montado`,
      detail: `${items.length} item(ns) · origem ${pl.origin_ref ?? pl.origin_kind}`,
      refKind: pl.origin_kind === "RECEIVING" ? "INBOUND_ORDER" : undefined,
      refId: pl.origin_ref ?? undefined,
    },
    ...movementNodes("m.pallet_id = ?", palletId),
  ];
  const weighings = all<any>(
    `SELECT * FROM weighings WHERE ref_kind = 'PALLET' AND ref_id = ?`, palletId,
  );
  for (const w of weighings) {
    timeline.push({
      at: w.weighed_at, stage: "Pesagem", tone: "info",
      title: `Peso liquido ${w.net_kg} kg`,
      detail: `bruto ${w.gross_kg} kg · tara ${w.tare_kg} kg`,
      refKind: "WEIGHING", refId: w.id,
    });
  }
  const storage = all<any>(
    `SELECT so.*, l.code FROM storage_orders so LEFT JOIN locations l ON l.id = so.final_location_id
      WHERE so.pallet_id = ?`,
    palletId,
  );
  for (const s of storage) {
    if (s.completed_at) {
      timeline.push({
        at: s.completed_at, stage: "Armazenagem", tone: "success",
        title: `Armazenado em ${s.code}`,
        detail: s.override_reason ? `desvio: ${s.override_reason}` : "conforme sugestao do WMS",
        refKind: "STORAGE_ORDER", refId: s.id,
      });
    }
  }
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  return {
    kind: "PALLET", id: pl.id, title: pl.id,
    subtitle: `${items.map((i) => i.sku).join(", ")} · ${pl.status}`,
    timeline,
    related: [
      ...(pl.origin_ref ? [{ label: `Recebimento ${pl.origin_ref}`, kind: "INBOUND_ORDER", id: pl.origin_ref, href: `/receiving/${pl.origin_ref}` }] : []),
      ...(pl.location_id ? [{ label: `Endereco ${pl.location_code}`, kind: "LOCATION", id: pl.location_id, href: `/warehouse/${pl.location_id}` }] : []),
      ...items.map((i) => ({ label: `Produto ${i.sku}`, kind: "PRODUCT", id: i.product_id, href: `/audit/trace?q=${i.sku}` })),
    ],
  };
}

// ------------------------------------------------------------------ pedido
export function traceOrder(orderId: string): TraceResult {
  const o = one<any>(
    `SELECT so.*, c.name AS customer_name FROM sales_orders so
       JOIN customers c ON c.id = so.customer_id WHERE so.id = ?`,
    orderId,
  );
  if (!o) {
    return { kind: "SALES_ORDER", id: orderId, title: orderId, subtitle: "", timeline: [], related: [], notFound: true };
  }
  const timeline: TraceNode[] = [
    { at: o.issued_at, stage: "Pedido", tone: "neutral", title: `Pedido ${o.id} emitido`, detail: o.customer_name },
  ];
  if (o.released_at) {
    const res = all<any>(
      `SELECT r.*, p.sku, l.code FROM stock_reservations r
         JOIN products p ON p.id = r.product_id JOIN locations l ON l.id = r.location_id
        WHERE r.sales_order_id = ?`,
      orderId,
    );
    timeline.push({
      at: o.released_at, stage: "Reserva", tone: "info",
      title: `${res.length} reserva(s) criada(s)`,
      detail: res.map((r) => `${r.sku} ${r.quantity} em ${r.code}`).join(" · "),
    });
  }
  for (const pk of all<any>(`SELECT * FROM picking_orders WHERE sales_order_id = ?`, orderId)) {
    if (pk.started_at) {
      timeline.push({
        at: pk.started_at, stage: "Picking", tone: "accent",
        title: `Separacao ${pk.id} iniciada`, detail: `${pk.total_lines} linhas`,
        refKind: "PICKING", refId: pk.id,
      });
    }
    if (pk.completed_at) {
      timeline.push({
        at: pk.completed_at, stage: "Picking", tone: pk.status === "COMPLETED" ? "success" : "warning",
        title: `Separacao ${pk.status === "COMPLETED" ? "concluida" : "com divergencia"}`,
        detail: `${pk.picked_units} unidades`, refKind: "PICKING", refId: pk.id,
      });
    }
  }
  for (const pa of all<any>(`SELECT * FROM packing_orders WHERE sales_order_id = ?`, orderId)) {
    if (pa.completed_at) {
      timeline.push({
        at: pa.completed_at, stage: "Packing", tone: "info",
        title: `Embalagem concluida`, detail: `${pa.total_volumes} volume(s) · ${pa.total_weight_kg} kg`,
        refKind: "PACKING", refId: pa.id,
      });
    }
  }
  for (const c of all<any>(`SELECT * FROM shipping_checks WHERE sales_order_id = ?`, orderId)) {
    if (c.finished_at) {
      timeline.push({
        at: c.finished_at, stage: "Conferencia", tone: c.divergence_count ? "warning" : "success",
        title: `Conferencia de expedicao ${c.status}`,
        detail: `${c.divergence_count} divergencia(s)`, refKind: "SHIPPING_CHECK", refId: c.id,
      });
    }
  }
  const manifest = one<any>(
    `SELECT m.* FROM manifest_orders mo JOIN shipping_manifests m ON m.id = mo.manifest_id
      WHERE mo.sales_order_id = ?`,
    orderId,
  );
  if (manifest) {
    timeline.push({
      at: manifest.created_at, stage: "Romaneio", tone: "info",
      title: `Incluido no romaneio ${manifest.id}`,
      detail: `${manifest.route} · ${manifest.vehicle_plate ?? "—"}`,
      refKind: "MANIFEST", refId: manifest.id,
    });
    const lo = one<any>(
      `SELECT * FROM loading_operations WHERE manifest_id = ? ORDER BY created_at DESC LIMIT 1`,
      manifest.id,
    );
    if (lo?.completed_at) {
      timeline.push({
        at: lo.completed_at, stage: "Carregamento", tone: "accent",
        title: `Carregamento concluido`,
        detail: `${lo.loaded_volumes}/${lo.expected_volumes} volumes · lacre ${lo.seal ?? "—"}`,
        refKind: "LOADING", refId: lo.id,
      });
    }
  }
  timeline.push(...movementNodes("m.ref_id = ? AND m.ref_kind IN ('SALES_ORDER','SHIPMENT','PICKING')", orderId));
  if (o.shipped_at) {
    timeline.push({
      at: o.shipped_at, stage: "Expedicao", tone: "success",
      title: `Pedido expedido`, detail: `${o.total_volumes} volume(s) · ${o.total_weight_kg} kg`,
    });
  }
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  const volumes = all<any>(
    `SELECT id FROM volumes WHERE sales_order_id = ? AND status <> 'CANCELLED'`, orderId,
  );
  return {
    kind: "SALES_ORDER", id: o.id, title: o.id,
    subtitle: `${o.customer_name} · ${o.status}`,
    timeline,
    related: [
      { label: "Pedido de venda", kind: "DOC", id: o.id, href: `/documents/sales-order/${o.id}` },
      ...volumes.map((v) => ({ label: `Volume ${v.id}`, kind: "VOLUME", id: v.id, href: `/documents/volume-label/${v.id}` })),
      ...(manifest ? [{ label: `Romaneio ${manifest.id}`, kind: "MANIFEST", id: manifest.id, href: `/shipping/manifests/${manifest.id}` }] : []),
    ],
  };
}

// ------------------------------------------------------------------ recebimento
export function traceInbound(inboundId: string): TraceResult {
  const io = one<any>(
    `SELECT io.*, s.name AS supplier_name FROM inbound_orders io
       JOIN suppliers s ON s.id = io.supplier_id WHERE io.id = ?`,
    inboundId,
  );
  if (!io) {
    return { kind: "INBOUND_ORDER", id: inboundId, title: inboundId, subtitle: "", timeline: [], related: [], notFound: true };
  }
  const timeline: TraceNode[] = [
    { at: io.created_at, stage: "Agendamento", tone: "neutral", title: `Recebimento ${io.id} agendado`, detail: io.supplier_name },
  ];
  if (io.arrived_at) timeline.push({ at: io.arrived_at, stage: "Portaria", tone: "info", title: "Veiculo chegou", detail: `${io.vehicle_plate ?? "—"} · ${io.driver_name ?? "—"}` });
  if (io.started_at) timeline.push({ at: io.started_at, stage: "Descarga", tone: "accent", title: "Recebimento iniciado", detail: io.dock_id ?? "" });
  for (const w of all<any>(`SELECT * FROM weighings WHERE ref_kind = 'INBOUND_ORDER' AND ref_id = ?`, inboundId)) {
    timeline.push({ at: w.weighed_at, stage: "Pesagem", tone: "info", title: `Peso liquido ${w.net_kg} kg`, detail: `bruto ${w.gross_kg} · tara ${w.tare_kg}`, refKind: "WEIGHING", refId: w.id });
  }
  for (const c of all<any>(`SELECT * FROM receiving_checks WHERE inbound_order_id = ?`, inboundId)) {
    if (c.finished_at) {
      timeline.push({ at: c.finished_at, stage: "Conferencia", tone: c.divergence_count ? "warning" : "success", title: `Conferencia ${c.status}`, detail: `${c.divergence_count} divergencia(s)`, refKind: "RECEIVING_CHECK", refId: c.id });
    }
  }
  timeline.push(...movementNodes("m.ref_kind = 'INBOUND_ORDER' AND m.ref_id = ?", inboundId));
  if (io.completed_at) timeline.push({ at: io.completed_at, stage: "Conclusao", tone: "success", title: "Recebimento concluido", detail: "" });
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  const pallets = all<any>(`SELECT id FROM pallets WHERE origin_ref = ?`, inboundId);
  return {
    kind: "INBOUND_ORDER", id: io.id, title: io.id,
    subtitle: `${io.supplier_name} · ${io.status}`,
    timeline,
    related: [
      ...(io.invoice_id ? [{ label: `NF ${io.invoice_id}`, kind: "INVOICE", id: io.invoice_id, href: `/documents/invoice/${io.invoice_id}` }] : []),
      ...pallets.map((p) => ({ label: `Palete ${p.id}`, kind: "PALLET", id: p.id, href: `/warehouse/pallets/${p.id}` })),
    ],
  };
}

// ------------------------------------------------------------------ documento
export function traceDocument(docId: string): TraceResult {
  const logs = auditFor("invoice", docId);
  const invoice = one<any>(`SELECT * FROM invoices WHERE id = ?`, docId);
  if (invoice) {
    const nodes: TraceNode[] = [
      { at: invoice.issued_at, stage: "Documento", tone: "info", title: `NF simulada ${invoice.number}/${invoice.series}`, detail: invoice.nature_op },
      ...logs.map((l) => ({
        at: l.occurred_at, stage: "Auditoria", tone: "neutral" as const,
        title: l.action, detail: l.detail ?? "",
      })),
    ];
    const chain = invoice.inbound_order_id
      ? traceInbound(invoice.inbound_order_id).timeline
      : invoice.sales_order_id ? traceOrder(invoice.sales_order_id).timeline : [];
    return {
      kind: "INVOICE", id: docId, title: `NF ${invoice.number}/${invoice.series}`,
      subtitle: invoice.kind === "INBOUND" ? "Entrada" : "Saida",
      timeline: [...nodes, ...chain].sort((a, b) => a.at.localeCompare(b.at)),
      related: [
        ...(invoice.inbound_order_id ? [{ label: `Recebimento ${invoice.inbound_order_id}`, kind: "INBOUND_ORDER", id: invoice.inbound_order_id, href: `/receiving/${invoice.inbound_order_id}` }] : []),
        ...(invoice.sales_order_id ? [{ label: `Pedido ${invoice.sales_order_id}`, kind: "SALES_ORDER", id: invoice.sales_order_id, href: `/shipping/orders/${invoice.sales_order_id}` }] : []),
      ],
    };
  }
  return { kind: "DOCUMENT", id: docId, title: docId, subtitle: "", timeline: [], related: [], notFound: true };
}

/** Roteia automaticamente pelo prefixo do identificador informado. */
export function traceAny(rawId: string): TraceResult {
  const id = rawId.trim().toUpperCase();
  if (id.startsWith("PLT-")) return tracePallet(id);
  if (id.startsWith("PED-")) return traceOrder(id);
  if (id.startsWith("OR-")) return traceInbound(id);
  if (id.startsWith("NFS-")) return traceDocument(id);
  const product = one<any>(`SELECT id FROM products WHERE id = ? OR sku = ?`, id, id);
  if (product) return traceProduct(product.id);
  return { kind: "UNKNOWN", id, title: id, subtitle: "", timeline: [], related: [], notFound: true };
}
