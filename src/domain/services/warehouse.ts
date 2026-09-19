import { all, one, run, scalar } from "@/lib/db";
import { nowIso } from "@/lib/format";
import { audit } from "./audit";

export interface Zone {
  id: string; warehouse_id: string; code: string; name: string;
  kind: string; temperature: string; abc_class: string | null; sort_order: number;
}

export interface Location {
  id: string; code: string; warehouse_id: string; zone_id: string;
  aisle: string; rack: string; level: string; position: string;
  kind: string; status: string;
  capacity_pallets: number; capacity_units: number; max_weight_kg: number;
  pick_sequence: number; blocked_reason: string | null; created_at: string;
}

export interface LocationOccupancy extends Location {
  zone_name: string;
  zone_kind: string;
  pallet_id: string | null;
  product_id: string | null;
  sku: string | null;
  description: string | null;
  lot_code: string | null;
  expires_at: string | null;
  qty: number;
  reserved: number;
  weight_kg: number;
  sku_count: number;
  occupancy_pct: number;
}

export function listZones(): Zone[] {
  return all<Zone>(`SELECT * FROM zones ORDER BY sort_order, code`);
}

export function getZone(id: string): Zone | undefined {
  return one<Zone>(`SELECT * FROM zones WHERE id = ?`, id);
}

export function getLocation(id: string): Location | undefined {
  return one<Location>(`SELECT * FROM locations WHERE id = ?`, id);
}

export function getLocationByCode(code: string): Location | undefined {
  return one<Location>(`SELECT * FROM locations WHERE code = ?`, code);
}

/**
 * Mapa do armazem: UMA linha por endereco, com a ocupacao consolidada.
 * Um endereco pode guardar mais de um SKU/lote, entao o conteudo e
 * agregado aqui — caso contrario o mesmo endereco apareceria repetido no
 * mapa, uma vez por registro de estoque.
 */
export function locationMap(filter?: { zoneId?: string; status?: string; search?: string }): LocationOccupancy[] {
  const where: string[] = [];
  const params: any[] = [];
  if (filter?.zoneId) { where.push("l.zone_id = ?"); params.push(filter.zoneId); }
  if (filter?.status) { where.push("l.status = ?"); params.push(filter.status); }
  if (filter?.search) {
    where.push(`(l.code LIKE ? OR l.id LIKE ? OR EXISTS (
        SELECT 1 FROM inventory i2 JOIN products p2 ON p2.id = i2.product_id
         WHERE i2.location_id = l.id AND i2.qty_on_hand > 0 AND p2.sku LIKE ?))`);
    const q = `%${filter.search}%`;
    params.push(q, q, q);
  }

  const rows = all<any>(
    `SELECT l.*, z.name AS zone_name, z.kind AS zone_kind,
            COALESCE(agg.qty, 0)       AS qty,
            COALESCE(agg.reserved, 0)  AS reserved,
            COALESCE(agg.weight, 0)    AS weight_kg,
            COALESCE(agg.skus, 0)      AS sku_count,
            main.pallet_id, main.product_id, main.sku, main.description,
            main.lot_code, main.expires_at
       FROM locations l
       JOIN zones z ON z.id = l.zone_id
       LEFT JOIN (
            SELECT location_id,
                   SUM(qty_on_hand) AS qty,
                   SUM(qty_reserved) AS reserved,
                   SUM(weight_kg) AS weight,
                   COUNT(DISTINCT product_id) AS skus
              FROM inventory WHERE qty_on_hand > 0 GROUP BY location_id
       ) agg ON agg.location_id = l.id
       LEFT JOIN (
            -- item predominante do endereco, para rotular a celula do mapa
            SELECT i.location_id, i.pallet_id, i.product_id, p.sku, p.description,
                   lt.code AS lot_code, lt.expires_at,
                   ROW_NUMBER() OVER (PARTITION BY i.location_id ORDER BY i.qty_on_hand DESC, i.id) AS rn
              FROM inventory i
              JOIN products p ON p.id = i.product_id
              LEFT JOIN lots lt ON lt.id = i.lot_id
             WHERE i.qty_on_hand > 0
       ) main ON main.location_id = l.id AND main.rn = 1
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY z.sort_order, l.code`,
    ...params,
  );

  return rows.map((r) => ({
    ...r,
    occupancy_pct: r.capacity_units > 0
      ? Math.min(100, (r.qty / r.capacity_units) * 100)
      : r.qty > 0 ? 100 : 0,
  }));
}

export interface WarehouseOccupancy {
  totalPositions: number;
  occupied: number;
  available: number;
  blocked: number;
  reserved: number;
  occupancyPct: number;
  byZone: { zoneId: string; zoneCode: string; zoneName: string; total: number; occupied: number; pct: number }[];
}

export function occupancy(): WarehouseOccupancy {
  // Posicoes de armazenagem reais (staging/doca nao contam como posicao-palete).
  const base = `FROM locations l JOIN zones z ON z.id = l.zone_id WHERE l.kind = 'PALLET'`;
  const total = scalar<number>(`SELECT COUNT(*) ${base}`) ?? 0;
  const occupied = scalar<number>(`SELECT COUNT(*) ${base} AND l.status = 'OCCUPIED'`) ?? 0;
  const blocked = scalar<number>(`SELECT COUNT(*) ${base} AND l.status = 'BLOCKED'`) ?? 0;
  const reserved = scalar<number>(`SELECT COUNT(*) ${base} AND l.status = 'RESERVED'`) ?? 0;
  const byZone = all<any>(
    `SELECT z.id AS zoneId, z.code AS zoneCode, z.name AS zoneName,
            COUNT(*) AS total,
            SUM(CASE WHEN l.status = 'OCCUPIED' THEN 1 ELSE 0 END) AS occupied
       ${base}
      GROUP BY z.id ORDER BY z.sort_order`,
  ).map((z) => ({ ...z, pct: z.total ? (z.occupied / z.total) * 100 : 0 }));

  return {
    totalPositions: total,
    occupied,
    available: total - occupied - blocked - reserved,
    blocked,
    reserved,
    occupancyPct: total ? (occupied / total) * 100 : 0,
    byZone,
  };
}

// ------------------------------------------------------------------ put-away
export interface PutawaySuggestion {
  locationId: string;
  code: string;
  zoneName: string;
  score: number;
  reason: string;
}

/**
 * Sugestao de endereco para armazenagem.
 * Criterios, em ordem:
 *   1. zona compativel com a classe ABC do produto (giro)
 *   2. consolidacao: endereco proximo a outro do mesmo SKU
 *   3. menor nivel (ergonomia / acesso)
 *   4. menor sequencia de picking (rota mais curta)
 */
export function suggestLocation(productId: string, palletId?: string): PutawaySuggestion | null {
  const product = one<any>(`SELECT * FROM products WHERE id = ?`, productId);
  if (!product) return null;

  const free = all<any>(
    `SELECT l.*, z.name AS zone_name, z.abc_class AS zone_abc, z.kind AS zone_kind
       FROM locations l
       JOIN zones z ON z.id = l.zone_id
      WHERE l.kind = 'PALLET'
        AND l.status = 'AVAILABLE'
        AND z.kind IN ('PICKING','STORAGE')
        AND NOT EXISTS (SELECT 1 FROM inventory i WHERE i.location_id = l.id AND i.qty_on_hand > 0)
        AND NOT EXISTS (SELECT 1 FROM storage_orders s
                         WHERE s.suggested_location_id = l.id AND s.status IN ('PENDING','IN_PROGRESS'))
      ORDER BY l.pick_sequence`,
  );
  if (free.length === 0) return null;

  // Aisles ja utilizados por este SKU -> consolidacao.
  const sameSkuAisles = new Set(
    all<{ aisle: string; zone_id: string }>(
      `SELECT DISTINCT l.aisle, l.zone_id FROM inventory i
         JOIN locations l ON l.id = i.location_id
        WHERE i.product_id = ? AND i.qty_on_hand > 0`,
      productId,
    ).map((r) => `${r.zone_id}:${r.aisle}`),
  );

  let best: PutawaySuggestion | null = null;
  for (const l of free) {
    let score = 0;
    const reasons: string[] = [];
    if (l.zone_abc && l.zone_abc === product.abc_class) {
      score += 100;
      reasons.push(`zona ${l.zone_name} (classe ${product.abc_class})`);
    }
    if (sameSkuAisles.has(`${l.zone_id}:${l.aisle}`)) {
      score += 50;
      reasons.push(`consolidacao no corredor ${l.aisle}`);
    }
    score += Math.max(0, 20 - Number(l.level) * 5);
    if (Number(l.level) <= 2) reasons.push(`nivel ${l.level} de facil acesso`);
    score += Math.max(0, 15 - l.pick_sequence / 100);

    if (!best || score > best.score) {
      best = {
        locationId: l.id,
        code: l.code,
        zoneName: l.zone_name,
        score,
        reason: reasons.length ? reasons.join(", ") : "primeiro endereco livre na rota",
      };
    }
  }
  return best;
}

export function setLocationStatus(
  locationId: string, status: string, reason?: string, actor = "SISTEMA",
) {
  const before = getLocation(locationId);
  if (!before) return;
  run(
    `UPDATE locations SET status = ?, blocked_reason = ? WHERE id = ?`,
    status, status === "BLOCKED" ? (reason ?? null) : null, locationId,
  );
  audit({
    actor, action: "UPDATE", entity: "location", entityId: locationId,
    before: { status: before.status }, after: { status, reason },
    detail: `Endereco ${before.code}: ${before.status} -> ${status}`,
  });
}

// ------------------------------------------------------------------ docas
export interface Dock {
  id: string; warehouse_id: string; name: string; kind: string;
  status: string; current_ref: string | null;
}

export function listDocks(): Dock[] {
  return all<Dock>(`SELECT * FROM docks ORDER BY id`);
}

export function setDock(dockId: string, status: string, ref?: string | null) {
  run(`UPDATE docks SET status = ?, current_ref = ? WHERE id = ?`, status, ref ?? null, dockId);
}

/** Enderecos de sistema usados pelos fluxos (staging de entrada/saida). */
export const SYSTEM_LOCATIONS = {
  RECEIVING: "END-R010101",
  SHIPPING: "END-E010101",
} as const;

export function receivingLocation(): string {
  return SYSTEM_LOCATIONS.RECEIVING;
}

export function shippingLocation(): string {
  return SYSTEM_LOCATIONS.SHIPPING;
}

export function locationDetail(id: string) {
  const loc = one<any>(
    `SELECT l.*, z.name AS zone_name, z.kind AS zone_kind, z.temperature
       FROM locations l JOIN zones z ON z.id = l.zone_id WHERE l.id = ?`,
    id,
  );
  if (!loc) return null;
  const contents = all<any>(
    `SELECT i.*, p.sku, p.description, p.unit, lt.code AS lot_code, lt.expires_at
       FROM inventory i
       JOIN products p ON p.id = i.product_id
       LEFT JOIN lots lt ON lt.id = i.lot_id
      WHERE i.location_id = ? AND i.qty_on_hand > 0`,
    id,
  );
  const lastMoves = all<any>(
    `SELECT m.*, p.sku FROM inventory_movements m
       JOIN products p ON p.id = m.product_id
      WHERE m.from_location_id = ? OR m.to_location_id = ?
      ORDER BY m.occurred_at DESC LIMIT 15`,
    id, id,
  );
  return { location: loc, contents, lastMoves };
}

export function countLocations(): number {
  return scalar<number>(`SELECT COUNT(*) FROM locations WHERE kind = 'PALLET'`) ?? 0;
}

export function touchLocation(id: string) {
  run(`UPDATE locations SET status = status WHERE id = ?`, id);
  return nowIso();
}
