import Link from "next/link";
import type { Metadata } from "next";
import { listPallets } from "@/domain/services/receiving";
import { PageHeader, Card, EmptyState, IdChip } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/Badge";
import { FilterBar } from "@/components/FilterBar";
import { PALLET_STATUS, PALLET_STATUS_META } from "@/domain/states";
import { fmtNumber, fmtWeight, fmtDateTime } from "@/lib/format";
import { IconPallet, IconPrint } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Paletes" };
export const dynamic = "force-dynamic";

export default async function PalletsPage({
  searchParams,
}: { searchParams: Promise<{ status?: string; search?: string }> }) {
  const sp = await searchParams;
  const pallets = listPallets({ status: sp.status, search: sp.search });

  return (
    <>
      <PageHeader
        eyebrow="Armazem"
        title="Paletes"
        description="Unidades de movimentacao identificadas por codigo de barras. Cada palete carrega produto, lote, validade, peso e origem."
        meta={<span className="text-[12.5px] text-secondary"><strong className="text-primary tnum">{pallets.length}</strong> paletes no cenario</span>}
        actions={<Link href="/documents?group=armazenagem" className="btn btn-sm"><IconPrint size={13} /> Etiquetas</Link>}
      />

      <FilterBar
        placeholder="Palete, endereco, origem…"
        selects={[{
          key: "status", label: "Todos os status",
          options: Object.keys(PALLET_STATUS).map((s) => ({
            value: s, label: PALLET_STATUS_META[s as keyof typeof PALLET_STATUS].label,
          })),
        }]}
      />

      {pallets.length === 0 ? (
        <Card>
          <EmptyState icon={<IconPallet size={18} />} title="Nenhum palete encontrado"
            description="Paletes sao criados na paletizacao do recebimento ou pelo estoque inicial do cenario." />
        </Card>
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
            <table className="table">
              <thead>
                <tr>
                  <th>Palete</th><th>Status</th><th>SKU principal</th><th className="num">Linhas</th>
                  <th className="num">Quantidade</th><th className="num">Saldo atual</th>
                  <th className="num">Peso liquido</th><th>Endereco</th><th>Origem</th><th>Criado</th><th />
                </tr>
              </thead>
              <tbody>
                {pallets.map((p) => (
                  <tr key={p.id}>
                    <td><IdChip id={p.id} href={`/warehouse/pallets/${p.id}`} /></td>
                    <td><StatusBadge status={p.status} meta={PALLET_STATUS_META} /></td>
                    <td>{p.main_sku ? <span className="chip-id">{p.main_sku}</span> : "—"}</td>
                    <td className="num tnum">{p.line_count}</td>
                    <td className="num tnum">{fmtNumber(p.total_qty)}</td>
                    <td className="num tnum">
                      <span className={p.on_hand > 0 ? "text-primary" : "text-faint"}>{fmtNumber(p.on_hand)}</span>
                    </td>
                    <td className="num tnum text-secondary">{fmtWeight(p.net_weight_kg, 1)}</td>
                    <td className="code text-secondary">{p.location_code ?? "—"}</td>
                    <td className="text-secondary text-[12px]">{p.origin_ref ?? p.origin_kind}</td>
                    <td className="text-secondary text-[12px]">{fmtDateTime(p.created_at)}</td>
                    <td>
                      <Link href={`/documents/pallet-label/${p.id}`} className="btn btn-sm btn-ghost" aria-label={`Etiqueta de ${p.id}`}>
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
