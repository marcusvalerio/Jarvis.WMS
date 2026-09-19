import Link from "next/link";
import type { Metadata } from "next";
import { stockByProduct } from "@/domain/services/inventory";
import { all, scalar } from "@/lib/db";
import { PageHeader, Card, EmptyState, Metric, Progress } from "@/components/ui/Primitives";
import { Badge } from "@/components/ui/Badge";
import { FilterBar } from "@/components/FilterBar";
import { fmtNumber, fmtWeight } from "@/lib/format";
import { IconBox, IconArrowRight } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Estoque" };
export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: { searchParams: Promise<{ search?: string; view?: string }> }) {
  const sp = await searchParams;
  const lines = await stockByProduct({ search: sp.search, onlyWithStock: sp.view === "stocked" });

  const totals = lines.reduce(
    (a, l) => ({
      onHand: a.onHand + l.on_hand, reserved: a.reserved + l.reserved,
      blocked: a.blocked + l.blocked, available: a.available + l.available,
      weight: a.weight + l.weight_kg,
    }),
    { onHand: 0, reserved: 0, blocked: 0, available: 0, weight: 0 },
  );
  const below = lines.filter((l) => l.on_hand < l.min_stock);

  return (
    <>
      <PageHeader
        eyebrow="Armazem"
        title="Estoque"
        description="Saldo por SKU consolidado dos registros de estoque. Disponivel = saldo − reservado − bloqueado."
        actions={<Link href="/inventory/movements" className="btn btn-sm">Movimentacoes <IconArrowRight size={13} /></Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Card className="p-4"><Metric label="Saldo fisico" value={fmtNumber(totals.onHand)} unit="un" size="sm" /></Card>
        <Card className="p-4"><Metric label="Disponivel" value={fmtNumber(totals.available)} unit="un" tone="success" size="sm" /></Card>
        <Card className="p-4"><Metric label="Reservado" value={fmtNumber(totals.reserved)} unit="un" tone="warning" size="sm" /></Card>
        <Card className="p-4"><Metric label="Bloqueado" value={fmtNumber(totals.blocked)} unit="un" tone={totals.blocked > 0 ? "error" : "muted"} size="sm" /></Card>
        <Card className="p-4"><Metric label="Peso total" value={fmtNumber(totals.weight, 1)} unit="kg" size="sm" /></Card>
      </div>

      <FilterBar
        placeholder="SKU, descricao, categoria…"
        selects={[{
          key: "view", label: "Todos os produtos",
          options: [{ value: "stocked", label: "Somente com saldo" }],
        }]}
      />

      {lines.length === 0 ? (
        <Card><EmptyState icon={<IconBox size={18} />} title="Nenhum produto encontrado" /></Card>
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
            <table className="table">
              <thead>
                <tr>
                  <th>SKU</th><th>Descricao</th><th>Categoria</th><th>Classe</th>
                  <th className="num">Saldo</th><th className="num">Reservado</th>
                  <th className="num">Bloqueado</th><th className="num">Disponivel</th>
                  <th style={{ width: 110 }}>Alocacao</th>
                  <th className="num">Enderecos</th><th className="num">Peso</th><th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.product_id}>
                    <td><span className="chip-id">{l.sku}</span></td>
                    <td className="max-w-[260px] truncate" title={l.description}>{l.description}</td>
                    <td className="text-secondary">{l.category}</td>
                    <td><Badge tone={l.abc_class === "A" ? "accent" : l.abc_class === "B" ? "info" : "neutral"}>{l.abc_class}</Badge></td>
                    <td className="num tnum">{fmtNumber(l.on_hand)}</td>
                    <td className="num tnum text-warning-fg">{l.reserved > 0 ? fmtNumber(l.reserved) : "—"}</td>
                    <td className="num tnum text-error-fg">{l.blocked > 0 ? fmtNumber(l.blocked) : "—"}</td>
                    <td className="num tnum font-medium text-success-fg">{fmtNumber(l.available)}</td>
                    <td>
                      <Progress
                        value={l.reserved + l.blocked} max={Math.max(1, l.on_hand)}
                        tone="warning" label={`Alocacao de ${l.sku}`}
                      />
                    </td>
                    <td className="num tnum text-secondary">{l.locations}</td>
                    <td className="num tnum text-secondary">{fmtWeight(l.weight_kg, 1)}</td>
                    <td>
                      <Link href={`/inventory/${l.product_id}`} className="btn btn-sm btn-ghost" aria-label={`Abrir ${l.sku}`}>
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

      {below.length > 0 && (
        <Card className="mt-5">
          <p className="label mb-2">Abaixo do estoque minimo</p>
          <div className="flex flex-wrap gap-2">
            {below.map((l) => (
              <Link key={l.product_id} href={`/inventory/${l.product_id}`} className="badge badge-warning">
                {l.sku} · {fmtNumber(l.on_hand)}/{fmtNumber(l.min_stock)}
              </Link>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
