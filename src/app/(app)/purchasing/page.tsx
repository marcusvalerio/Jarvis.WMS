import Link from "next/link";
import type { Metadata } from "next";
import { listPurchaseOrders, listSuppliers } from "@/domain/services/orders";
import { PageHeader, Card, EmptyState, IdChip, Metric } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/Badge";
import { FilterBar } from "@/components/FilterBar";
import { PURCHASE_STATUS, PURCHASE_STATUS_META } from "@/domain/states";
import { fmtNumber, fmtMoney, fmtWeight, fmtDate } from "@/lib/format";
import { IconCart, IconArrowRight, IconPrint } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Pedidos de compra" };
export const dynamic = "force-dynamic";

export default async function PurchasingPage({
  searchParams,
}: { searchParams: Promise<{ status?: string; search?: string }> }) {
  const sp = await searchParams;
  const rows = listPurchaseOrders({ status: sp.status, search: sp.search });
  const suppliers = listSuppliers();

  return (
    <>
      <PageHeader
        eyebrow="Entrada"
        title="Pedidos de compra"
        description="Origem das cargas do cenario. Cada pedido gera a ordem de recebimento e a nota fiscal simulada correspondente."
        meta={
          <>
            <span className="text-[12.5px] text-secondary"><strong className="text-primary tnum">{rows.length}</strong> pedidos</span>
            <span className="text-[12.5px] text-secondary"><strong className="text-primary tnum">{suppliers.length}</strong> fornecedores</span>
          </>
        }
      />

      <FilterBar
        placeholder="Pedido, fornecedor…"
        selects={[{
          key: "status", label: "Todos os status",
          options: Object.keys(PURCHASE_STATUS).map((s) => ({
            value: s, label: PURCHASE_STATUS_META[s as keyof typeof PURCHASE_STATUS].label,
          })),
        }]}
      />

      {rows.length === 0 ? (
        <Card><EmptyState icon={<IconCart size={18} />} title="Nenhum pedido de compra" /></Card>
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
            <table className="table">
              <thead>
                <tr><th>Pedido</th><th>Fornecedor</th><th>Status</th><th>Comprador</th>
                  <th className="num">Linhas</th><th className="num">Quantidade</th>
                  <th className="num">Peso</th><th className="num">Valor</th>
                  <th>Entrega prevista</th><th>Recebimento</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((po) => (
                  <tr key={po.id}>
                    <td><IdChip id={po.id} href={`/purchasing/${po.id}`} /></td>
                    <td className="max-w-[230px] truncate" title={po.supplier_name}>{po.supplier_name}</td>
                    <td><StatusBadge status={po.status} meta={PURCHASE_STATUS_META} /></td>
                    <td className="text-secondary">{po.buyer ?? "—"}</td>
                    <td className="num tnum">{po.line_count}</td>
                    <td className="num tnum">{fmtNumber(po.total_qty)}</td>
                    <td className="num tnum text-secondary">{fmtWeight(po.total_weight_kg, 1)}</td>
                    <td className="num tnum">{fmtMoney(po.total_value)}</td>
                    <td className="text-secondary text-[12px]">{fmtDate(po.expected_at)}</td>
                    <td>
                      {po.inbound_id
                        ? <IdChip id={po.inbound_id} href={`/receiving/${po.inbound_id}`} />
                        : <span className="text-faint">—</span>}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <Link href={`/documents/purchase-order/${po.id}`} className="btn btn-sm btn-ghost" aria-label={`Imprimir ${po.id}`}>
                          <IconPrint size={13} />
                        </Link>
                        <Link href={`/purchasing/${po.id}`} className="btn btn-sm btn-ghost" aria-label={`Abrir ${po.id}`}>
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

      <Card className="mt-5" padded={false}>
        <div className="p-5 pb-0">
          <h2 className="text-[15px] font-semibold">Fornecedores</h2>
          <p className="text-[12.5px] text-secondary mt-0.5 font-[family-name:var(--font-editorial)]">
            Cadastro usado nos documentos de entrada
          </p>
        </div>
        <div className="overflow-x-auto mt-4">
          <table className="table">
            <thead>
              <tr><th>Codigo</th><th>Razao social</th><th>Nome fantasia</th><th>CNPJ</th>
                <th>Cidade</th><th>Telefone</th><th>E-mail</th></tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td><span className="chip-id">{s.id}</span></td>
                  <td>{s.name}</td>
                  <td className="text-secondary">{s.trade_name}</td>
                  <td className="code text-secondary">{s.cnpj}</td>
                  <td className="text-secondary">{s.city}/{s.state}</td>
                  <td className="text-secondary">{s.phone}</td>
                  <td className="text-secondary text-[12px]">{s.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
