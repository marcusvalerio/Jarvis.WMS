import { all, one, insert, scalar } from "@/lib/db";
import { prefixOf, normalizeLocationInput, PREFIX } from "@/lib/ids";
import { nowIso } from "@/lib/format";

/**
 * RESOLUCAO UNIVERSAL DE CODIGO DE BARRAS.
 *
 * A coletora USB funciona como teclado (HID): o navegador recebe os
 * caracteres e um Enter final. O valor lido e exatamente o ID da entidade,
 * entao a resolucao e deterministica — sem heuristica.
 */

export type ScanEntityKind =
  | "LOCATION" | "PALLET" | "PRODUCT" | "VOLUME" | "SALES_ORDER"
  | "INBOUND_ORDER" | "MANIFEST" | "STORAGE_ORDER" | "PICKING_ORDER"
  | "PACKING_ORDER" | "OPERATOR" | "EQUIPMENT" | "LOADING" | "INVOICE"
  | "PURCHASE_ORDER" | "UNKNOWN";

export interface ResolvedScan {
  raw: string;
  normalized: string;
  kind: ScanEntityKind;
  id: string | null;
  label: string;
  sublabel?: string;
  status?: string;
  /** Dados especificos da entidade, ja prontos para a tela da coletora. */
  data?: Record<string, any>;
  /** Proximo passo operacional sugerido. */
  nextAction?: string;
  found: boolean;
}

const KIND_BY_PREFIX: Record<string, ScanEntityKind> = {
  [PREFIX.LOCATION]: "LOCATION",
  [PREFIX.PALLET]: "PALLET",
  [PREFIX.VOLUME]: "VOLUME",
  [PREFIX.SALES_ORDER]: "SALES_ORDER",
  [PREFIX.INBOUND_ORDER]: "INBOUND_ORDER",
  [PREFIX.MANIFEST]: "MANIFEST",
  [PREFIX.STORAGE_ORDER]: "STORAGE_ORDER",
  [PREFIX.PICKING_ORDER]: "PICKING_ORDER",
  [PREFIX.PACKING_ORDER]: "PACKING_ORDER",
  [PREFIX.OPERATOR]: "OPERATOR",
  [PREFIX.EQUIPMENT]: "EQUIPMENT",
  [PREFIX.LOADING]: "LOADING",
  [PREFIX.INVOICE]: "INVOICE",
  [PREFIX.PURCHASE_ORDER]: "PURCHASE_ORDER",
};

export async function resolveScan(raw: string): Promise<ResolvedScan> {
  const trimmed = raw.trim().toUpperCase();
  const base: ResolvedScan = {
    raw, normalized: trimmed, kind: "UNKNOWN", id: null,
    label: "Codigo nao reconhecido", found: false,
  };
  if (!trimmed) return base;

  // 1. Endereco (aceita A-02-03-01, A020301 ou END-A020301)
  const locId = normalizeLocationInput(trimmed);
  if (locId) {
    const loc = await one<any>(
      `SELECT l.*, z.name AS zone_name FROM locations l
         JOIN zones z ON z.id = l.zone_id WHERE l.id = ?`,
      locId,
    );
    if (loc) {
      const contents = await all<any>(
        `SELECT i.*, p.sku, p.description, lt.code AS lot_code, lt.expires_at
           FROM inventory i JOIN products p ON p.id = i.product_id
           LEFT JOIN lots lt ON lt.id = i.lot_id
          WHERE i.location_id = ? AND i.qty_on_hand > 0`,
        locId,
      );
      return {
        ...base, kind: "LOCATION", id: loc.id, found: true,
        label: loc.code,
        sublabel: `${loc.zone_name} · nivel ${loc.level}`,
        status: loc.status,
        data: { location: loc, contents },
        nextAction: contents.length ? "Endereco ocupado" : "Endereco livre",
      };
    }
    return { ...base, kind: "LOCATION", label: `Endereco ${trimmed} nao cadastrado` };
  }

  // 2. Produto por codigo de barras ou SKU
  const bc = await one<any>(
    `SELECT pb.code, p.* FROM product_barcodes pb JOIN products p ON p.id = pb.product_id
      WHERE pb.code = ?`,
    trimmed,
  );
  const direct = bc ? null : await one<any>(`SELECT * FROM products WHERE id = ? OR sku = ?`, trimmed, trimmed);
  const product = bc ?? direct;
  if (product) {
    const stock = await one<any>(
      `SELECT COALESCE(SUM(qty_on_hand),0) oh, COALESCE(SUM(qty_reserved),0) rs
         FROM inventory WHERE product_id = ?`,
      product.id,
    );
    return {
      ...base, kind: "PRODUCT", id: product.id, found: true,
      label: product.sku,
      sublabel: product.description,
      data: {
        product,
        onHand: stock?.oh ?? 0,
        reserved: stock?.rs ?? 0,
        available: (stock?.oh ?? 0) - (stock?.rs ?? 0),
      },
      nextAction: "Produto identificado",
    };
  }

  // 3. Entidades por prefixo
  const prefix = prefixOf(trimmed);
  const kind = prefix ? KIND_BY_PREFIX[prefix] : undefined;
  if (!kind) return base;

  switch (kind) {
    case "PALLET": {
      const p = await one<any>(
        `SELECT pl.*, l.code AS location_code FROM pallets pl
           LEFT JOIN locations l ON l.id = pl.location_id WHERE pl.id = ?`,
        trimmed,
      );
      if (!p) return { ...base, kind, label: `Palete ${trimmed} nao existe` };
      const items = await all<any>(
        `SELECT pi.*, p.sku, p.description, p.unit, lt.code AS lot_code, lt.expires_at
           FROM pallet_items pi JOIN products p ON p.id = pi.product_id
           LEFT JOIN lots lt ON lt.id = pi.lot_id WHERE pi.pallet_id = ?`,
        trimmed,
      );
      const storage = await one<any>(
        `SELECT so.*, l.code AS suggested_code FROM storage_orders so
           LEFT JOIN locations l ON l.id = so.suggested_location_id
          WHERE so.pallet_id = ? AND so.status IN ('PENDING','IN_PROGRESS') LIMIT 1`,
        trimmed,
      );
      return {
        ...base, kind, id: p.id, found: true,
        label: p.id,
        sublabel: items.map((i) => `${i.sku} · ${i.quantity} ${i.unit}`).join("  |  "),
        status: p.status,
        data: { pallet: p, items, storageOrder: storage },
        nextAction:
          p.status === "AWAITING_PUTAWAY"
            ? `Armazenar em ${storage?.suggested_code ?? "endereco a definir"}`
            : p.status === "STORED" ? `Armazenado em ${p.location_code}` : p.status,
      };
    }
    case "VOLUME": {
      const v = await one<any>(
        `SELECT v.*, so.status AS order_status, c.name AS customer_name
           FROM volumes v
           LEFT JOIN sales_orders so ON so.id = v.sales_order_id
           LEFT JOIN customers c ON c.id = so.customer_id WHERE v.id = ?`,
        trimmed,
      );
      if (!v) return { ...base, kind, label: `Volume ${trimmed} nao existe` };
      const items = await all<any>(
        `SELECT vi.*, p.sku, p.unit FROM volume_items vi JOIN products p ON p.id = vi.product_id
          WHERE vi.volume_id = ?`,
        trimmed,
      );
      return {
        ...base, kind, id: v.id, found: true,
        label: v.id,
        sublabel: `${v.sales_order_id} · ${v.customer_name ?? ""}`,
        status: v.status,
        data: { volume: v, items },
        nextAction: v.status === "CHECKED" ? "Pronto para carregar" : `Status ${v.status}`,
      };
    }
    case "SALES_ORDER": {
      const o = await one<any>(
        `SELECT so.*, c.name AS customer_name FROM sales_orders so
           JOIN customers c ON c.id = so.customer_id WHERE so.id = ?`,
        trimmed,
      );
      if (!o) return { ...base, kind, label: `Pedido ${trimmed} nao existe` };
      const picking = await one<any>(
        `SELECT * FROM picking_orders WHERE sales_order_id = ? ORDER BY created_at DESC LIMIT 1`,
        trimmed,
      );
      return {
        ...base, kind, id: o.id, found: true,
        label: o.id, sublabel: o.customer_name, status: o.status,
        data: { order: o, picking },
        nextAction: picking ? `Picking ${picking.id} (${picking.status})` : "Sem picklist",
      };
    }
    case "INBOUND_ORDER": {
      const io = await one<any>(
        `SELECT io.*, s.name AS supplier_name FROM inbound_orders io
           JOIN suppliers s ON s.id = io.supplier_id WHERE io.id = ?`,
        trimmed,
      );
      if (!io) return { ...base, kind, label: `Recebimento ${trimmed} nao existe` };
      return {
        ...base, kind, id: io.id, found: true,
        label: io.id, sublabel: io.supplier_name, status: io.status,
        data: { inbound: io },
        nextAction: `Recebimento ${io.status}`,
      };
    }
    case "STORAGE_ORDER": {
      const so = await one<any>(
        `SELECT so.*, l.code AS suggested_code FROM storage_orders so
           LEFT JOIN locations l ON l.id = so.suggested_location_id WHERE so.id = ?`,
        trimmed,
      );
      if (!so) return { ...base, kind, label: `Ordem ${trimmed} nao existe` };
      return {
        ...base, kind, id: so.id, found: true,
        label: so.id, sublabel: `Palete ${so.pallet_id}`, status: so.status,
        data: { storageOrder: so },
        nextAction: `Armazenar em ${so.suggested_code ?? "endereco a definir"}`,
      };
    }
    case "MANIFEST": {
      const m = await one<any>(`SELECT * FROM shipping_manifests WHERE id = ?`, trimmed);
      if (!m) return { ...base, kind, label: `Romaneio ${trimmed} nao existe` };
      return {
        ...base, kind, id: m.id, found: true,
        label: m.id, sublabel: `${m.route} · ${m.vehicle_plate ?? "sem veiculo"}`,
        status: m.status, data: { manifest: m },
        nextAction: m.status === "READY" ? "Iniciar carregamento" : `Status ${m.status}`,
      };
    }
    case "PICKING_ORDER": {
      const pk = await one<any>(`SELECT * FROM picking_orders WHERE id = ?`, trimmed);
      if (!pk) return { ...base, kind, label: `Picklist ${trimmed} nao existe` };
      return {
        ...base, kind, id: pk.id, found: true,
        label: pk.id, sublabel: `Pedido ${pk.sales_order_id}`, status: pk.status,
        data: { picking: pk },
        nextAction: `${pk.done_lines}/${pk.total_lines} linhas`,
      };
    }
    case "PACKING_ORDER": {
      const pa = await one<any>(`SELECT * FROM packing_orders WHERE id = ?`, trimmed);
      if (!pa) return { ...base, kind, label: `Embalagem ${trimmed} nao existe` };
      return {
        ...base, kind, id: pa.id, found: true,
        label: pa.id, sublabel: `Pedido ${pa.sales_order_id}`, status: pa.status,
        data: { packing: pa },
      };
    }
    case "OPERATOR": {
      const op = await one<any>(`SELECT * FROM operators WHERE id = ? OR badge = ?`, trimmed, trimmed);
      if (!op) return { ...base, kind, label: `Operador ${trimmed} nao existe` };
      return {
        ...base, kind, id: op.id, found: true,
        label: op.name, sublabel: `${op.id} · turno ${op.shift}`,
        data: { operator: op }, nextAction: "Operador identificado",
      };
    }
    case "EQUIPMENT": {
      const eq = await one<any>(`SELECT * FROM equipment WHERE id = ?`, trimmed);
      if (!eq) return { ...base, kind, label: `Equipamento ${trimmed} nao existe` };
      return {
        ...base, kind, id: eq.id, found: true,
        label: `${eq.kind} ${eq.model}`, sublabel: eq.id, status: eq.status,
        data: { equipment: eq },
      };
    }
    case "LOADING": {
      const lo = await one<any>(`SELECT * FROM loading_operations WHERE id = ?`, trimmed);
      if (!lo) return { ...base, kind, label: `Carregamento ${trimmed} nao existe` };
      return {
        ...base, kind, id: lo.id, found: true,
        label: lo.id, sublabel: `Romaneio ${lo.manifest_id}`, status: lo.status,
        data: { loading: lo },
        nextAction: `${lo.loaded_volumes}/${lo.expected_volumes} volumes`,
      };
    }
    case "INVOICE": {
      const inv = await one<any>(`SELECT * FROM invoices WHERE id = ?`, trimmed);
      if (!inv) return { ...base, kind, label: `Nota ${trimmed} nao existe` };
      return {
        ...base, kind, id: inv.id, found: true,
        label: `NF ${inv.number}/${inv.series}`, sublabel: inv.id,
        data: { invoice: inv },
      };
    }
    case "PURCHASE_ORDER": {
      const po = await one<any>(`SELECT * FROM purchase_orders WHERE id = ?`, trimmed);
      if (!po) return { ...base, kind, label: `Pedido de compra ${trimmed} nao existe` };
      return {
        ...base, kind, id: po.id, found: true,
        label: po.id, status: po.status, data: { purchaseOrder: po },
      };
    }
    default:
      return base;
  }
}

/** Trilha de leituras da coletora (auditoria de RF). */
export async function logScan(params: {
  raw: string; resolved: ResolvedScan; operation: string;
  contextRef?: string; result: "OK" | "REJECTED"; message?: string;
  operatorId?: string; deviceId?: string;
}): Promise<string> {
  const at = nowIso();
  const n = (await scalar<number>(`SELECT COUNT(*) FROM scan_events`) ?? 0) + 1;
  const id = `SCN-${String(n).padStart(8, "0")}`;
  await insert("scan_events", {
    id, raw_code: params.raw,
    resolved_kind: params.resolved.kind, resolved_id: params.resolved.id,
    operation: params.operation, context_ref: params.contextRef ?? null,
    result: params.result, message: params.message ?? null,
    operator_id: params.operatorId ?? null, device_id: params.deviceId ?? null,
    occurred_at: at,
  });
  return id;
}

export async function recentScans(limit = 30) {
  return await all<any>(
    `SELECT s.*, o.name AS operator_name FROM scan_events s
       LEFT JOIN operators o ON o.id = s.operator_id
      ORDER BY s.occurred_at DESC, s.id DESC LIMIT ?`,
    limit,
  );
}

export async function scanStats() {
  const total = await scalar<number>(`SELECT COUNT(*) FROM scan_events`) ?? 0;
  const rejected = await scalar<number>(`SELECT COUNT(*) FROM scan_events WHERE result = 'REJECTED'`) ?? 0;
  return { total, rejected, ok: total - rejected, rejectRate: total ? (rejected / total) * 100 : 0 };
}
