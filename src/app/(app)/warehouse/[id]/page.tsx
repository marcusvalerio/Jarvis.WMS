import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { locationDetail } from "@/domain/services/warehouse";
import { PageHeader, Card, CardHeader, MetaItem, EmptyState, IdChip } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/Badge";
import { Barcode } from "@/components/Barcode";
import { LocationStatusForm } from "./parts";
import { LOCATION_STATUS_META, MOVEMENT_KIND_LABEL } from "@/domain/states";
import { fmtNumber, fmtDate, fmtDateTime, fmtWeight } from "@/lib/format";
import { IconPrint } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Endereco ${id}` };
}

export default async function LocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = locationDetail(id);
  if (!data) notFound();
  const { location, contents, lastMoves } = data;

  const occupied = contents.reduce((s: number, c: any) => s + c.qty_on_hand, 0);

  return (
    <>
      <PageHeader
        eyebrow={`${location.zone_name} · corredor ${location.aisle} · modulo ${location.rack} · nivel ${location.level}`}
        title={location.code}
        description={`Identificador de leitura: ${location.id}`}
        meta={
          <>
            <StatusBadge status={location.status} meta={LOCATION_STATUS_META} />
            <MetaItem label="Capacidade" value={`${fmtNumber(location.capacity_units)} un / ${location.capacity_pallets} palete(s)`} />
            <MetaItem label="Ocupacao" value={`${fmtNumber(occupied)} un`} />
            <MetaItem label="Rota de picking" value={location.pick_sequence} />
          </>
        }
        actions={
          <Link href={`/documents/location-label/${location.id}`} className="btn btn-sm">
            <IconPrint size={13} /> Etiqueta
          </Link>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <div className="xl:col-span-2 flex flex-col gap-5">
          <Card padded={false}>
            <div className="p-5 pb-0">
              <CardHeader title="Conteudo" subtitle={`${contents.length} registro(s) de estoque`} />
            </div>
            {contents.length === 0 ? (
              <EmptyState title="Endereco vazio" description="Nenhum estoque alocado nesta posicao." />
            ) : (
              <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
                <table className="table">
                  <thead>
                    <tr>
                      <th>SKU</th><th>Produto</th><th>Palete</th><th>Lote</th><th>Validade</th>
                      <th className="num">Saldo</th><th className="num">Reservado</th>
                      <th className="num">Bloqueado</th><th className="num">Peso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contents.map((c: any) => (
                      <tr key={c.id}>
                        <td><span className="chip-id">{c.sku}</span></td>
                        <td className="max-w-[220px] truncate" title={c.description}>{c.description}</td>
                        <td>{c.pallet_id ? <IdChip id={c.pallet_id} href={`/warehouse/pallets/${c.pallet_id}`} /> : <span className="text-faint">—</span>}</td>
                        <td className="code text-secondary">{c.lot_code ?? "—"}</td>
                        <td className="text-secondary">{c.expires_at ? fmtDate(c.expires_at) : "—"}</td>
                        <td className="num tnum">{fmtNumber(c.qty_on_hand)}</td>
                        <td className="num tnum text-warning">{c.qty_reserved > 0 ? fmtNumber(c.qty_reserved) : "—"}</td>
                        <td className="num tnum text-error">{c.qty_blocked > 0 ? fmtNumber(c.qty_blocked) : "—"}</td>
                        <td className="num tnum text-secondary">{fmtWeight(c.weight_kg, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card padded={false}>
            <div className="p-5 pb-0">
              <CardHeader title="Movimentacoes" subtitle="Ultimos 15 movimentos neste endereco" />
            </div>
            {lastMoves.length === 0 ? (
              <EmptyState title="Sem movimentacao" description="Nenhum movimento registrado nesta posicao." />
            ) : (
              <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
                <table className="table">
                  <thead>
                    <tr><th>Movimento</th><th>Tipo</th><th>SKU</th><th className="num">Qtd</th><th>Sentido</th><th>Data</th></tr>
                  </thead>
                  <tbody>
                    {lastMoves.map((m: any) => (
                      <tr key={m.id}>
                        <td><IdChip id={m.id} /></td>
                        <td className="text-secondary">{MOVEMENT_KIND_LABEL[m.kind as keyof typeof MOVEMENT_KIND_LABEL] ?? m.kind}</td>
                        <td><span className="chip-id">{m.sku}</span></td>
                        <td className="num tnum">{fmtNumber(m.quantity)}</td>
                        <td className={m.to_location_id === location.id ? "text-success" : "text-info"}>
                          {m.to_location_id === location.id ? "entrada" : "saida"}
                        </td>
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
            <CardHeader title="Etiqueta de endereco" subtitle="Code 128 · valor igual ao identificador" />
            <div className="flex justify-center py-2">
              <Barcode value={location.id} height={60} moduleWidth={2} />
            </div>
            <p className="text-center text-[12.5px] text-secondary mt-2">
              A coletora aceita <span className="code">{location.code}</span> ou <span className="code">{location.id}</span>.
            </p>
          </Card>

          <Card>
            <CardHeader title="Status do endereco" subtitle="Bloqueio impede alocacao e picking" />
            <LocationStatusForm locationId={location.id} current={location.status} />
            {location.blocked_reason && (
              <p className="text-[12px] text-warning mt-3">Motivo: {location.blocked_reason}</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
