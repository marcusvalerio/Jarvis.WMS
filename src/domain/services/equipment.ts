import { all, one, run, scalar } from "@/lib/db";
import { nowIso, minutesBetween } from "@/lib/format";
import { audit } from "./audit";
import { openIncident } from "./incidents";
import type { EquipmentStatus } from "@/domain/states";

export interface Equipment {
  id: string; kind: string; model: string; serial: string | null;
  status: EquipmentStatus; assigned_to: string | null;
  monitored_minutes: number; downtime_minutes: number;
  last_event_at: string | null; created_at: string;
}

export function listEquipment(filter: { kind?: string; status?: string } = {}) {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.kind) { where.push("e.kind = ?"); params.push(filter.kind); }
  if (filter.status) { where.push("e.status = ?"); params.push(filter.status); }
  return all<any>(
    `SELECT e.*, o.name AS operator_name FROM equipment e
       LEFT JOIN operators o ON o.id = e.assigned_to
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY e.kind, e.id`,
    ...params,
  );
}

export function getEquipment(id: string): Equipment | undefined {
  return one<Equipment>(`SELECT * FROM equipment WHERE id = ?`, id);
}

export function setEquipmentStatus(params: {
  id: string; status: EquipmentStatus; operatorId?: string; actor: string; note?: string;
}) {
  const before = getEquipment(params.id);
  if (!before) return;
  const at = nowIso();

  // Acumula indisponibilidade ao SAIR de um estado nao produtivo.
  let downtime = before.downtime_minutes;
  if (
    (before.status === "MAINTENANCE" || before.status === "UNAVAILABLE") &&
    params.status !== before.status &&
    before.last_event_at
  ) {
    downtime += minutesBetween(before.last_event_at, at) ?? 0;
  }

  run(
    `UPDATE equipment SET status = ?, assigned_to = ?, downtime_minutes = ?, last_event_at = ? WHERE id = ?`,
    params.status,
    params.status === "IN_USE" ? (params.operatorId ?? before.assigned_to) : null,
    Math.round(downtime * 100) / 100,
    at,
    params.id,
  );

  audit({
    actor: params.actor, action: "UPDATE", entity: "equipment", entityId: params.id,
    before: { status: before.status }, after: { status: params.status, note: params.note },
    detail: `Equipamento ${params.id}: ${before.status} -> ${params.status}`,
  });

  if (params.status === "UNAVAILABLE" || params.status === "MAINTENANCE") {
    openIncident({
      kind: "EQUIPMENT_UNAVAILABLE",
      severity: params.status === "UNAVAILABLE" ? "ALTA" : "MEDIA",
      refKind: "EQUIPMENT", refId: params.id,
      description: `${before.kind} ${before.model} (${params.id}) em ${params.status}${params.note ? `: ${params.note}` : ""}`,
      operatorId: params.operatorId,
    });
  }
}

export interface EquipmentAvailability {
  total: number;
  available: number;
  inUse: number;
  maintenance: number;
  unavailable: number;
  /** Tempo disponivel / tempo total monitorado (%). */
  availabilityPct: number;
  byKind: { kind: string; total: number; available: number; inUse: number; pct: number }[];
}

export function availability(): EquipmentAvailability {
  const rows = all<Equipment>(`SELECT * FROM equipment`);
  const total = rows.length;
  const monitored = rows.reduce((s, e) => s + e.monitored_minutes, 0);
  const now = nowIso();
  // Indisponibilidade acumulada + o tempo corrente em estado nao produtivo.
  const down = rows.reduce((s, e) => {
    let d = e.downtime_minutes;
    if ((e.status === "MAINTENANCE" || e.status === "UNAVAILABLE") && e.last_event_at) {
      d += Math.max(0, minutesBetween(e.last_event_at, now) ?? 0);
    }
    return s + Math.min(d, e.monitored_minutes);
  }, 0);

  const byKindMap = new Map<string, { kind: string; total: number; available: number; inUse: number; pct: number }>();
  for (const e of rows) {
    const cur = byKindMap.get(e.kind) ?? { kind: e.kind, total: 0, available: 0, inUse: 0, pct: 0 };
    cur.total++;
    if (e.status === "AVAILABLE") cur.available++;
    if (e.status === "IN_USE") cur.inUse++;
    byKindMap.set(e.kind, cur);
  }
  const byKind = [...byKindMap.values()].map((k) => ({
    ...k, pct: k.total ? ((k.available + k.inUse) / k.total) * 100 : 0,
  }));

  return {
    total,
    available: rows.filter((e) => e.status === "AVAILABLE").length,
    inUse: rows.filter((e) => e.status === "IN_USE").length,
    maintenance: rows.filter((e) => e.status === "MAINTENANCE").length,
    unavailable: rows.filter((e) => e.status === "UNAVAILABLE").length,
    availabilityPct: monitored > 0 ? ((monitored - down) / monitored) * 100 : 100,
    byKind,
  };
}

export function countEquipment(status?: string): number {
  return status
    ? scalar<number>(`SELECT COUNT(*) FROM equipment WHERE status = ?`, status) ?? 0
    : scalar<number>(`SELECT COUNT(*) FROM equipment`) ?? 0;
}
