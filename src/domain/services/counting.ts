import { all, one, run, insert, scalar, tx } from "@/lib/db";
import { nextId, PREFIX } from "@/lib/ids";
import { nowIso, round3 } from "@/lib/format";
import { audit } from "./audit";
import { adjustTo } from "./inventory";
import { openIncident } from "./incidents";

export class CountError extends Error {
  readonly code: string;
  constructor(message: string, code = "COUNT_ERROR") {
    super(message);
    this.name = "CountError";
    this.code = code;
  }
}

/** Cria um inventario ciclico sobre uma zona ou sobre enderecos ocupados. */
export async function createCount(params: {
  kind?: "CYCLIC" | "GENERAL" | "SPOT";
  zoneId?: string;
  locationIds?: string[];
  operatorId: string;
  scope?: string;
}): Promise<string> {
  return await tx(async () => {
    const at = nowIso();
    const id = await nextId(PREFIX.INVENTORY_COUNT);

    let rows: any[];
    if (params.locationIds?.length) {
      const marks = params.locationIds.map(() => "?").join(",");
      rows = await all<any>(
        `SELECT i.*, l.code FROM inventory i JOIN locations l ON l.id = i.location_id
          WHERE i.location_id IN (${marks})`,
        ...params.locationIds,
      );
    } else if (params.zoneId) {
      rows = await all<any>(
        `SELECT i.*, l.code FROM inventory i JOIN locations l ON l.id = i.location_id
          WHERE l.zone_id = ? AND i.qty_on_hand > 0`,
        params.zoneId,
      );
    } else {
      rows = await all<any>(
        `SELECT i.*, l.code FROM inventory i JOIN locations l ON l.id = i.location_id
          WHERE i.qty_on_hand > 0 AND l.kind = 'PALLET'`,
      );
    }
    if (rows.length === 0) throw new CountError("Nenhum endereco elegivel para contagem", "NO_SCOPE");

    await insert("inventory_counts", {
      id, kind: params.kind ?? "CYCLIC", status: "PENDING",
      scope: params.scope ?? (params.zoneId ? `Zona ${params.zoneId}` : "Enderecos ocupados"),
      operator_id: params.operatorId, total_items: rows.length,
      counted_items: 0, divergence_items: 0, created_at: at,
    });
    for (const [idx, r] of rows.entries()) {
      await insert("inventory_count_items", {
        id: `${id}-L${String(idx + 1).padStart(3, "0")}`,
        count_id: id, location_id: r.location_id, product_id: r.product_id,
        lot_id: r.lot_id, system_qty: r.qty_on_hand, counted_qty: null,
        divergence: 0, status: "PENDING", adjusted: 0,
      });
    }
    await audit({
      actor: params.operatorId, action: "COUNT", entity: "inventory_count", entityId: id,
      after: { items: rows.length, scope: params.scope },
      detail: `Inventario ${id} criado com ${rows.length} posicao(oes)`,
    });
    return id;
  });
}

export async function listCounts(filter: { status?: string } = {}) {
  const where = filter.status ? `WHERE ic.status = ?` : "";
  const params = filter.status ? [filter.status] : [];
  return await all<any>(
    `SELECT ic.*, o.name AS operator_name FROM inventory_counts ic
       LEFT JOIN operators o ON o.id = ic.operator_id
      ${where} ORDER BY ic.created_at DESC`,
    ...params,
  );
}

export async function getCount(id: string) {
  const count = await one<any>(
    `SELECT ic.*, o.name AS operator_name FROM inventory_counts ic
       LEFT JOIN operators o ON o.id = ic.operator_id WHERE ic.id = ?`,
    id,
  );
  if (!count) return null;
  const items = await all<any>(
    `SELECT ci.*, l.code AS location_code, p.sku, p.description, p.unit, lt.code AS lot_code
       FROM inventory_count_items ci
       JOIN locations l ON l.id = ci.location_id
       LEFT JOIN products p ON p.id = ci.product_id
       LEFT JOIN lots lt ON lt.id = ci.lot_id
      WHERE ci.count_id = ? ORDER BY l.code`,
    id,
  );
  return { count, items };
}

export async function startCount(id: string, operatorId: string) {
  return await tx(async () => {
    const at = nowIso();
    await run(
      `UPDATE inventory_counts SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, ?),
              operator_id = ? WHERE id = ? AND status = 'PENDING'`,
      at, operatorId, id,
    );
    await audit({
      actor: operatorId, action: "COUNT", entity: "inventory_count", entityId: id,
      after: { status: "IN_PROGRESS" }, detail: `Inventario ${id} iniciado`,
    });
  });
}

/** Proxima posicao a contar (a coletora avanca em ordem de endereco). */
export async function currentCountItem(countId: string) {
  return await one<any>(
    `SELECT ci.*, l.code AS location_code, p.sku, p.description, p.unit
       FROM inventory_count_items ci
       JOIN locations l ON l.id = ci.location_id
       LEFT JOIN products p ON p.id = ci.product_id
      WHERE ci.count_id = ? AND ci.status = 'PENDING'
      ORDER BY l.code LIMIT 1`,
    countId,
  );
}

/** Registra a contagem fisica de uma posicao (contagem cega: nao expoe o saldo). */
export async function countItem(params: {
  countId: string; itemId: string; countedQty: number;
  operatorId: string; origin?: "WEB" | "RF";
}) {
  return await tx(async () => {
    const at = nowIso();
    const item = await one<any>(`SELECT * FROM inventory_count_items WHERE id = ?`, params.itemId);
    if (!item) throw new CountError("Posicao de inventario inexistente", "NOT_FOUND");
    if (item.count_id !== params.countId) throw new CountError("Posicao de outro inventario", "MISMATCH");

    const counted = round3(params.countedQty);
    if (counted < 0) throw new CountError("Quantidade negativa", "BAD_QTY");
    const divergence = round3(counted - item.system_qty);
    const status = divergence === 0 ? "COUNTED" : "DIVERGENCE";

    await run(
      `UPDATE inventory_count_items SET counted_qty = ?, divergence = ?, status = ?,
              counted_at = ?, operator_id = ? WHERE id = ?`,
      counted, divergence, status, at, params.operatorId, params.itemId,
    );

    const totals = await one<any>(
      `SELECT SUM(CASE WHEN status <> 'PENDING' THEN 1 ELSE 0 END) AS counted,
              SUM(CASE WHEN status IN ('DIVERGENCE','ADJUSTED') AND divergence <> 0 THEN 1 ELSE 0 END) AS divs
         FROM inventory_count_items WHERE count_id = ?`,
      params.countId,
    );
    await run(
      `UPDATE inventory_counts SET counted_items = ?, divergence_items = ? WHERE id = ?`,
      totals.counted ?? 0, totals.divs ?? 0, params.countId,
    );

    if (divergence !== 0) {
      const loc = await one<any>(`SELECT code FROM locations WHERE id = ?`, item.location_id);
      const prod = await one<any>(`SELECT sku FROM products WHERE id = ?`, item.product_id);
      await openIncident({
        kind: "COUNT_DIVERGENCE",
        severity: Math.abs(divergence) / Math.max(1, item.system_qty) > 0.1 ? "ALTA" : "MEDIA",
        refKind: "INVENTORY_COUNT", refId: params.countId,
        productId: item.product_id, locationId: item.location_id, quantity: divergence,
        description: `${prod?.sku} em ${loc?.code}: sistema ${item.system_qty}, contado ${counted}`,
        operatorId: params.operatorId,
      });
    }

    await audit({
      actor: params.operatorId, action: "COUNT", entity: "inventory_count_item", entityId: params.itemId,
      after: { system: item.system_qty, counted, divergence },
      origin: params.origin ?? "WEB",
      detail: `Contagem: sistema ${item.system_qty}, fisico ${counted}`,
    });
    return { counted, divergence, status };
  });
}

/** Aplica os ajustes das divergencias e encerra o inventario. */
export async function closeCount(params: { countId: string; operatorId: string; applyAdjustments: boolean }) {
  return await tx(async () => {
    const at = nowIso();
    const pending = await scalar<number>(
      `SELECT COUNT(*) FROM inventory_count_items WHERE count_id = ? AND status = 'PENDING'`,
      params.countId,
    ) ?? 0;
    if (pending > 0) throw new CountError(`Ainda ha ${pending} posicao(oes) sem contagem`, "PENDING_ITEMS");

    const items = await all<any>(
      `SELECT * FROM inventory_count_items WHERE count_id = ?`, params.countId,
    );
    let adjusted = 0;
    if (params.applyAdjustments) {
      for (const it of items) {
        if (it.divergence === 0) continue;
        const inv = await one<any>(
          `SELECT id FROM inventory WHERE location_id = ? AND product_id = ? AND lot_id IS ?`,
          it.location_id, it.product_id, it.lot_id,
        );
        if (!inv) continue;
        await adjustTo({
          inventoryId: inv.id, countedQty: it.counted_qty,
          reason: `Ajuste do inventario ${params.countId}`,
          refKind: "COUNT", refId: params.countId,
          operatorId: params.operatorId, occurredAt: at,
        });
        await run(`UPDATE inventory_count_items SET status = 'ADJUSTED', adjusted = 1 WHERE id = ?`, it.id);
        adjusted++;
      }
    }

    const accuracy = await accuracyOf(params.countId);
    await run(
      `UPDATE inventory_counts SET status = 'COMPLETED', completed_at = ?, accuracy = ? WHERE id = ?`,
      at, accuracy, params.countId,
    );
    await audit({
      actor: params.operatorId, action: "COUNT", entity: "inventory_count", entityId: params.countId,
      after: { accuracy, adjusted, applyAdjustments: params.applyAdjustments },
      detail: `Inventario ${params.countId} encerrado — acuracidade ${accuracy.toFixed(2)}%`,
    });
    return { accuracy, adjusted };
  });
}

/**
 * Acuracidade do inventario: posicoes sem divergencia / posicoes contadas.
 * E esta a base do KPI de acuracidade de estoque do dashboard.
 */
export async function accuracyOf(countId: string): Promise<number> {
  const r = await one<any>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN divergence = 0 THEN 1 ELSE 0 END) AS ok
       FROM inventory_count_items WHERE count_id = ? AND status <> 'PENDING'`,
    countId,
  );
  if (!r?.total) return 100;
  return (r.ok / r.total) * 100;
}

/** Acuracidade consolidada de todos os inventarios concluidos. */
export async function globalAccuracy(): Promise<{ accuracy: number; counted: number; divergent: number }> {
  const r = await one<any>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN ci.divergence = 0 THEN 1 ELSE 0 END) AS ok
       FROM inventory_count_items ci
       JOIN inventory_counts ic ON ic.id = ci.count_id
      WHERE ci.status <> 'PENDING'`,
  );
  const total = r?.total ?? 0;
  const ok = r?.ok ?? 0;
  return {
    accuracy: total ? (ok / total) * 100 : 100,
    counted: total,
    divergent: total - ok,
  };
}
