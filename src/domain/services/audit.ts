import { insert, all, one, scalar } from "@/lib/db";
import { nowIso } from "@/lib/format";
import type { AuditAction } from "@/domain/states";

let auditSeq = 0;

export interface AuditInput {
  actor: string;
  actorKind?: "OPERATOR" | "USER" | "SYSTEM";
  action: AuditAction;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  origin?: "WEB" | "RF" | "SYSTEM" | "SEED";
  detail?: string;
  occurredAt?: string;
}

export interface AuditLog {
  id: string;
  actor: string;
  actor_kind: string;
  action: AuditAction;
  entity: string;
  entity_id: string;
  before_value: string | null;
  after_value: string | null;
  origin: string;
  detail: string | null;
  occurred_at: string;
}

/**
 * Registro de auditoria. Toda operacao critica passa por aqui.
 * Chamado SEMPRE dentro da mesma transacao da mudanca que descreve.
 */
export async function audit(input: AuditInput): Promise<string> {
  const at = input.occurredAt ?? nowIso();
  const id = `AUD-${at.replace(/[-:.TZ]/g, "")}-${String(++auditSeq).padStart(5, "0")}`;
  await insert("audit_logs", {
    id,
    actor: input.actor,
    actor_kind: input.actorKind ?? "OPERATOR",
    action: input.action,
    entity: input.entity,
    entity_id: input.entityId,
    before_value: input.before === undefined ? null : JSON.stringify(input.before),
    after_value: input.after === undefined ? null : JSON.stringify(input.after),
    origin: input.origin ?? "WEB",
    detail: input.detail ?? null,
    occurred_at: at,
  });
  return id;
}

export async function auditFor(entity: string, entityId: string): Promise<AuditLog[]> {
  return await all<AuditLog>(
    `SELECT * FROM audit_logs WHERE entity = ? AND entity_id = ? ORDER BY occurred_at DESC, id DESC`,
    entity,
    entityId,
  );
}

export interface AuditFilter {
  entity?: string;
  action?: string;
  actor?: string;
  origin?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listAudit(filter: AuditFilter = {}): Promise<AuditLog[]> {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.entity) { where.push("entity = ?"); params.push(filter.entity); }
  if (filter.action) { where.push("action = ?"); params.push(filter.action); }
  if (filter.actor) { where.push("actor = ?"); params.push(filter.actor); }
  if (filter.origin) { where.push("origin = ?"); params.push(filter.origin); }
  if (filter.search) {
    where.push("(entity_id LIKE ? OR detail LIKE ? OR entity LIKE ?)");
    const q = `%${filter.search}%`;
    params.push(q, q, q);
  }
  const sql = `SELECT * FROM audit_logs ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?`;
  return await all<AuditLog>(sql, ...params, filter.limit ?? 100, filter.offset ?? 0);
}

export async function countAudit(filter: AuditFilter = {}): Promise<number> {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.entity) { where.push("entity = ?"); params.push(filter.entity); }
  if (filter.action) { where.push("action = ?"); params.push(filter.action); }
  if (filter.actor) { where.push("actor = ?"); params.push(filter.actor); }
  if (filter.origin) { where.push("origin = ?"); params.push(filter.origin); }
  if (filter.search) {
    where.push("(entity_id LIKE ? OR detail LIKE ? OR entity LIKE ?)");
    const q = `%${filter.search}%`;
    params.push(q, q, q);
  }
  return await scalar<number>(
    `SELECT COUNT(*) AS n FROM audit_logs ${where.length ? "WHERE " + where.join(" AND ") : ""}`,
    ...params,
  ) ?? 0;
}

export async function auditDistinct(column: "entity" | "action" | "actor" | "origin"): Promise<string[]> {
  return (await all<{ v: string }>(
    `SELECT DISTINCT ${column} AS v FROM audit_logs ORDER BY v`,
  )).map((r) => r.v);
}

export async function lastAudit(entity: string, entityId: string): Promise<AuditLog | undefined> {
  return await one<AuditLog>(
    `SELECT * FROM audit_logs WHERE entity = ? AND entity_id = ?
     ORDER BY occurred_at DESC, id DESC LIMIT 1`,
    entity, entityId,
  );
}
