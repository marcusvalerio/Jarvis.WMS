import { all, one, insert, run, scalar } from "@/lib/db";
import { nextId, PREFIX } from "@/lib/ids";
import { nowIso } from "@/lib/format";
import { audit } from "./audit";
import type { IncidentKind, Severity } from "@/domain/states";

export interface IncidentInput {
  kind: IncidentKind;
  severity?: Severity;
  refKind?: string;
  refId?: string;
  documentId?: string;
  salesOrderId?: string;
  productId?: string;
  locationId?: string;
  quantity?: number;
  description: string;
  operatorId?: string;
  owner?: string;
}

export function openIncident(input: IncidentInput): string {
  const at = nowIso();
  const id = nextId(PREFIX.INCIDENT);
  insert("incidents", {
    id,
    kind: input.kind,
    severity: input.severity ?? "MEDIA",
    status: "OPEN",
    ref_kind: input.refKind ?? null,
    ref_id: input.refId ?? null,
    document_id: input.documentId ?? null,
    sales_order_id: input.salesOrderId ?? null,
    product_id: input.productId ?? null,
    location_id: input.locationId ?? null,
    quantity: input.quantity ?? null,
    description: input.description,
    operator_id: input.operatorId ?? null,
    owner: input.owner ?? "Supervisao de Operacoes",
    opened_at: at,
  });
  audit({
    actor: input.operatorId ?? "SISTEMA",
    action: "CREATE",
    entity: "incident",
    entityId: id,
    after: { kind: input.kind, severity: input.severity ?? "MEDIA", ref: input.refId },
    detail: input.description,
    occurredAt: at,
  });
  return id;
}

export function resolveIncident(id: string, resolution: string, actor: string) {
  const before = one<any>(`SELECT * FROM incidents WHERE id = ?`, id);
  if (!before) return;
  const at = nowIso();
  run(
    `UPDATE incidents SET status = 'RESOLVED', resolution = ?, resolved_at = ? WHERE id = ?`,
    resolution, at, id,
  );
  audit({
    actor, action: "UPDATE", entity: "incident", entityId: id,
    before: { status: before.status }, after: { status: "RESOLVED", resolution },
    detail: `Ocorrencia resolvida: ${resolution}`,
  });
}

export function setIncidentStatus(id: string, status: string, actor: string) {
  const before = one<any>(`SELECT status FROM incidents WHERE id = ?`, id);
  if (!before) return;
  run(`UPDATE incidents SET status = ? WHERE id = ?`, status, id);
  audit({
    actor, action: "UPDATE", entity: "incident", entityId: id,
    before, after: { status }, detail: `Ocorrencia ${id}: ${before.status} -> ${status}`,
  });
}

export function listIncidents(filter: { status?: string; kind?: string; search?: string } = {}) {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.status) { where.push("i.status = ?"); params.push(filter.status); }
  if (filter.kind) { where.push("i.kind = ?"); params.push(filter.kind); }
  if (filter.search) {
    where.push("(i.id LIKE ? OR i.description LIKE ? OR i.ref_id LIKE ?)");
    const q = `%${filter.search}%`;
    params.push(q, q, q);
  }
  return all<any>(
    `SELECT i.*, p.sku, p.description AS product_description,
            l.code AS location_code, o.name AS operator_name
       FROM incidents i
       LEFT JOIN products p ON p.id = i.product_id
       LEFT JOIN locations l ON l.id = i.location_id
       LEFT JOIN operators o ON o.id = i.operator_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY
        CASE i.status WHEN 'OPEN' THEN 0 WHEN 'IN_ANALYSIS' THEN 1 ELSE 2 END,
        CASE i.severity WHEN 'CRITICA' THEN 0 WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END,
        i.opened_at DESC`,
    ...params,
  );
}

export function getIncident(id: string) {
  return one<any>(
    `SELECT i.*, p.sku, l.code AS location_code, o.name AS operator_name
       FROM incidents i
       LEFT JOIN products p ON p.id = i.product_id
       LEFT JOIN locations l ON l.id = i.location_id
       LEFT JOIN operators o ON o.id = i.operator_id
      WHERE i.id = ?`,
    id,
  );
}

export function incidentCounts() {
  return {
    open: scalar<number>(`SELECT COUNT(*) FROM incidents WHERE status = 'OPEN'`) ?? 0,
    analysis: scalar<number>(`SELECT COUNT(*) FROM incidents WHERE status = 'IN_ANALYSIS'`) ?? 0,
    resolved: scalar<number>(`SELECT COUNT(*) FROM incidents WHERE status = 'RESOLVED'`) ?? 0,
    critical: scalar<number>(
      `SELECT COUNT(*) FROM incidents WHERE status IN ('OPEN','IN_ANALYSIS') AND severity IN ('ALTA','CRITICA')`,
    ) ?? 0,
    total: scalar<number>(`SELECT COUNT(*) FROM incidents`) ?? 0,
  };
}

export function incidentsFor(refKind: string, refId: string) {
  return all<any>(
    `SELECT * FROM incidents WHERE ref_kind = ? AND ref_id = ? ORDER BY opened_at DESC`,
    refKind, refId,
  );
}
