import { all, one, run, insert, scalar, tx } from "@/lib/db";
import { nextId, PREFIX } from "@/lib/ids";
import { nowIso, round3 } from "@/lib/format";
import { audit } from "./audit";
import { applyMovement } from "./inventory";
import { shippingLocation, setDock } from "./warehouse";
import { openIncident } from "./incidents";
import { setOrderStatus } from "./orders";
import {
  assertTransition, MANIFEST_TRANSITIONS, type ManifestStatus,
} from "@/domain/states";

export class ShippingError extends Error {
  readonly code: string;
  constructor(message: string, code = "SHIPPING_ERROR") {
    super(message);
    this.name = "ShippingError";
    this.code = code;
  }
}

// =================================================== CONFERENCIA DE EXPEDICAO
/**
 * Compara Pedido x Picking x Packing.
 * Enquanto houver divergencia nao tratada o pedido nao avanca para
 * READY_TO_LOAD — e este o portao que impede expedir errado.
 */
export function startShippingCheck(orderId: string, operatorId: string): string {
  return tx(() => {
    const at = nowIso();
    const existing = one<any>(
      `SELECT * FROM shipping_checks WHERE sales_order_id = ? AND status = 'IN_PROGRESS'`,
      orderId,
    );
    if (existing) return existing.id;

    const items = all<any>(
      `SELECT si.*, p.sku FROM sales_order_items si JOIN products p ON p.id = si.product_id
        WHERE si.sales_order_id = ? ORDER BY si.line_no`,
      orderId,
    );
    if (items.length === 0) throw new ShippingError("Pedido sem itens", "NO_ITEMS");

    const id = nextId(PREFIX.SHIPPING_CHECK);
    insert("shipping_checks", {
      id, sales_order_id: orderId, status: "IN_PROGRESS",
      operator_id: operatorId, started_at: at, divergence_count: 0,
    });
    for (const it of items) {
      insert("shipping_check_items", {
        id: `${id}-${it.product_id}`,
        check_id: id, product_id: it.product_id,
        ordered_qty: it.quantity, picked_qty: it.picked_qty, packed_qty: it.packed_qty,
        checked_qty: 0, divergence: 0, status: "PENDING",
      });
    }
    audit({
      actor: operatorId, action: "CHECK", entity: "shipping_check", entityId: id,
      after: { order: orderId, lines: items.length },
      detail: `Conferencia de expedicao iniciada para ${orderId}`,
    });
    return id;
  });
}

export function getShippingCheck(id: string) {
  const check = one<any>(
    `SELECT sc.*, so.id AS order_id, c.name AS customer_name, o.name AS operator_name
       FROM shipping_checks sc
       JOIN sales_orders so ON so.id = sc.sales_order_id
       JOIN customers c ON c.id = so.customer_id
       LEFT JOIN operators o ON o.id = sc.operator_id
      WHERE sc.id = ?`,
    id,
  );
  if (!check) return null;
  const items = all<any>(
    `SELECT ci.*, p.sku, p.description, p.unit FROM shipping_check_items ci
       JOIN products p ON p.id = ci.product_id WHERE ci.check_id = ?`,
    id,
  );
  const volumes = all<any>(
    `SELECT * FROM volumes WHERE sales_order_id = ? AND status <> 'CANCELLED' ORDER BY sequence`,
    check.sales_order_id,
  );
  return { check, items, volumes };
}

/** BIP de volume na conferencia de expedicao: soma o conteudo do volume. */
export function checkVolume(params: {
  checkId: string; volumeCode: string; operatorId: string;
}) {
  return tx(() => {
    const at = nowIso();
    const check = one<any>(`SELECT * FROM shipping_checks WHERE id = ?`, params.checkId);
    if (!check) throw new ShippingError("Conferencia inexistente", "NOT_FOUND");

    const code = params.volumeCode.trim().toUpperCase();
    const vol = one<any>(`SELECT * FROM volumes WHERE id = ?`, code);
    if (!vol) {
      return { ok: false, code: "UNKNOWN_VOLUME", message: `Volume "${code}" nao existe.` };
    }
    if (vol.sales_order_id !== check.sales_order_id) {
      audit({
        actor: params.operatorId, action: "SCAN", entity: "shipping_check", entityId: params.checkId,
        after: { volume: code, expectedOrder: check.sales_order_id, result: "REJECTED" }, origin: "RF",
        detail: `VOLUME DE OUTRO PEDIDO: ${code} pertence a ${vol.sales_order_id}`,
      });
      return {
        ok: false, code: "WRONG_ORDER",
        message: `VOLUME DE OUTRO PEDIDO. ${code} pertence a ${vol.sales_order_id}.`,
      };
    }
    if (vol.status === "CHECKED") {
      return { ok: false, code: "ALREADY_CHECKED", message: `Volume ${code} ja conferido.` };
    }

    const items = all<any>(`SELECT * FROM volume_items WHERE volume_id = ?`, code);
    for (const it of items) {
      run(
        `UPDATE shipping_check_items SET checked_qty = checked_qty + ? WHERE check_id = ? AND product_id = ?`,
        it.quantity, params.checkId, it.product_id,
      );
    }
    run(`UPDATE volumes SET status = 'CHECKED', checked_at = ? WHERE id = ?`, at, code);

    audit({
      actor: params.operatorId, action: "CHECK", entity: "volume", entityId: code,
      after: { checked: true, lines: items.length }, origin: "RF",
      detail: `Volume ${code} conferido na expedicao`,
    });

    const remaining = scalar<number>(
      `SELECT COUNT(*) FROM volumes WHERE sales_order_id = ? AND status = 'CLOSED'`,
      check.sales_order_id,
    ) ?? 0;
    return {
      ok: true, code: "OK",
      message: `Volume ${code} conferido (${items.length} item(ns)).`,
      remaining,
    };
  });
}

export function finishShippingCheck(checkId: string, operatorId: string) {
  return tx(() => {
    const at = nowIso();
    const check = one<any>(`SELECT * FROM shipping_checks WHERE id = ?`, checkId);
    if (!check) throw new ShippingError("Conferencia inexistente", "NOT_FOUND");

    const items = all<any>(
      `SELECT ci.*, p.sku FROM shipping_check_items ci JOIN products p ON p.id = ci.product_id
        WHERE ci.check_id = ?`,
      checkId,
    );
    let divergences = 0;
    for (const it of items) {
      const divergence = round3(it.checked_qty - it.ordered_qty);
      const status = divergence === 0 ? "OK" : "DIVERGENCE";
      if (divergence !== 0) divergences++;
      run(
        `UPDATE shipping_check_items SET divergence = ?, status = ? WHERE id = ?`,
        divergence, status, it.id,
      );
      if (divergence !== 0) {
        openIncident({
          kind: "SHIPPING_DIVERGENCE",
          severity: "ALTA",
          refKind: "SALES_ORDER", refId: check.sales_order_id,
          salesOrderId: check.sales_order_id, productId: it.product_id, quantity: divergence,
          description:
            `${it.sku}: pedido ${it.ordered_qty}, coletado ${it.picked_qty}, embalado ${it.packed_qty}, conferido ${it.checked_qty}`,
          operatorId,
        });
      }
    }

    const openVolumes = scalar<number>(
      `SELECT COUNT(*) FROM volumes WHERE sales_order_id = ? AND status IN ('OPEN','CLOSED')`,
      check.sales_order_id,
    ) ?? 0;
    if (openVolumes > 0) {
      throw new ShippingError(
        `Ha ${openVolumes} volume(s) nao conferido(s). Bipe todos os volumes.`,
        "VOLUMES_PENDING",
      );
    }

    const status = divergences > 0 ? "DIVERGENCE" : "OK";
    run(
      `UPDATE shipping_checks SET status = ?, finished_at = ?, divergence_count = ? WHERE id = ?`,
      status, at, divergences, checkId,
    );

    if (divergences === 0) {
      const order = one<any>(`SELECT status FROM sales_orders WHERE id = ?`, check.sales_order_id);
      if (order?.status === "CHECKING") {
        setOrderStatus(check.sales_order_id, "READY_TO_LOAD", operatorId);
      }
    }

    audit({
      actor: operatorId, action: "CHECK", entity: "shipping_check", entityId: checkId,
      after: { status, divergences },
      detail: `Conferencia de expedicao encerrada: ${divergences} divergencia(s)`,
    });
    return { status, divergences };
  });
}

// ================================================================== ROMANEIO
export function createManifest(params: {
  warehouseId: string; route: string; carrier?: string;
  vehiclePlate?: string; vehicleKind?: string;
  driverName?: string; driverDoc?: string;
  dockId?: string; scheduledAt?: string; actor: string; id?: string;
}): string {
  return tx(() => {
    const at = nowIso();
    const id = params.id ?? nextId(PREFIX.MANIFEST);
    insert("shipping_manifests", {
      id, warehouse_id: params.warehouseId, status: "DRAFT", route: params.route,
      carrier: params.carrier ?? null, vehicle_plate: params.vehiclePlate ?? null,
      vehicle_kind: params.vehicleKind ?? null, driver_name: params.driverName ?? null,
      driver_doc: params.driverDoc ?? null, dock_id: params.dockId ?? null,
      total_orders: 0, total_volumes: 0, total_weight_kg: 0, total_value: 0,
      scheduled_at: params.scheduledAt ?? null, created_at: at, created_by: params.actor,
    });
    audit({
      actor: params.actor, action: "CREATE", entity: "shipping_manifest", entityId: id,
      after: { route: params.route, vehicle: params.vehiclePlate },
      detail: `Romaneio ${id} criado (rota ${params.route})`,
    });
    return id;
  });
}

export function addOrderToManifest(params: {
  manifestId: string; orderId: string; actor: string;
}) {
  return tx(() => {
    const manifest = one<any>(`SELECT * FROM shipping_manifests WHERE id = ?`, params.manifestId);
    if (!manifest) throw new ShippingError("Romaneio inexistente", "NOT_FOUND");
    if (manifest.status !== "DRAFT") {
      throw new ShippingError("Romaneio ja liberado — nao aceita novos pedidos", "MANIFEST_CLOSED");
    }
    const order = one<any>(`SELECT * FROM sales_orders WHERE id = ?`, params.orderId);
    if (!order) throw new ShippingError("Pedido inexistente", "NO_ORDER");
    if (order.status !== "READY_TO_LOAD") {
      throw new ShippingError(
        `Pedido ${params.orderId} nao esta pronto para carregar (status ${order.status}). Conclua a conferencia de expedicao.`,
        "ORDER_NOT_READY",
      );
    }
    const dup = one<any>(
      `SELECT id FROM manifest_orders WHERE manifest_id = ? AND sales_order_id = ?`,
      params.manifestId, params.orderId,
    );
    if (dup) return;
    const elsewhere = one<any>(
      `SELECT manifest_id FROM manifest_orders WHERE sales_order_id = ?`, params.orderId,
    );
    if (elsewhere) {
      throw new ShippingError(
        `Pedido ja consta no romaneio ${elsewhere.manifest_id}`, "ALREADY_IN_MANIFEST",
      );
    }

    const stats = one<any>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(gross_weight_kg),0) AS w
         FROM volumes WHERE sales_order_id = ? AND status <> 'CANCELLED'`,
      params.orderId,
    );
    const seq = (scalar<number>(
      `SELECT COUNT(*) FROM manifest_orders WHERE manifest_id = ?`, params.manifestId,
    ) ?? 0) + 1;

    insert("manifest_orders", {
      id: `${params.manifestId}-${params.orderId}`,
      manifest_id: params.manifestId, sales_order_id: params.orderId,
      stop_sequence: seq, volumes: stats.n, weight_kg: round3(stats.w),
    });
    recalcManifest(params.manifestId);
    audit({
      actor: params.actor, action: "UPDATE", entity: "shipping_manifest", entityId: params.manifestId,
      after: { added: params.orderId, volumes: stats.n },
      detail: `Pedido ${params.orderId} incluido no romaneio ${params.manifestId}`,
    });
  });
}

export function removeOrderFromManifest(manifestId: string, orderId: string, actor: string) {
  return tx(() => {
    const manifest = one<any>(`SELECT status FROM shipping_manifests WHERE id = ?`, manifestId);
    if (manifest?.status !== "DRAFT") {
      throw new ShippingError("Romaneio ja liberado", "MANIFEST_CLOSED");
    }
    run(`DELETE FROM manifest_orders WHERE manifest_id = ? AND sales_order_id = ?`, manifestId, orderId);
    recalcManifest(manifestId);
    audit({
      actor, action: "UPDATE", entity: "shipping_manifest", entityId: manifestId,
      after: { removed: orderId }, detail: `Pedido ${orderId} removido do romaneio`,
    });
  });
}

function recalcManifest(manifestId: string) {
  const stats = one<any>(
    `SELECT COUNT(*) AS orders, COALESCE(SUM(mo.volumes),0) AS volumes,
            COALESCE(SUM(mo.weight_kg),0) AS weight,
            COALESCE(SUM(so.total_value),0) AS value
       FROM manifest_orders mo JOIN sales_orders so ON so.id = mo.sales_order_id
      WHERE mo.manifest_id = ?`,
    manifestId,
  );
  run(
    `UPDATE shipping_manifests SET total_orders = ?, total_volumes = ?,
            total_weight_kg = ?, total_value = ? WHERE id = ?`,
    stats.orders, stats.volumes, round3(stats.weight),
    Math.round(stats.value * 100) / 100, manifestId,
  );
}

function setManifestStatus(id: string, to: ManifestStatus, actor: string, extra: Record<string, any> = {}) {
  const cur = one<{ status: ManifestStatus }>(`SELECT status FROM shipping_manifests WHERE id = ?`, id);
  if (!cur) throw new ShippingError("Romaneio inexistente", "NOT_FOUND");
  assertTransition("shipping_manifest", MANIFEST_TRANSITIONS, cur.status, to);
  const keys = Object.keys(extra);
  run(
    `UPDATE shipping_manifests SET status = ?${keys.map((k) => `, ${k} = ?`).join("")} WHERE id = ?`,
    to, ...keys.map((k) => extra[k]), id,
  );
  audit({
    actor, action: to === "SHIPPED" ? "SHIP" : "UPDATE",
    entity: "shipping_manifest", entityId: id,
    before: { status: cur.status }, after: { status: to, ...extra },
    detail: `Romaneio ${id}: ${cur.status} -> ${to}`,
  });
}

export function releaseManifest(manifestId: string, actor: string) {
  return tx(() => {
    const orders = scalar<number>(
      `SELECT COUNT(*) FROM manifest_orders WHERE manifest_id = ?`, manifestId,
    ) ?? 0;
    if (orders === 0) throw new ShippingError("Romaneio sem pedidos", "EMPTY_MANIFEST");
    const m = one<any>(`SELECT * FROM shipping_manifests WHERE id = ?`, manifestId);
    if (!m.vehicle_plate || !m.driver_name) {
      throw new ShippingError("Informe veiculo e motorista antes de liberar", "MISSING_VEHICLE");
    }
    setManifestStatus(manifestId, "READY", actor);
    return true;
  });
}

export function listManifests(filter: { status?: string; search?: string } = {}) {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.status) { where.push("m.status = ?"); params.push(filter.status); }
  if (filter.search) {
    where.push("(m.id LIKE ? OR m.route LIKE ? OR m.vehicle_plate LIKE ? OR m.driver_name LIKE ?)");
    const q = `%${filter.search}%`;
    params.push(q, q, q, q);
  }
  return all<any>(
    `SELECT m.*, d.name AS dock_name,
            (SELECT COUNT(*) FROM loading_operations lo WHERE lo.manifest_id = m.id) AS loading_count,
            (SELECT lo.id FROM loading_operations lo WHERE lo.manifest_id = m.id ORDER BY lo.created_at DESC LIMIT 1) AS loading_id,
            (SELECT td.id FROM transport_documents td WHERE td.manifest_id = m.id LIMIT 1) AS transport_doc_id
       FROM shipping_manifests m
       LEFT JOIN docks d ON d.id = m.dock_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY m.created_at DESC`,
    ...params,
  );
}

export function getManifest(id: string) {
  const manifest = one<any>(
    `SELECT m.*, d.name AS dock_name, w.name AS warehouse_name, w.address AS warehouse_address,
            w.city AS warehouse_city, w.state AS warehouse_state
       FROM shipping_manifests m
       LEFT JOIN docks d ON d.id = m.dock_id
       LEFT JOIN warehouses w ON w.id = m.warehouse_id
      WHERE m.id = ?`,
    id,
  );
  if (!manifest) return null;
  const orders = all<any>(
    `SELECT mo.*, so.id AS order_id, so.total_value, so.due_at, so.priority,
            c.name AS customer_name, c.cnpj AS customer_cnpj, c.city, c.state, c.address, c.zip
       FROM manifest_orders mo
       JOIN sales_orders so ON so.id = mo.sales_order_id
       JOIN customers c ON c.id = so.customer_id
      WHERE mo.manifest_id = ? ORDER BY mo.stop_sequence`,
    id,
  ).map((o) => ({
    ...o,
    volumeList: all<any>(
      `SELECT * FROM volumes WHERE sales_order_id = ? AND status <> 'CANCELLED' ORDER BY sequence`,
      o.sales_order_id,
    ),
  }));
  const loading = one<any>(
    `SELECT lo.*, o.name AS operator_name FROM loading_operations lo
       LEFT JOIN operators o ON o.id = lo.operator_id
      WHERE lo.manifest_id = ? ORDER BY lo.created_at DESC LIMIT 1`,
    id,
  );
  const transportDoc = one<any>(`SELECT * FROM transport_documents WHERE manifest_id = ?`, id);
  return { manifest, orders, loading, transportDoc };
}

export function eligibleOrdersForManifest() {
  return all<any>(
    `SELECT so.*, c.name AS customer_name, c.city, c.state,
            (SELECT COUNT(*) FROM volumes v WHERE v.sales_order_id = so.id AND v.status <> 'CANCELLED') AS volume_count
       FROM sales_orders so JOIN customers c ON c.id = so.customer_id
      WHERE so.status = 'READY_TO_LOAD'
        AND NOT EXISTS (SELECT 1 FROM manifest_orders mo WHERE mo.sales_order_id = so.id)
      ORDER BY so.due_at`,
  );
}

// ================================================================ CARREGAMENTO
export function startLoading(params: {
  manifestId: string; dockId?: string; operatorId: string; equipmentId?: string;
}): string {
  return tx(() => {
    const at = nowIso();
    const manifest = one<any>(`SELECT * FROM shipping_manifests WHERE id = ?`, params.manifestId);
    if (!manifest) throw new ShippingError("Romaneio inexistente", "NOT_FOUND");
    if (manifest.status !== "READY") {
      throw new ShippingError(
        `Romaneio precisa estar liberado (status atual ${manifest.status})`, "MANIFEST_NOT_READY",
      );
    }
    const existing = one<any>(
      `SELECT * FROM loading_operations WHERE manifest_id = ? AND status = 'IN_PROGRESS'`,
      params.manifestId,
    );
    if (existing) return existing.id;

    const expected = scalar<number>(
      `SELECT COUNT(*) FROM volumes v JOIN manifest_orders mo ON mo.sales_order_id = v.sales_order_id
        WHERE mo.manifest_id = ? AND v.status <> 'CANCELLED'`,
      params.manifestId,
    ) ?? 0;

    const id = nextId(PREFIX.LOADING);
    insert("loading_operations", {
      id, manifest_id: params.manifestId, dock_id: params.dockId ?? manifest.dock_id,
      status: "IN_PROGRESS", operator_id: params.operatorId, equipment_id: params.equipmentId ?? null,
      expected_volumes: expected, loaded_volumes: 0, started_at: at, created_at: at,
    });
    setManifestStatus(params.manifestId, "LOADING", params.operatorId, {
      dock_id: params.dockId ?? manifest.dock_id,
    });
    if (params.dockId ?? manifest.dock_id) {
      setDock(params.dockId ?? manifest.dock_id, "OCCUPIED", params.manifestId);
    }
    for (const o of all<any>(
      `SELECT sales_order_id FROM manifest_orders WHERE manifest_id = ?`, params.manifestId,
    )) {
      const st = one<any>(`SELECT status FROM sales_orders WHERE id = ?`, o.sales_order_id);
      if (st?.status === "READY_TO_LOAD") setOrderStatus(o.sales_order_id, "LOADING", params.operatorId);
    }
    audit({
      actor: params.operatorId, action: "LOAD", entity: "loading_operation", entityId: id,
      after: { manifest: params.manifestId, expected },
      detail: `Carregamento ${id} iniciado (${expected} volumes previstos)`,
    });
    return id;
  });
}

/** BIP de volume no carregamento. Valida se pertence ao romaneio. */
export function scanVolumeForLoading(params: {
  loadingId: string; volumeCode: string; operatorId: string;
}) {
  return tx(() => {
    const at = nowIso();
    const lo = one<any>(`SELECT * FROM loading_operations WHERE id = ?`, params.loadingId);
    if (!lo) throw new ShippingError("Carregamento inexistente", "NOT_FOUND");
    if (lo.status !== "IN_PROGRESS") {
      return { ok: false, code: "NOT_ACTIVE", message: "Carregamento nao esta em andamento." };
    }

    const code = params.volumeCode.trim().toUpperCase();
    const vol = one<any>(`SELECT * FROM volumes WHERE id = ?`, code);
    if (!vol) {
      audit({
        actor: params.operatorId, action: "SCAN", entity: "loading_operation", entityId: params.loadingId,
        after: { read: code, result: "REJECTED" }, origin: "RF",
        detail: `VOLUME INEXISTENTE: ${code}`,
      });
      return { ok: false, code: "UNKNOWN_VOLUME", message: `VOLUME INEXISTENTE: ${code}.` };
    }
    const belongs = one<any>(
      `SELECT 1 AS ok FROM manifest_orders WHERE manifest_id = ? AND sales_order_id = ?`,
      lo.manifest_id, vol.sales_order_id,
    );
    if (!belongs) {
      audit({
        actor: params.operatorId, action: "SCAN", entity: "loading_operation", entityId: params.loadingId,
        after: { read: code, manifest: lo.manifest_id, result: "REJECTED" }, origin: "RF",
        detail: `VOLUME FORA DO ROMANEIO: ${code} (pedido ${vol.sales_order_id})`,
      });
      return {
        ok: false, code: "NOT_IN_MANIFEST",
        message: `VOLUME FORA DO ROMANEIO. ${code} pertence a ${vol.sales_order_id}.`,
      };
    }
    if (vol.status !== "CHECKED" && vol.status !== "LOADED") {
      return {
        ok: false, code: "NOT_CHECKED",
        message: `Volume ${code} nao foi conferido na expedicao (status ${vol.status}).`,
      };
    }
    const dup = one<any>(
      `SELECT id FROM loading_scans WHERE loading_id = ? AND volume_id = ?`,
      params.loadingId, code,
    );
    if (dup) {
      return { ok: false, code: "DUPLICATE", message: `Volume ${code} ja foi carregado.` };
    }

    insert("loading_scans", {
      id: `${params.loadingId}-${code}`, loading_id: params.loadingId, volume_id: code,
      sales_order_id: vol.sales_order_id, scanned_at: at, operator_id: params.operatorId,
    });
    run(`UPDATE volumes SET status = 'LOADED', loaded_at = ? WHERE id = ?`, at, code);
    const loaded = scalar<number>(
      `SELECT COUNT(*) FROM loading_scans WHERE loading_id = ?`, params.loadingId,
    ) ?? 0;
    run(`UPDATE loading_operations SET loaded_volumes = ? WHERE id = ?`, loaded, params.loadingId);

    audit({
      actor: params.operatorId, action: "LOAD", entity: "volume", entityId: code,
      after: { loading: params.loadingId, result: "OK" }, origin: "RF",
      detail: `Volume ${code} carregado (${loaded}/${lo.expected_volumes})`,
    });
    return {
      ok: true, code: "OK",
      message: `Volume ${code} carregado. ${loaded}/${lo.expected_volumes}.`,
      loaded, expected: lo.expected_volumes,
    };
  });
}

export function completeLoading(params: {
  loadingId: string; seal: string; operatorId: string; allowPartial?: boolean;
}) {
  return tx(() => {
    const at = nowIso();
    const lo = one<any>(`SELECT * FROM loading_operations WHERE id = ?`, params.loadingId);
    if (!lo) throw new ShippingError("Carregamento inexistente", "NOT_FOUND");
    const missing = lo.expected_volumes - lo.loaded_volumes;
    if (missing > 0 && !params.allowPartial) {
      throw new ShippingError(
        `Faltam ${missing} volume(s) para concluir o carregamento.`, "MISSING_VOLUMES",
      );
    }
    if (!params.seal?.trim()) throw new ShippingError("Informe o numero do lacre", "NO_SEAL");

    const status = missing > 0 ? "DIVERGENCE" : "COMPLETED";
    run(
      `UPDATE loading_operations SET status = ?, seal = ?, completed_at = ? WHERE id = ?`,
      status, params.seal.trim(), at, params.loadingId,
    );
    if (missing > 0) {
      openIncident({
        kind: "SHIPPING_DIVERGENCE", severity: "ALTA",
        refKind: "LOADING", refId: params.loadingId, quantity: missing,
        description: `Carregamento concluido com ${missing} volume(s) faltante(s)`,
        operatorId: params.operatorId,
      });
    }
    setManifestStatus(lo.manifest_id, "LOADED", params.operatorId, {
      seal: params.seal.trim(),
    });
    for (const o of all<any>(
      `SELECT sales_order_id FROM manifest_orders WHERE manifest_id = ?`, lo.manifest_id,
    )) {
      const st = one<any>(`SELECT status FROM sales_orders WHERE id = ?`, o.sales_order_id);
      if (st?.status === "LOADING") setOrderStatus(o.sales_order_id, "LOADED", params.operatorId);
    }
    audit({
      actor: params.operatorId, action: "LOAD", entity: "loading_operation", entityId: params.loadingId,
      after: { status, seal: params.seal, loaded: lo.loaded_volumes, expected: lo.expected_volumes },
      detail: `Carregamento ${params.loadingId} concluido (lacre ${params.seal})`,
    });
    return { status, missing };
  });
}

export function getLoading(id: string) {
  const loading = one<any>(
    `SELECT lo.*, m.route, m.vehicle_plate, m.driver_name, m.seal AS manifest_seal,
            d.name AS dock_name, o.name AS operator_name
       FROM loading_operations lo
       JOIN shipping_manifests m ON m.id = lo.manifest_id
       LEFT JOIN docks d ON d.id = lo.dock_id
       LEFT JOIN operators o ON o.id = lo.operator_id
      WHERE lo.id = ?`,
    id,
  );
  if (!loading) return null;
  const expected = all<any>(
    `SELECT v.*, mo.stop_sequence, c.name AS customer_name,
            (SELECT ls.scanned_at FROM loading_scans ls WHERE ls.loading_id = ? AND ls.volume_id = v.id) AS scanned_at
       FROM volumes v
       JOIN manifest_orders mo ON mo.sales_order_id = v.sales_order_id
       JOIN sales_orders so ON so.id = v.sales_order_id
       JOIN customers c ON c.id = so.customer_id
      WHERE mo.manifest_id = ? AND v.status <> 'CANCELLED'
      ORDER BY mo.stop_sequence, v.sequence`,
    id, loading.manifest_id,
  );
  return { loading, expected };
}

// =================================================================== EXPEDICAO
/**
 * Expede o romaneio: baixa definitiva do estoque (SHIP), fecha pedidos e
 * cria os registros de remessa. So roda apos carregamento concluido.
 */
export function shipManifest(manifestId: string, actor: string) {
  return tx(() => {
    const at = nowIso();
    const manifest = one<any>(`SELECT * FROM shipping_manifests WHERE id = ?`, manifestId);
    if (!manifest) throw new ShippingError("Romaneio inexistente", "NOT_FOUND");
    if (manifest.status !== "LOADED") {
      throw new ShippingError(
        `Romaneio precisa estar carregado para expedir (status ${manifest.status})`, "NOT_LOADED",
      );
    }
    const orders = all<any>(
      `SELECT sales_order_id FROM manifest_orders WHERE manifest_id = ?`, manifestId,
    );

    const openChecks = scalar<number>(
      `SELECT COUNT(*) FROM shipping_checks sc
        JOIN manifest_orders mo ON mo.sales_order_id = sc.sales_order_id
       WHERE mo.manifest_id = ? AND sc.status IN ('IN_PROGRESS','DIVERGENCE')`,
      manifestId,
    ) ?? 0;
    if (openChecks > 0) {
      throw new ShippingError(
        `Ha ${openChecks} conferencia(s) de expedicao pendente(s) ou com divergencia.`,
        "CHECK_PENDING",
      );
    }

    const staging = shippingLocation();
    for (const o of orders) {
      const volumes = all<any>(
        `SELECT * FROM volumes WHERE sales_order_id = ? AND status <> 'CANCELLED'`, o.sales_order_id,
      );
      for (const v of volumes) {
        for (const it of all<any>(`SELECT * FROM volume_items WHERE volume_id = ?`, v.id)) {
          applyMovement({
            kind: "SHIP",
            productId: it.product_id,
            lotId: it.lot_id,
            quantity: it.quantity,
            fromLocationId: staging,
            palletId: null,
            refKind: "SHIPMENT",
            refId: o.sales_order_id,
            reason: `Expedicao do volume ${v.id} (romaneio ${manifestId})`,
            operatorId: actor,
            occurredAt: at,
          });
          run(
            `UPDATE sales_order_items SET shipped_qty = shipped_qty + ?
              WHERE sales_order_id = ? AND product_id = ?`,
            it.quantity, o.sales_order_id, it.product_id,
          );
        }
        run(`UPDATE volumes SET status = 'SHIPPED' WHERE id = ?`, v.id);
      }

      const stats = one<any>(
        `SELECT COUNT(*) AS n, COALESCE(SUM(gross_weight_kg),0) AS w
           FROM volumes WHERE sales_order_id = ? AND status <> 'CANCELLED'`,
        o.sales_order_id,
      );
      const shipId = nextId(PREFIX.SHIPMENT);
      insert("shipments", {
        id: shipId, sales_order_id: o.sales_order_id, manifest_id: manifestId,
        status: "SHIPPED", volumes: stats.n, weight_kg: round3(stats.w),
        shipped_at: at, created_at: at,
      });
      run(`UPDATE volumes SET shipment_id = ? WHERE sales_order_id = ?`, shipId, o.sales_order_id);
      setOrderStatus(o.sales_order_id, "SHIPPED", actor, { shipped_at: at });
    }

    setManifestStatus(manifestId, "SHIPPED", actor, { departed_at: at });
    if (manifest.dock_id) setDock(manifest.dock_id, "FREE", null);

    audit({
      actor, action: "SHIP", entity: "shipping_manifest", entityId: manifestId,
      after: { orders: orders.length, at },
      detail: `Romaneio ${manifestId} expedido com ${orders.length} pedido(s)`,
    });
    return { orders: orders.length };
  });
}

// ========================================================= DOCUMENTO TRANSPORTE
export function createTransportDocument(manifestId: string, actor: string): string {
  return tx(() => {
    const at = nowIso();
    const existing = one<any>(`SELECT id FROM transport_documents WHERE manifest_id = ?`, manifestId);
    if (existing) return existing.id;

    const m = one<any>(
      `SELECT m.*, w.name AS wh_name, w.city AS wh_city, w.state AS wh_state
         FROM shipping_manifests m LEFT JOIN warehouses w ON w.id = m.warehouse_id
        WHERE m.id = ?`,
      manifestId,
    );
    if (!m) throw new ShippingError("Romaneio inexistente", "NOT_FOUND");
    const firstStop = one<any>(
      `SELECT c.city FROM manifest_orders mo
         JOIN sales_orders so ON so.id = mo.sales_order_id
         JOIN customers c ON c.id = so.customer_id
        WHERE mo.manifest_id = ? ORDER BY mo.stop_sequence DESC LIMIT 1`,
      manifestId,
    );

    const id = nextId(PREFIX.TRANSPORT_DOC);
    const number = id.split("-")[1];
    insert("transport_documents", {
      id, manifest_id: manifestId, number, series: "001",
      access_key: simulatedKey(id, at),
      issued_at: at,
      sender_id: m.warehouse_id,
      carrier_name: m.carrier ?? "Transportadora Simulada LTDA",
      carrier_cnpj: "11.222.333/0001-81",
      vehicle_plate: m.vehicle_plate, driver_name: m.driver_name, driver_doc: m.driver_doc,
      origin_city: m.wh_city, destination_city: firstStop?.city ?? m.route,
      total_volumes: m.total_volumes, total_weight_kg: m.total_weight_kg,
      total_value: m.total_value,
      freight_value: Math.round(m.total_weight_kg * 1.85 * 100) / 100,
      simulated: 1, created_at: at,
    });
    audit({
      actor, action: "CREATE", entity: "transport_document", entityId: id,
      after: { manifest: manifestId },
      detail: `Documento de transporte simulado ${id} emitido`,
    });
    return id;
  });
}

/** Chave de 44 digitos puramente simulada (nao ha integracao fiscal real). */
export function simulatedKey(seed: string, at: string): string {
  let h = 0;
  const base = `${seed}|${at}`;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) >>> 0;
  let out = "";
  let x = h || 1;
  while (out.length < 44) {
    x = (x * 1103515245 + 12345) >>> 0;
    out += String(x % 1_000_000_000).padStart(9, "0");
  }
  return out.slice(0, 44);
}

export function getTransportDocument(id: string) {
  const doc = one<any>(`SELECT * FROM transport_documents WHERE id = ?`, id);
  if (!doc) return null;
  const manifest = getManifest(doc.manifest_id);
  return { doc, ...(manifest ?? {}) };
}

export function listShipments() {
  return all<any>(
    `SELECT s.*, so.id AS order_id, c.name AS customer_name, m.route, m.vehicle_plate
       FROM shipments s
       JOIN sales_orders so ON so.id = s.sales_order_id
       JOIN customers c ON c.id = so.customer_id
       LEFT JOIN shipping_manifests m ON m.id = s.manifest_id
      ORDER BY s.shipped_at DESC`,
  );
}
