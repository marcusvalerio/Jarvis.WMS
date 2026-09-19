import Link from "next/link";
import type { Metadata } from "next";
import { all } from "@/lib/db";
import { listManifests } from "@/domain/services/shipping";
import { PageHeader, Card, EmptyState, IdChip, Progress, Metric } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/Badge";
import { TASK_STATUS_META, MANIFEST_STATUS_META } from "@/domain/states";
import { fmtNumber, fmtDateTime } from "@/lib/format";
import { IconTruckOut, IconArrowRight } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Carregamento" };
export const dynamic = "force-dynamic";

export default async function LoadingPage() {
  const rows = await all<any>(
    `SELECT lo.*, m.route, m.vehicle_plate, m.status AS manifest_status,
            d.name AS dock_name, o.name AS operator_name
       FROM loading_operations lo
       JOIN shipping_manifests m ON m.id = lo.manifest_id
       LEFT JOIN docks d ON d.id = lo.dock_id
       LEFT JOIN operators o ON o.id = lo.operator_id
      ORDER BY lo.created_at DESC`,
  );
  const ready = await listManifests({ status: "READY" });

  return (
    <>
      <PageHeader
        eyebrow="Saida"
        title="Carregamento"
        description="Conferencia volume a volume na doca. Cada bip valida se o volume pertence ao romaneio e ja foi conferido."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Card className="p-4"><Metric label="Em andamento" value={fmtNumber(rows.filter((r) => r.status === "IN_PROGRESS").length)} tone="accent" size="sm" /></Card>
        <Card className="p-4"><Metric label="Concluidos" value={fmtNumber(rows.filter((r) => r.status === "COMPLETED").length)} tone="success" size="sm" /></Card>
        <Card className="p-4"><Metric label="Volumes carregados" value={fmtNumber(rows.reduce((s, r) => s + r.loaded_volumes, 0))} size="sm" /></Card>
        <Card className="p-4"><Metric label="Romaneios liberados" value={fmtNumber(ready.length)} size="sm" hint="aguardando carregamento" /></Card>
      </div>

      {ready.length > 0 && (
        <Card className="mb-5">
          <p className="label mb-3">Romaneios liberados aguardando carregamento</p>
          <div className="flex flex-wrap gap-2">
            {ready.map((m) => (
              <Link key={m.id} href={`/shipping/manifests/${m.id}`}
                className="flex items-center gap-2.5 px-3 h-9 rounded-md border border-accent/30 bg-accent/[0.06] hover:border-accent/60 transition-colors">
                <span className="code text-[12.5px]">{m.id}</span>
                <span className="text-[12px] text-secondary">{m.route}</span>
                <span className="text-[11.5px] text-faint tnum">{m.total_volumes} vol</span>
                <IconArrowRight size={13} />
              </Link>
            ))}
          </div>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconTruckOut size={18} />}
            title="Nenhum carregamento"
            description="Libere um romaneio para iniciar o carregamento na doca."
            action={<Link href="/shipping/manifests" className="btn btn-sm">Ir para romaneios</Link>}
          />
        </Card>
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
            <table className="table">
              <thead>
                <tr><th>Carregamento</th><th>Romaneio</th><th>Rota</th><th>Veiculo</th><th>Doca</th>
                  <th>Status</th><th className="num">Volumes</th><th style={{ width: 120 }}>Progresso</th>
                  <th>Lacre</th><th>Operador</th><th>Inicio</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id}>
                    <td><IdChip id={l.id} href={`/shipping/loading/${l.id}`} /></td>
                    <td><IdChip id={l.manifest_id} href={`/shipping/manifests/${l.manifest_id}`} /></td>
                    <td className="max-w-[170px] truncate">{l.route}</td>
                    <td className="code text-secondary">{l.vehicle_plate ?? "—"}</td>
                    <td className="text-secondary">{l.dock_name ?? "—"}</td>
                    <td><StatusBadge status={l.status} meta={TASK_STATUS_META} /></td>
                    <td className="num tnum">{l.loaded_volumes}/{l.expected_volumes}</td>
                    <td>
                      <Progress value={l.loaded_volumes} max={Math.max(1, l.expected_volumes)}
                        tone={l.status === "COMPLETED" ? "success" : "accent"} label={`Progresso ${l.id}`} />
                    </td>
                    <td className="code text-secondary">{l.seal ?? "—"}</td>
                    <td className="text-secondary">{l.operator_name ?? "—"}</td>
                    <td className="text-secondary text-[12px]">{fmtDateTime(l.started_at)}</td>
                    <td>
                      <Link href={`/shipping/loading/${l.id}`} className="btn btn-sm btn-ghost" aria-label={`Abrir carregamento ${l.id}`}>
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
