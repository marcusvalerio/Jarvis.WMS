import Link from "next/link";
import type { Metadata } from "next";
import { listCounts, globalAccuracy } from "@/domain/services/counting";
import { listZones } from "@/domain/services/warehouse";
import { PageHeader, Card, EmptyState, IdChip, Metric, Progress } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/Badge";
import { CreateCount } from "./parts";
import { TASK_STATUS_META } from "@/domain/states";
import { fmtNumber, fmtPercent, fmtDateTime } from "@/lib/format";
import { IconCount, IconArrowRight, IconScan } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Inventario" };
export const dynamic = "force-dynamic";

export default function InventoryCountPage() {
  const counts = listCounts();
  const acc = globalAccuracy();
  const zones = listZones().filter((z) => ["PICKING", "STORAGE"].includes(z.kind));

  return (
    <>
      <PageHeader
        eyebrow="Controle"
        title="Inventario ciclico"
        description="Contagem cega por endereco. A acuracidade compara o estoque fisico contado com o saldo sistemico e alimenta o KPI do dashboard."
        actions={
          <>
            <Link href="/mobile/count" className="btn btn-sm"><IconScan size={13} /> Contar na coletora</Link>
            <CreateCount zones={zones.map((z) => ({ id: z.id, name: z.name }))} />
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Card className="p-4">
          <Metric
            label="Acuracidade de estoque"
            value={acc.counted > 0 ? fmtPercent(acc.accuracy, 2) : "sem dados"}
            tone={acc.counted === 0 ? "muted" : acc.accuracy >= 99 ? "success" : "warning"}
            size="sm"
            hint={acc.counted > 0 ? `${acc.counted} posicoes contadas` : "nenhum inventario executado"}
          />
        </Card>
        <Card className="p-4"><Metric label="Posicoes divergentes" value={acc.divergent} tone={acc.divergent > 0 ? "warning" : "muted"} size="sm" /></Card>
        <Card className="p-4"><Metric label="Inventarios" value={counts.length} size="sm" /></Card>
        <Card className="p-4"><Metric label="Em andamento" value={counts.filter((c) => c.status === "IN_PROGRESS").length} tone="accent" size="sm" /></Card>
      </div>

      {counts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconCount size={18} />}
            title="Nenhum inventario"
            description="Crie um inventario ciclico por zona para medir a acuracidade do estoque."
          />
        </Card>
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
            <table className="table">
              <thead>
                <tr><th>Inventario</th><th>Tipo</th><th>Escopo</th><th>Status</th>
                  <th className="num">Posicoes</th><th style={{ width: 120 }}>Progresso</th>
                  <th className="num">Divergencias</th><th className="num">Acuracidade</th>
                  <th>Operador</th><th>Criado</th><th /></tr>
              </thead>
              <tbody>
                {counts.map((c) => (
                  <tr key={c.id}>
                    <td><IdChip id={c.id} href={`/inventory-count/${c.id}`} /></td>
                    <td className="text-secondary">{c.kind === "CYCLIC" ? "Ciclico" : c.kind === "GENERAL" ? "Geral" : "Pontual"}</td>
                    <td className="text-secondary max-w-[170px] truncate">{c.scope ?? "—"}</td>
                    <td><StatusBadge status={c.status} meta={TASK_STATUS_META} /></td>
                    <td className="num tnum">{c.counted_items}/{c.total_items}</td>
                    <td>
                      <Progress value={c.counted_items} max={Math.max(1, c.total_items)}
                        tone={c.status === "COMPLETED" ? "success" : "accent"} label={`Progresso ${c.id}`} />
                    </td>
                    <td className="num tnum">
                      <span className={c.divergence_items > 0 ? "text-warning" : "text-secondary"}>
                        {c.divergence_items}
                      </span>
                    </td>
                    <td className="num tnum">
                      {c.accuracy === null ? "—" : (
                        <span className={c.accuracy >= 99 ? "text-success" : "text-warning"}>
                          {fmtPercent(c.accuracy, 2)}
                        </span>
                      )}
                    </td>
                    <td className="text-secondary">{c.operator_name ?? "—"}</td>
                    <td className="text-secondary text-[12px]">{fmtDateTime(c.created_at)}</td>
                    <td>
                      <Link href={`/inventory-count/${c.id}`} className="btn btn-sm btn-ghost" aria-label={`Abrir inventario ${c.id}`}>
                        <IconArrowRight size={13} />
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
