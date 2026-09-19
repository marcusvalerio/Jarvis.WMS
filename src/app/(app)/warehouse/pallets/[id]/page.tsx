import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPallet } from "@/domain/services/receiving";
import { locationMap } from "@/domain/services/warehouse";
import { tracePallet } from "@/domain/services/traceability";
import { listMovements } from "@/domain/services/inventory";
import { PageHeader, Card, CardHeader, MetaItem, EmptyState, IdChip } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/Badge";
import { Barcode } from "@/components/Barcode";
import { Timeline } from "@/components/Timeline";
import { TransferForm } from "./parts";
import { PALLET_STATUS_META, MOVEMENT_KIND_LABEL } from "@/domain/states";
import { fmtNumber, fmtWeight, fmtDate, fmtDateTime } from "@/lib/format";
import { IconPrint } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Palete ${id}` };
}

export default async function PalletPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPallet(id);
  if (!data) notFound();
  const { pallet, items, stock } = data;
  const trace = await tracePallet(id);
  const moves = await listMovements({ palletId: id, limit: 30 });
  const locations = (await locationMap())
    .filter((l) => l.kind === "PALLET" && l.status !== "BLOCKED")
    .map((l) => ({ id: l.id, code: l.code, zone: l.zone_name }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return (
    <>
      <PageHeader
        eyebrow={`Palete ${pallet.kind} · origem ${pallet.origin_ref ?? pallet.origin_kind}`}
        title={pallet.id}
        meta={
          <>
            <StatusBadge status={pallet.status} meta={PALLET_STATUS_META} />
            <MetaItem label="Endereco" value={pallet.location_code ?? "—"} />
            <MetaItem label="Zona" value={pallet.zone_name ?? "—"} />
            <MetaItem label="Peso liquido" value={fmtWeight(pallet.net_weight_kg, 1)} />
            <MetaItem label="Peso bruto" value={fmtWeight(pallet.gross_weight_kg, 1)} />
            <MetaItem label="Montado" value={fmtDateTime(pallet.created_at)} />
          </>
        }
        actions={
          <Link href={`/documents/pallet-label/${pallet.id}`} className="btn btn-sm">
            <IconPrint size={13} /> Etiqueta do palete
          </Link>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <div className="xl:col-span-2 flex flex-col gap-5">
          <Card padded={false}>
            <div className="p-5 pb-0"><CardHeader title="Conteudo do palete" subtitle={`${items.length} item(ns)`} /></div>
            <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
              <table className="table">
                <thead>
                  <tr><th>SKU</th><th>Produto</th><th>Lote</th><th>Validade</th><th className="num">Montado</th><th className="num">Saldo atual</th></tr>
                </thead>
                <tbody>
                  {items.map((it: any) => {
                    const s = stock.find((x: any) => x.product_id === it.product_id);
                    return (
                      <tr key={it.id}>
                        <td><span className="chip-id">{it.sku}</span></td>
                        <td className="max-w-[240px] truncate" title={it.description}>{it.description}</td>
                        <td className="code text-secondary">{it.lot_code ?? "—"}</td>
                        <td className="text-secondary">{it.expires_at ? fmtDate(it.expires_at) : "—"}</td>
                        <td className="num tnum">{fmtNumber(it.quantity)}</td>
                        <td className="num tnum">
                          <span className={(s?.qty_on_hand ?? 0) > 0 ? "text-primary" : "text-faint"}>
                            {fmtNumber(s?.qty_on_hand ?? 0)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card padded={false}>
            <div className="p-5 pb-0"><CardHeader title="Movimentacoes" subtitle={`${moves.length} movimento(s)`} /></div>
            {moves.length === 0 ? (
              <EmptyState title="Sem movimentacao" />
            ) : (
              <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
                <table className="table">
                  <thead>
                    <tr><th>Movimento</th><th>Tipo</th><th>SKU</th><th className="num">Qtd</th><th>De</th><th>Para</th><th>Operador</th><th>Data</th></tr>
                  </thead>
                  <tbody>
                    {moves.map((m) => (
                      <tr key={m.id}>
                        <td><IdChip id={m.id} /></td>
                        <td className="text-secondary">{MOVEMENT_KIND_LABEL[m.kind] ?? m.kind}</td>
                        <td><span className="chip-id">{m.sku}</span></td>
                        <td className="num tnum">{fmtNumber(m.quantity)}</td>
                        <td className="code text-secondary">{m.from_code ?? "—"}</td>
                        <td className="code text-secondary">{m.to_code ?? "—"}</td>
                        <td className="text-secondary">{m.operator_name ?? m.operator_id ?? "—"}</td>
                        <td className="text-secondary text-[12px]">{fmtDateTime(m.occurred_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Etiqueta" subtitle="Code 128 · leitura direta na coletora" />
            <div className="flex justify-center py-2">
              <Barcode value={pallet.id} height={62} moduleWidth={2} />
            </div>
          </Card>

          {pallet.status === "STORED" && (
            <Card>
              <CardHeader title="Transferencia interna" subtitle="Move todo o conteudo para outro endereco" />
              <TransferForm palletId={pallet.id} locations={locations} current={pallet.location_id} />
            </Card>
          )}

          <Card>
            <CardHeader title="Rastreabilidade" subtitle="Do recebimento ate a expedicao" />
            <Timeline nodes={trace.timeline} compact />
          </Card>
        </div>
      </div>
    </>
  );
}
