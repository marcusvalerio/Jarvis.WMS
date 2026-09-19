import Link from "next/link";
import type { Metadata } from "next";
import { listWeighings, listInbound, listPallets } from "@/domain/services/receiving";
import { listEquipment } from "@/domain/services/equipment";
import { PageHeader, Card, CardHeader, EmptyState, IdChip, Metric } from "@/components/ui/Primitives";
import { WeighingStation } from "./parts";
import { fmtNumber, fmtWeight, fmtDateTime } from "@/lib/format";
import { IconWeight, IconPrint } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Pesagem" };
export const dynamic = "force-dynamic";

export default function WeighingPage() {
  const weighings = listWeighings();
  const inbound = listInbound().filter((i) => !["COMPLETED", "CANCELLED"].includes(i.status));
  const pallets = listPallets().filter((p) => ["AWAITING_PUTAWAY", "STORED"].includes(p.status));
  const scales = listEquipment({ kind: "BALANCA" }).map((e) => ({ id: e.id, model: e.model }));

  const targets = [
    ...inbound.map((i) => ({ kind: "INBOUND_ORDER", id: i.id, label: `${i.id} — ${i.supplier_name}`, expected: i.expected_weight_kg })),
    ...pallets.map((p) => ({ kind: "PALLET", id: p.id, label: `${p.id} — ${p.main_sku ?? "palete"}`, expected: p.net_weight_kg })),
  ];

  const divergent = weighings.filter((w) => w.divergence_kg !== 0);

  return (
    <>
      <PageHeader
        eyebrow="Entrada"
        title="Pesagem"
        description="Pesagem simulada — nao ha balanca fisica integrada. O peso liquido e calculado como bruto menos tara e comparado ao previsto."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Card className="p-4"><Metric label="Pesagens" value={weighings.length} size="sm" /></Card>
        <Card className="p-4"><Metric label="Peso liquido total" value={fmtNumber(weighings.reduce((s, w) => s + w.net_kg, 0), 1)} unit="kg" size="sm" /></Card>
        <Card className="p-4"><Metric label="Com divergencia" value={divergent.length} tone={divergent.length > 0 ? "warning" : "muted"} size="sm" /></Card>
        <Card className="p-4"><Metric label="Balancas" value={scales.length} size="sm" hint="equipamentos cadastrados" /></Card>
      </div>

      <Card className="mb-5 border-l-2 border-l-accent">
        <CardHeader
          title="Estacao de pesagem"
          subtitle="Selecione o documento ou palete, informe bruto e tara — o liquido e calculado automaticamente"
        />
        {targets.length === 0 ? (
          <p className="text-[12.5px] text-secondary">
            Nenhum recebimento aberto ou palete disponivel para pesagem.
          </p>
        ) : (
          <WeighingStation targets={targets} equipment={scales} />
        )}
      </Card>

      {weighings.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconWeight size={18} />}
            title="Nenhuma pesagem registrada"
            description="Registre a primeira pesagem na estacao acima."
          />
        </Card>
      ) : (
        <Card padded={false}>
          <div className="p-5 pb-0"><CardHeader title="Historico de pesagens" /></div>
          <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
            <table className="table">
              <thead>
                <tr><th>Documento</th><th>Referencia</th><th className="num">Bruto</th><th className="num">Tara</th>
                  <th className="num">Liquido</th><th className="num">Previsto</th><th className="num">Divergencia</th>
                  <th>Equipamento</th><th>Operador</th><th>Data</th><th /></tr>
              </thead>
              <tbody>
                {weighings.map((w) => (
                  <tr key={w.id}>
                    <td><IdChip id={w.id} /></td>
                    <td className="code text-secondary">{w.ref_id}</td>
                    <td className="num tnum">{fmtNumber(w.gross_kg, 3)}</td>
                    <td className="num tnum">{fmtNumber(w.tare_kg, 3)}</td>
                    <td className="num tnum text-accent font-medium">{fmtNumber(w.net_kg, 3)}</td>
                    <td className="num tnum text-secondary">{w.expected_kg ? fmtNumber(w.expected_kg, 3) : "—"}</td>
                    <td className={`num tnum ${w.divergence_kg === 0 ? "text-secondary" : "text-warning"}`}>
                      {w.expected_kg ? `${w.divergence_kg > 0 ? "+" : ""}${fmtNumber(w.divergence_kg, 3)}` : "—"}
                    </td>
                    <td className="text-secondary text-[12px] max-w-[160px] truncate">{w.equipment_model ?? "—"}</td>
                    <td className="text-secondary">{w.operator_name ?? "—"}</td>
                    <td className="text-secondary text-[12px]">{fmtDateTime(w.weighed_at)}</td>
                    <td>
                      <Link href={`/documents/weighing/${w.id}`} className="btn btn-sm btn-ghost" aria-label={`Comprovante ${w.id}`}>
                        <IconPrint size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
