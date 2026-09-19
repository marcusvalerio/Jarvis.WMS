import Link from "next/link";
import type { Metadata } from "next";
import { listAudit, countAudit, auditDistinct } from "@/domain/services/audit";
import { PageHeader, Card, EmptyState, IdChip, Metric } from "@/components/ui/Primitives";
import { Badge } from "@/components/ui/Badge";
import { FilterBar } from "@/components/FilterBar";
import { AUDIT_ACTION_LABEL, type AuditAction } from "@/domain/states";
import { fmtDateTime } from "@/lib/format";
import { IconShield, IconLink } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Auditoria" };
export const dynamic = "force-dynamic";

const TONE: Record<string, any> = {
  CREATE: "info", UPDATE: "neutral", APPROVE: "success", CANCEL: "error",
  RECEIVE: "accent", CHECK: "warning", MOVE: "neutral", PICK: "accent",
  PACK: "info", LOAD: "accent", SHIP: "success", RESET: "error",
  COUNT: "warning", WEIGH: "neutral", RESERVE: "info", RELEASE: "neutral",
  SCAN: "neutral", SEED: "neutral",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; action?: string; origin?: string; search?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const limit = 80;
  const filter = { entity: sp.entity, action: sp.action, origin: sp.origin, search: sp.search };
  const rows = await listAudit({ ...filter, limit, offset: (page - 1) * limit });
  const total = await countAudit(filter);
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <>
      <PageHeader
        eyebrow="Controle"
        title="Auditoria"
        description="Registro imutavel de quem fez o que, quando, sobre qual entidade, com valor anterior e posterior."
        meta={<span className="text-[12.5px] text-secondary"><strong className="text-primary tnum">{total}</strong> eventos registrados</span>}
        actions={<Link href="/audit/trace" className="btn btn-sm"><IconLink size={13} /> Rastreabilidade</Link>}
      />

      <FilterBar
        placeholder="Entidade, identificador, detalhe…"
        selects={[
          {
            key: "action", label: "Todas as acoes",
            options: (await auditDistinct("action")).map((a) => ({
              value: a, label: AUDIT_ACTION_LABEL[a as AuditAction] ?? a,
            })),
          },
          { key: "entity", label: "Todas as entidades", options: (await auditDistinct("entity")).map((e) => ({ value: e, label: e })) },
          { key: "origin", label: "Todas as origens", options: (await auditDistinct("origin")).map((o) => ({ value: o, label: o })) },
        ]}
      />

      {rows.length === 0 ? (
        <Card><EmptyState icon={<IconShield size={18} />} title="Nenhum evento encontrado" /></Card>
      ) : (
        <>
          <Card padded={false}>
            <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
              <table className="table">
                <thead>
                  <tr>
                    <th>Data e hora</th><th>Acao</th><th>Entidade</th><th>Identificador</th>
                    <th>Detalhe</th><th>Ator</th><th>Origem</th><th>Valores</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td className="text-secondary text-[12px] whitespace-nowrap">{fmtDateTime(a.occurred_at)}</td>
                      <td><Badge tone={TONE[a.action] ?? "neutral"}>{AUDIT_ACTION_LABEL[a.action] ?? a.action}</Badge></td>
                      <td className="text-secondary">{a.entity}</td>
                      <td><span className="chip-id">{a.entity_id}</span></td>
                      <td className="max-w-[340px] truncate text-[12.5px]" title={a.detail ?? ""}>{a.detail ?? "—"}</td>
                      <td className="text-secondary">{a.actor}</td>
                      <td>
                        <Badge tone={a.origin === "RF" ? "accent" : a.origin === "SEED" ? "neutral" : "info"}>
                          {a.origin}
                        </Badge>
                      </td>
                      <td>
                        {(a.before_value || a.after_value) ? (
                          <details className="text-[11.5px]">
                            <summary className="cursor-pointer text-faint hover:text-secondary">ver</summary>
                            <div className="mt-1.5 flex flex-col gap-1 min-w-[220px]">
                              {a.before_value && (
                                <code className="block p-1.5 rounded bg-bg border border-border text-[10.5px] text-error-fg break-all">
                                  − {a.before_value}
                                </code>
                              )}
                              {a.after_value && (
                                <code className="block p-1.5 rounded bg-bg border border-border text-[10.5px] text-success-fg break-all">
                                  + {a.after_value}
                                </code>
                              )}
                            </div>
                          </details>
                        ) : <span className="text-faint">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              {page > 1 && (
                <Link href={buildPage(sp, page - 1)} className="btn btn-sm">Anterior</Link>
              )}
              <span className="text-[12.5px] text-secondary tnum px-2">Pagina {page} de {pages}</span>
              {page < pages && (
                <Link href={buildPage(sp, page + 1)} className="btn btn-sm">Proxima</Link>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

function buildPage(sp: Record<string, string | undefined>, page: number) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && k !== "page") params.set(k, v);
  params.set("page", String(page));
  return `/audit?${params.toString()}`;
}
