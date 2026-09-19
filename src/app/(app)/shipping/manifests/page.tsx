import Link from "next/link";
import type { Metadata } from "next";
import { listManifests, eligibleOrdersForManifest } from "@/domain/services/shipping";
import { listDocks } from "@/domain/services/warehouse";
import { MANIFEST_SEED } from "@/seed/scenario";
import { PageHeader, Card, EmptyState, IdChip } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/Badge";
import { FilterBar } from "@/components/FilterBar";
import { CreateManifest } from "./parts";
import { MANIFEST_STATUS, MANIFEST_STATUS_META } from "@/domain/states";
import { fmtNumber, fmtWeight, fmtMoney, fmtDateTime } from "@/lib/format";
import { IconDoc, IconArrowRight, IconPrint } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Romaneios" };
export const dynamic = "force-dynamic";

export default async function ManifestsPage({
  searchParams,
}: { searchParams: Promise<{ status?: string; search?: string }> }) {
  const sp = await searchParams;
  const rows = listManifests({ status: sp.status, search: sp.search });
  const eligible = eligibleOrdersForManifest();
  const docks = listDocks().filter((d) => d.kind !== "INBOUND").map((d) => ({ id: d.id, name: d.name }));

  return (
    <>
      <PageHeader
        eyebrow="Saida"
        title="Romaneios de carga"
        description="Consolidacao de pedidos por veiculo e rota. O romaneio so aceita pedidos com conferencia de expedicao aprovada."
        meta={
          <span className="text-[12.5px] text-secondary">
            <strong className="text-primary tnum">{eligible.length}</strong> pedido(s) pronto(s) para consolidar
          </span>
        }
        actions={
          <CreateManifest
            docks={docks}
            defaults={{
              route: MANIFEST_SEED.route, carrier: MANIFEST_SEED.carrier,
              plate: MANIFEST_SEED.vehiclePlate, kind: MANIFEST_SEED.vehicleKind,
              driver: MANIFEST_SEED.driverName, doc: MANIFEST_SEED.driverDoc,
              dock: MANIFEST_SEED.dockId,
            }}
          />
        }
      />

      <FilterBar
        placeholder="Romaneio, rota, placa, motorista…"
        selects={[{
          key: "status", label: "Todos os status",
          options: Object.keys(MANIFEST_STATUS).map((s) => ({
            value: s, label: MANIFEST_STATUS_META[s as keyof typeof MANIFEST_STATUS].label,
          })),
        }]}
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconDoc size={18} />}
            title="Nenhum romaneio"
            description="Crie um romaneio para consolidar os pedidos conferidos e montar a carga do veiculo."
          />
        </Card>
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Romaneio</th><th>Status</th><th>Rota</th><th>Veiculo</th><th>Motorista</th>
                  <th>Doca</th><th className="num">Pedidos</th><th className="num">Volumes</th>
                  <th className="num">Peso</th><th className="num">Valor</th><th>Lacre</th><th>Criado</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td><IdChip id={m.id} href={`/shipping/manifests/${m.id}`} /></td>
                    <td><StatusBadge status={m.status} meta={MANIFEST_STATUS_META} /></td>
                    <td className="max-w-[190px] truncate" title={m.route}>{m.route}</td>
                    <td className="code text-secondary">{m.vehicle_plate ?? "—"}</td>
                    <td className="text-secondary max-w-[150px] truncate">{m.driver_name ?? "—"}</td>
                    <td className="text-secondary">{m.dock_name ?? "—"}</td>
                    <td className="num tnum">{m.total_orders}</td>
                    <td className="num tnum">{m.total_volumes}</td>
                    <td className="num tnum text-secondary">{fmtWeight(m.total_weight_kg, 1)}</td>
                    <td className="num tnum text-secondary">{fmtMoney(m.total_value)}</td>
                    <td className="code text-secondary">{m.seal ?? "—"}</td>
                    <td className="text-secondary text-[12px]">{fmtDateTime(m.created_at)}</td>
                    <td>
                      <div className="flex gap-1">
                        <Link href={`/documents/manifest/${m.id}`} className="btn btn-sm btn-ghost" aria-label={`Imprimir ${m.id}`}>
                          <IconPrint size={13} />
                        </Link>
                        <Link href={`/shipping/manifests/${m.id}`} className="btn btn-sm btn-ghost" aria-label={`Abrir ${m.id}`}>
                          <IconArrowRight size={13} />
                        </Link>
                      </div>
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
