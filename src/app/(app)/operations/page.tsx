import Link from "next/link";
import type { Metadata } from "next";
import { operationSnapshot, operationalPulse, headline } from "@/domain/services/kpi";
import { listDocks, occupancy } from "@/domain/services/warehouse";
import { availability } from "@/domain/services/equipment";
import { incidentCounts, listIncidents } from "@/domain/services/incidents";
import { recentScans, scanStats } from "@/domain/services/scan";
import { PageHeader, Card, CardHeader, Metric, Progress, EmptyState } from "@/components/ui/Primitives";
import { Badge } from "@/components/ui/Badge";
import { INCIDENT_KIND_LABEL } from "@/domain/states";
import { fmtNumber, fmtTime, fmtPercent } from "@/lib/format";
import { IconArrowRight, IconAlert, IconScan } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Painel de operacao" };
export const dynamic = "force-dynamic";

/** Tela de acompanhamento em tempo real — visao do gestor durante a operacao. */
export default function OperationsPage() {
  const stages = operationSnapshot();
  const pulse = operationalPulse(20);
  const docks = listDocks();
  const occ = occupancy();
  const eq = availability();
  const inc = incidentCounts();
  const openIncidents = listIncidents({ status: "OPEN" }).slice(0, 5);
  const scans = recentScans(10);
  const scanStat = scanStats();
  const head = headline();

  return (
    <>
      <PageHeader
        eyebrow="Operacao"
        title="Painel de operacao"
        description="Estado de cada etapa do fluxo fisico, atualizado a cada acao registrada pelo desktop ou pela coletora."
        actions={<Link href="/dashboard" className="btn btn-sm">Dashboard <IconArrowRight size={13} /></Link>}
      />

      {/* --------------------------------------------------- etapas do fluxo */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        {stages.map((s) => {
          const total = s.pending + s.running + s.done;
          return (
            <Card key={s.stage} className="p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <p className="text-[13px] font-semibold text-primary">{s.stage}</p>
                {s.running > 0 && (
                  <span className="flex items-center gap-1.5 text-[11px] text-accent-fg">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent pulse-dot" aria-hidden />
                    ativo
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <Stat label="Fila" value={s.pending} tone={s.pending > 0 ? "warning" : "muted"} />
                <Stat label="Em curso" value={s.running} tone={s.running > 0 ? "accent" : "muted"} />
                <Stat label="Concluido" value={s.done} tone={s.done > 0 ? "success" : "muted"} />
              </div>

              <Progress value={s.done} max={Math.max(1, total)} tone="success" label={`${s.stage} concluido`} />

              {s.items.length > 0 && (
                <ul className="flex flex-col gap-1 mt-3">
                  {s.items.slice(0, 4).map((i) => (
                    <li key={i.id} className="flex items-center gap-2 text-[11.5px]">
                      <span className="code text-[11px] text-secondary truncate max-w-[90px]">{i.id}</span>
                      <span className="text-primary truncate flex-1">{i.label}</span>
                      {i.progress && <span className="text-faint tnum flex-none">{i.progress}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        {/* ---------------------------------------------- eventos */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Eventos da operacao"
            subtitle="Cada linha corresponde a um registro de auditoria"
            action={<Link href="/audit" className="btn btn-sm btn-ghost">Auditoria <IconArrowRight size={13} /></Link>}
          />
          {pulse.length === 0 ? (
            <EmptyState title="Operacao parada" description="Nenhum evento registrado no cenario." />
          ) : (
            <ol className="flex flex-col">
              {pulse.map((e) => (
                <li key={e.id} className="flex items-baseline gap-3 py-1.5 border-b border-border-soft last:border-0">
                  <span className="text-[11px] text-faint tnum w-[42px] flex-none">{fmtTime(e.at)}</span>
                  <span className="eyebrow w-[100px] flex-none truncate">{e.stage}</span>
                  <span className="text-[12.5px] text-primary flex-1 min-w-0 truncate" title={e.detail}>
                    {e.detail || e.label}
                  </span>
                  <span className="text-[11px] text-faint flex-none">{e.actor}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <div className="flex flex-col gap-5">
          {/* -------------------------------------------- recursos */}
          <Card>
            <CardHeader title="Recursos" />
            <div className="grid grid-cols-2 gap-4">
              <Metric label="Ocupacao" value={fmtPercent(occ.occupancyPct, 1)} tone="accent" size="sm" hint={`${occ.occupied}/${occ.totalPositions} posicoes`} />
              <Metric label="Equipamentos" value={fmtPercent(eq.availabilityPct, 1)} tone="success" size="sm" hint={`${eq.available + eq.inUse}/${eq.total} operacionais`} />
            </div>
            <div className="hr my-4" />
            <p className="label mb-2.5">Docas</p>
            <ul className="grid grid-cols-2 gap-2">
              {docks.map((d) => (
                <li key={d.id} className="flex items-center gap-2 h-8 px-2.5 rounded-md border border-border bg-bg">
                  <span className={`w-1.5 h-1.5 rounded-full flex-none ${d.status === "OCCUPIED" ? "bg-accent pulse-dot" : d.status === "BLOCKED" ? "bg-error" : "bg-neutral"}`} />
                  <span className="text-[11.5px] truncate">{d.id.replace("DOCA-", "Doca ")}</span>
                  <span className="ml-auto text-[10.5px] text-faint truncate max-w-[64px]">{d.current_ref ?? "livre"}</span>
                </li>
              ))}
            </ul>
          </Card>

          {/* -------------------------------------------- coletora */}
          <Card>
            <CardHeader
              title="Coletora"
              subtitle={`${scanStat.total} leituras · ${scanStat.rejected} recusadas`}
              action={
              <Link href="/mobile" className="btn btn-sm btn-ghost" aria-label="Abrir a coletora">
                <IconScan size={13} />
              </Link>
            }
            />
            {scans.length === 0 ? (
              <p className="text-[12.5px] text-faint">Nenhuma leitura registrada.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {scans.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-[11.5px] py-1">
                    <span className={`w-1.5 h-1.5 rounded-full flex-none ${s.result === "OK" ? "bg-success" : "bg-error"}`} />
                    <span className="code text-[11px] flex-none">{s.raw_code}</span>
                    <span className="text-secondary truncate flex-1" title={s.message ?? ""}>{s.message}</span>
                    <span className="text-faint tnum flex-none">{fmtTime(s.occurred_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* -------------------------------------------- ocorrencias */}
          <Card>
            <CardHeader
              title="Ocorrencias abertas"
              subtitle={`${inc.open} aberta(s) · ${inc.critical} de alta severidade`}
              action={
              <Link href="/incidents" className="btn btn-sm btn-ghost" aria-label="Ver todas as ocorrencias">
                <IconArrowRight size={13} />
              </Link>
            }
            />
            {openIncidents.length === 0 ? (
              <p className="text-[12.5px] text-success-fg">Nenhuma ocorrencia em aberto.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {openIncidents.map((i) => (
                  <li key={i.id} className="p-2.5 rounded-md border border-warning-line bg-warning-soft">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-warning-fg flex-none"><IconAlert size={12} /></span>
                      <span className="text-[11px] text-warning-fg truncate">
                        {INCIDENT_KIND_LABEL[i.kind as keyof typeof INCIDENT_KIND_LABEL] ?? i.kind}
                      </span>
                    </div>
                    <p className="text-[12px] text-primary leading-snug">{i.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "accent" | "warning" | "success" | "muted" }) {
  const color = {
    accent: "text-accent-fg", warning: "text-warning-fg", success: "text-success-fg", muted: "text-faint",
  }[tone];
  return (
    <div>
      <p className="text-[10px] tracking-[0.08em] uppercase text-faint font-[family-name:var(--font-editorial)]">{label}</p>
      <p className={`text-[20px] leading-none font-[family-name:var(--font-display)] font-semibold tnum mt-1 ${color}`}>
        {fmtNumber(value)}
      </p>
    </div>
  );
}
