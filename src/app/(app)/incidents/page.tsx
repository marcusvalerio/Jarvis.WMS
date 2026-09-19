import Link from "next/link";
import type { Metadata } from "next";
import { listIncidents, incidentCounts } from "@/domain/services/incidents";
import { PageHeader, Card, EmptyState, IdChip, Metric } from "@/components/ui/Primitives";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { FilterBar } from "@/components/FilterBar";
import { IncidentActions } from "./parts";
import {
  INCIDENT_STATUS, INCIDENT_STATUS_META, INCIDENT_KIND, INCIDENT_KIND_LABEL, SEVERITY_META,
} from "@/domain/states";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { IconAlert } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Ocorrencias" };
export const dynamic = "force-dynamic";

export default async function IncidentsPage({
  searchParams,
}: { searchParams: Promise<{ status?: string; kind?: string; search?: string }> }) {
  const sp = await searchParams;
  const rows = listIncidents({ status: sp.status, kind: sp.kind, search: sp.search });
  const counts = incidentCounts();

  return (
    <>
      <PageHeader
        eyebrow="Controle"
        title="Ocorrencias"
        description="Registradas automaticamente pelas validacoes da operacao — divergencias de conferencia, picking, inventario, pesagem e expedicao."
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Card className="p-4"><Metric label="Abertas" value={counts.open} tone={counts.open > 0 ? "error" : "muted"} size="sm" /></Card>
        <Card className="p-4"><Metric label="Em analise" value={counts.analysis} tone="warning" size="sm" /></Card>
        <Card className="p-4"><Metric label="Resolvidas" value={counts.resolved} tone="success" size="sm" /></Card>
        <Card className="p-4"><Metric label="Alta severidade" value={counts.critical} tone={counts.critical > 0 ? "error" : "muted"} size="sm" /></Card>
        <Card className="p-4"><Metric label="Total no cenario" value={counts.total} size="sm" /></Card>
      </div>

      <FilterBar
        placeholder="Ocorrencia, descricao, referencia…"
        selects={[
          {
            key: "status", label: "Todos os status",
            options: Object.keys(INCIDENT_STATUS).map((s) => ({
              value: s, label: INCIDENT_STATUS_META[s as keyof typeof INCIDENT_STATUS].label,
            })),
          },
          {
            key: "kind", label: "Todos os tipos",
            options: Object.keys(INCIDENT_KIND).map((k) => ({
              value: k, label: INCIDENT_KIND_LABEL[k as keyof typeof INCIDENT_KIND],
            })),
          },
        ]}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconAlert size={18} />}
            title="Nenhuma ocorrencia"
            description="A operacao esta sem divergencias registradas no filtro atual."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((i) => (
            <Card key={i.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <IdChip id={i.id} />
                    <StatusBadge status={i.status} meta={INCIDENT_STATUS_META} />
                    <StatusBadge status={i.severity} meta={SEVERITY_META} dot={false} />
                    <Badge tone="neutral">
                      {INCIDENT_KIND_LABEL[i.kind as keyof typeof INCIDENT_KIND_LABEL] ?? i.kind}
                    </Badge>
                  </div>
                  <p className="text-[13px] text-primary leading-snug">{i.description}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11.5px] text-faint">
                    <span>Aberta em {fmtDateTime(i.opened_at)}</span>
                    {i.operator_name && <span>Operador {i.operator_name}</span>}
                    {i.ref_id && <span>Ref. {i.ref_kind} {i.ref_id}</span>}
                    {i.sku && <span>SKU {i.sku}</span>}
                    {i.location_code && <span>Endereco {i.location_code}</span>}
                    {i.quantity !== null && <span>Qtd {fmtNumber(i.quantity)}</span>}
                    <span>Responsavel {i.owner ?? "—"}</span>
                  </div>
                  {i.resolution && (
                    <p className="text-[12.5px] text-success mt-2.5 leading-snug">
                      Tratamento: {i.resolution} · {fmtDateTime(i.resolved_at)}
                    </p>
                  )}
                </div>

                {i.status !== "RESOLVED" && i.status !== "CANCELLED" && (
                  <div className="flex-none w-full md:w-[340px]">
                    <IncidentActions incidentId={i.id} status={i.status} />
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
