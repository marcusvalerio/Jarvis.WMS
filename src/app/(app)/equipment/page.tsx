import type { Metadata } from "next";
import { listEquipment, availability } from "@/domain/services/equipment";
import { PageHeader, Card, CardHeader, Metric, Progress, IdChip } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/Badge";
import { Barcode } from "@/components/Barcode";
import { EquipmentStatusForm } from "./parts";
import { EQUIPMENT_STATUS_META } from "@/domain/states";
import { fmtPercent, fmtDuration, fmtDateTime, fmtNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Equipamentos" };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  COLETORA: "Coletoras", EMPILHADEIRA: "Empilhadeiras", PALETEIRA: "Paleteiras",
  IMPRESSORA: "Impressoras", BALANCA: "Balancas",
};

export default async function EquipmentPage() {
  const list = await listEquipment();
  const av = await availability();
  const kinds = [...new Set(list.map((e) => e.kind))];

  return (
    <>
      <PageHeader
        eyebrow="Controle"
        title="Equipamentos"
        description="Disponibilidade calculada sobre o tempo monitorado. Colocar um equipamento em manutencao ou indisponivel abre ocorrencia automaticamente."
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Card className="p-4"><Metric label="Disponibilidade" value={fmtPercent(av.availabilityPct, 1)} tone="success" size="sm" hint="tempo disponivel / monitorado" /></Card>
        <Card className="p-4"><Metric label="Disponiveis" value={av.available} tone="success" size="sm" /></Card>
        <Card className="p-4"><Metric label="Em uso" value={av.inUse} tone="accent" size="sm" /></Card>
        <Card className="p-4"><Metric label="Manutencao" value={av.maintenance} tone={av.maintenance > 0 ? "warning" : "muted"} size="sm" /></Card>
        <Card className="p-4"><Metric label="Indisponiveis" value={av.unavailable} tone={av.unavailable > 0 ? "error" : "muted"} size="sm" /></Card>
      </div>

      <Card className="mb-5">
        <CardHeader title="Disponibilidade por tipo" />
        <ul className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {av.byKind.map((k) => (
            <li key={k.kind}>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[12.5px] text-primary">{KIND_LABEL[k.kind] ?? k.kind}</span>
                <span className="text-[11.5px] text-secondary tnum">{k.available + k.inUse}/{k.total}</span>
              </div>
              <Progress value={k.available + k.inUse} max={k.total} tone={k.pct >= 100 ? "success" : "warning"} />
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex flex-col gap-5">
        {kinds.map((kind) => (
          <section key={kind}>
            <h2 className="label mb-3">{KIND_LABEL[kind] ?? kind}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
              {list.filter((e) => e.kind === kind).map((e) => (
                <Card key={e.id} className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <IdChip id={e.id} />
                      <p className="text-[13.5px] text-primary mt-1.5 leading-snug">{e.model}</p>
                      {e.serial && <p className="text-[11.5px] text-faint mt-0.5 code">{e.serial}</p>}
                    </div>
                    <StatusBadge status={e.status} meta={EQUIPMENT_STATUS_META} />
                  </div>

                  <div className="flex flex-col gap-1.5 text-[12px] text-secondary mb-3">
                    <span className="flex justify-between">
                      <span>Tempo monitorado</span>
                      <span className="tnum text-primary">{fmtDuration(e.monitored_minutes)}</span>
                    </span>
                    <span className="flex justify-between">
                      <span>Indisponibilidade</span>
                      <span className={`tnum ${e.downtime_minutes > 0 ? "text-warning-fg" : "text-primary"}`}>
                        {fmtDuration(e.downtime_minutes)}
                      </span>
                    </span>
                    {e.operator_name && (
                      <span className="flex justify-between">
                        <span>Operador</span>
                        <span className="text-primary">{e.operator_name}</span>
                      </span>
                    )}
                    <span className="flex justify-between">
                      <span>Ultimo evento</span>
                      <span className="text-primary">{fmtDateTime(e.last_event_at)}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mb-3">
                    <Barcode value={e.id} height={30} moduleWidth={1.2} showText={false} quietZone={6} />
                    <span className="text-[11px] text-faint leading-snug">
                      Identificacao para vinculo na coletora
                    </span>
                  </div>

                  <EquipmentStatusForm equipmentId={e.id} current={e.status} />
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
