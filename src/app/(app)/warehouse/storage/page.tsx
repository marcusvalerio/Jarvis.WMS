import Link from "next/link";
import type { Metadata } from "next";
import { listStorageOrders } from "@/domain/services/receiving";
import { locationMap } from "@/domain/services/warehouse";
import { PageHeader, Card, CardHeader, EmptyState, IdChip } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/Badge";
import { StorageQueueItem } from "./parts";
import { TASK_STATUS_META } from "@/domain/states";
import { fmtNumber, fmtDateTime } from "@/lib/format";
import { IconPallet, IconScan } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Armazenagem" };
export const dynamic = "force-dynamic";

export default function StoragePage() {
  const orders = listStorageOrders();
  const pending = orders.filter((o) => o.status !== "COMPLETED");
  const done = orders.filter((o) => o.status === "COMPLETED");

  const locations = locationMap()
    .filter((l) => l.kind === "PALLET" && l.status !== "BLOCKED")
    .map((l) => ({ id: l.id, code: l.code, zone: l.zone_name, free: l.qty === 0 }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return (
    <>
      <PageHeader
        eyebrow="Armazem"
        title="Fila de armazenagem"
        description="Paletes recebidos aguardando enderecamento. O WMS sugere a posicao; o operador confirma pela coletora ou por aqui."
        meta={
          <>
            <span className="text-[12.5px] text-secondary"><strong className="text-primary tnum">{pending.length}</strong> pendentes</span>
            <span className="text-[12.5px] text-secondary"><strong className="text-primary tnum">{done.length}</strong> concluidas</span>
          </>
        }
        actions={<Link href="/mobile/putaway" className="btn btn-sm btn-primary"><IconScan size={13} /> Executar na coletora</Link>}
      />

      {pending.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconPallet size={18} />}
            title="Nenhum palete aguardando armazenagem"
            description="Conclua a conferencia de um recebimento e monte paletes para alimentar esta fila."
            action={<Link href="/receiving" className="btn btn-sm">Ir para recebimento</Link>}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((o) => <StorageQueueItem key={o.id} order={o} locations={locations} />)}
        </div>
      )}

      {done.length > 0 && (
        <Card className="mt-5" padded={false}>
          <div className="p-5 pb-0">
            <CardHeader title="Armazenagens concluidas" subtitle={`${done.length} ordem(ns)`} />
          </div>
          <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
            <table className="table">
              <thead>
                <tr><th>Ordem</th><th>Palete</th><th>SKU</th><th className="num">Qtd</th><th>Sugerido</th><th>Confirmado</th><th>Operador</th><th>Conclusao</th></tr>
              </thead>
              <tbody>
                {done.map((o) => (
                  <tr key={o.id}>
                    <td><IdChip id={o.id} /></td>
                    <td><IdChip id={o.pallet_id} href={`/warehouse/pallets/${o.pallet_id}`} /></td>
                    <td>{o.sku ? <span className="chip-id">{o.sku}</span> : "—"}</td>
                    <td className="num tnum">{fmtNumber(o.qty)}</td>
                    <td className="code text-secondary">{o.suggested_code ?? "—"}</td>
                    <td className={`code ${o.final_code !== o.suggested_code ? "text-warning" : "text-accent"}`}>
                      {o.final_code ?? "—"}
                    </td>
                    <td className="text-secondary">{o.operator_name ?? "—"}</td>
                    <td className="text-secondary text-[12px]">{fmtDateTime(o.completed_at)}</td>
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
