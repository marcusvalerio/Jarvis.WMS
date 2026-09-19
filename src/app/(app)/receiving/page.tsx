import Link from "next/link";
import type { Metadata } from "next";
import { listInbound } from "@/domain/services/receiving";
import { listDocks } from "@/domain/services/warehouse";
import { PageHeader, Card, EmptyState, IdChip, Progress } from "@/components/ui/Primitives";
import { StatusBadge } from "@/components/ui/Badge";
import { FilterBar } from "@/components/FilterBar";
import { INBOUND_STATUS_META, INBOUND_STATUS } from "@/domain/states";
import { fmtDateTime, fmtNumber, fmtWeight, relativeTime } from "@/lib/format";
import { IconTruckIn, IconArrowRight } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Recebimento" };
export const dynamic = "force-dynamic";

export default async function ReceivingPage({
  searchParams,
}: { searchParams: Promise<{ status?: string; search?: string }> }) {
  const sp = await searchParams;
  const orders = listInbound({ status: sp.status, search: sp.search });
  const docks = listDocks().filter((d) => d.kind !== "OUTBOUND");

  const open = orders.filter((o) => !["COMPLETED", "CANCELLED"].includes(o.status));
  const done = orders.filter((o) => o.status === "COMPLETED");

  return (
    <>
      <PageHeader
        eyebrow="Entrada"
        title="Recebimento"
        description="Do agendamento a armazenagem: portaria, doca, pesagem, conferencia fisica, paletizacao e enderecamento."
        meta={
          <>
            <span className="text-[12.5px] text-secondary">
              <strong className="text-primary tnum">{open.length}</strong> em andamento
            </span>
            <span className="text-[12.5px] text-secondary">
              <strong className="text-primary tnum">{done.length}</strong> concluidos
            </span>
            <span className="text-[12.5px] text-secondary">
              Docas de entrada: {docks.filter((d) => d.status === "FREE").length}/{docks.length} livres
            </span>
          </>
        }
      />

      <FilterBar
        placeholder="Ordem, fornecedor, placa, NF…"
        selects={[{
          key: "status",
          label: "Todos os status",
          options: Object.keys(INBOUND_STATUS).map((s) => ({
            value: s, label: INBOUND_STATUS_META[s as keyof typeof INBOUND_STATUS].label,
          })),
        }]}
      />

      {orders.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconTruckIn size={18} />}
            title="Nenhum recebimento encontrado"
            description="Ajuste os filtros ou verifique o cenario carregado na simulacao."
            action={<Link href="/simulation" className="btn btn-sm">Abrir simulacao</Link>}
          />
        </Card>
      ) : (
        <Card padded={false}>
          <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
            <table className="table">
              <thead>
                <tr>
                  <th>Ordem</th>
                  <th>Fornecedor</th>
                  <th>NF simulada</th>
                  <th>Status</th>
                  <th>Veiculo</th>
                  <th>Doca</th>
                  <th className="num">Previsto</th>
                  <th className="num">Conferido</th>
                  <th style={{ width: 120 }}>Conferencia</th>
                  <th>Agendado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const pct = o.expected_qty > 0 ? (o.checked_qty / o.expected_qty) * 100 : 0;
                  return (
                    <tr key={o.id}>
                      <td><IdChip id={o.id} href={`/receiving/${o.id}`} /></td>
                      <td className="max-w-[220px] truncate" title={o.supplier_name}>{o.supplier_name}</td>
                      <td>
                        {o.invoice_id
                          ? <Link href={`/documents/invoice/${o.invoice_id}`} className="link code">{o.invoice_number}/{o.invoice_series}</Link>
                          : <span className="text-faint">—</span>}
                      </td>
                      <td><StatusBadge status={o.status} meta={INBOUND_STATUS_META} /></td>
                      <td className="code text-secondary">{o.vehicle_plate ?? "—"}</td>
                      <td className="text-secondary">{o.dock_id ?? "—"}</td>
                      <td className="num tnum">{fmtNumber(o.expected_qty)}</td>
                      <td className="num tnum">{o.checked_qty > 0 ? fmtNumber(o.checked_qty) : "—"}</td>
                      <td>
                        <Progress
                          value={o.checked_qty} max={Math.max(1, o.expected_qty)}
                          tone={pct >= 100 ? "success" : "accent"}
                          label={`Conferencia de ${o.id}`}
                        />
                      </td>
                      <td className="text-secondary text-[12px]" title={fmtDateTime(o.scheduled_at)}>
                        {relativeTime(o.scheduled_at)}
                      </td>
                      <td>
                        <Link href={`/receiving/${o.id}`} className="btn btn-sm btn-ghost" aria-label={`Abrir ${o.id}`}>
                          <IconArrowRight size={13} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
        {docks.map((d) => (
          <Card key={d.id} className="p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="label">{d.name}</p>
              <span
                className={`w-2 h-2 rounded-full ${d.status === "OCCUPIED" ? "bg-accent pulse-dot" : d.status === "BLOCKED" ? "bg-error" : "bg-[#3A4245]"}`}
                aria-hidden
              />
            </div>
            <p className="text-[13px] text-primary">
              {d.status === "OCCUPIED" ? (
                <Link href={`/receiving/${d.current_ref}`} className="link code">{d.current_ref}</Link>
              ) : (
                <span className="text-secondary">Livre</span>
              )}
            </p>
          </Card>
        ))}
      </div>
    </>
  );
}
