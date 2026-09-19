import Link from "next/link";
import type { Metadata } from "next";
import { listMovements, countMovements } from "@/domain/services/inventory";
import { all } from "@/lib/db";
import { PageHeader, Card, EmptyState, IdChip, Metric } from "@/components/ui/Primitives";
import { Badge } from "@/components/ui/Badge";
import { FilterBar } from "@/components/FilterBar";
import { MOVEMENT_KIND, MOVEMENT_KIND_LABEL } from "@/domain/states";
import { fmtNumber, fmtDateTime, fmtWeight } from "@/lib/format";
import { IconGrid } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Movimentacoes" };
export const dynamic = "force-dynamic";

const TONE: Record<string, any> = {
  RECEIPT: "success", RETURN: "success", SHIP: "info", PICK: "accent",
  PUTAWAY: "accent", TRANSFER: "neutral", COUNT: "warning",
  ADJUSTMENT: "warning", BLOCK: "error", UNBLOCK: "info", PACK: "info",
};

export default async function MovementsPage({
  searchParams,
}: { searchParams: Promise<{ kind?: string; search?: string; product?: string }> }) {
  const sp = await searchParams;
  const moves = listMovements({ kind: sp.kind, search: sp.search, productId: sp.product, limit: 300 });
  const total = countMovements();
  const byKind = all<{ kind: string; n: number }>(
    `SELECT kind, COUNT(*) AS n FROM inventory_movements GROUP BY kind ORDER BY n DESC`,
  );

  return (
    <>
      <PageHeader
        eyebrow="Armazem"
        title="Movimentacoes de estoque"
        description="Toda alteracao de saldo gera um movimento. Nao existe alteracao silenciosa de estoque neste sistema."
        meta={<span className="text-[12.5px] text-secondary"><strong className="text-primary tnum">{fmtNumber(total)}</strong> movimentos registrados</span>}
      />

      <div className="flex flex-wrap gap-2 mb-5">
        {byKind.map((k) => (
          <Link
            key={k.kind}
            href={sp.kind === k.kind ? "/inventory/movements" : `/inventory/movements?kind=${k.kind}`}
            className={`badge ${sp.kind === k.kind ? "badge-accent" : "badge-neutral"}`}
          >
            {MOVEMENT_KIND_LABEL[k.kind as keyof typeof MOVEMENT_KIND_LABEL] ?? k.kind}
            <span className="tnum opacity-70">{k.n}</span>
          </Link>
        ))}
      </div>

      <FilterBar
        placeholder="Movimento, referencia, SKU, palete…"
        selects={[{
          key: "kind", label: "Todos os tipos",
          options: Object.keys(MOVEMENT_KIND).map((k) => ({
            value: k, label: MOVEMENT_KIND_LABEL[k as keyof typeof MOVEMENT_KIND],
          })),
        }]}
      />

      {moves.length === 0 ? (
        <Card><EmptyState icon={<IconGrid size={18} />} title="Nenhum movimento encontrado" /></Card>
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Movimento</th><th>Tipo</th><th>SKU</th><th>Lote</th>
                  <th className="num">Qtd</th><th>Origem</th><th>Destino</th><th>Palete</th>
                  <th className="num">Saldo apos</th><th>Referencia</th><th>Operador</th><th>Data</th>
                </tr>
              </thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.id}>
                    <td><IdChip id={m.id} /></td>
                    <td><Badge tone={TONE[m.kind] ?? "neutral"}>{MOVEMENT_KIND_LABEL[m.kind] ?? m.kind}</Badge></td>
                    <td><Link href={`/inventory/${m.product_id}`} className="chip-id hover:opacity-80">{m.sku}</Link></td>
                    <td className="code text-secondary">{m.lot_code ?? "—"}</td>
                    <td className="num tnum">{fmtNumber(m.quantity)}</td>
                    <td className="code text-secondary">{m.from_code ?? "—"}</td>
                    <td className="code text-secondary">{m.to_code ?? "—"}</td>
                    <td className="code text-secondary">{m.pallet_id ?? "—"}</td>
                    <td className="num tnum">{fmtNumber(m.balance_after ?? 0)}</td>
                    <td className="text-secondary text-[12px] max-w-[130px] truncate" title={`${m.ref_kind ?? ""} ${m.ref_id ?? ""}`}>
                      {m.ref_id ?? "—"}
                    </td>
                    <td className="text-secondary text-[12px]">{m.operator_name ?? m.operator_id ?? "sistema"}</td>
                    <td className="text-secondary text-[12px]">{fmtDateTime(m.occurred_at)}</td>
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
