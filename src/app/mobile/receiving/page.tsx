import Link from "next/link";
import { all, one } from "@/lib/db";
import { getInbound } from "@/domain/services/receiving";
import { RfLink, RfPanel } from "@/components/rf/Kit";
import { ReceivingTerminal } from "./parts";
import { fmtNumber } from "@/lib/format";

export const metadata = { title: "Conferencia" };
export const dynamic = "force-dynamic";

export default async function MobileReceivingPage({
  searchParams,
}: { searchParams: Promise<{ id?: string }> }) {
  const sp = await searchParams;
  const open = all<any>(
    `SELECT rc.*, io.id AS inbound_id, s.name AS supplier_name,
            (SELECT COUNT(*) FROM receiving_check_items ci WHERE ci.check_id = rc.id AND ci.status = 'PENDING') AS pending
       FROM receiving_checks rc
       JOIN inbound_orders io ON io.id = rc.inbound_order_id
       JOIN suppliers s ON s.id = io.supplier_id
      WHERE rc.status = 'IN_PROGRESS' ORDER BY rc.started_at DESC`,
  );
  const selectedCheck = sp.id
    ? one<any>(`SELECT * FROM receiving_checks WHERE id = ?`, sp.id)
    : open.length === 1 ? open[0] : null;

  if (!selectedCheck) {
    return (
      <>
        <h1 className="text-[22px] font-[family-name:var(--font-display)] font-semibold mb-1">
          Conferencia de recebimento
        </h1>
        <p className="text-[13.5px] text-secondary mb-5 leading-snug">
          Selecione a conferencia em andamento.
        </p>
        {open.length === 0 ? (
          <p className="text-[13px] text-faint py-6 text-center border border-dashed border-border rounded-xl">
            Nenhuma conferencia aberta. Inicie a conferencia no recebimento pelo desktop.
          </p>
        ) : (
          <nav className="flex flex-col gap-2.5">
            {open.map((c) => (
              <RfLink
                key={c.id} href={`/mobile/receiving?id=${c.id}`} title={c.inbound_id}
                subtitle={`${c.supplier_name} · conferencia ${c.id}`} badge={c.pending}
              />
            ))}
          </nav>
        )}
      </>
    );
  }

  const inbound = getInbound(selectedCheck.inbound_order_id);
  if (!inbound) return null;
  const pending = inbound.checkItems.filter((i: any) => i.status === "PENDING");
  const current = pending[0];

  return (
    <>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="text-[11px] tracking-[0.14em] uppercase text-faint font-[family-name:var(--font-editorial)]">
            Conferencia · {inbound.order.supplier_name}
          </p>
          <h1 className="text-[22px] font-[family-name:var(--font-display)] font-semibold leading-tight">
            {inbound.order.id}
          </h1>
        </div>
        <div className="text-right flex-none">
          <p className="text-[11px] tracking-[0.12em] uppercase text-faint">Linhas</p>
          <p className="text-[24px] font-[family-name:var(--font-display)] font-semibold tnum text-accent leading-none mt-1">
            {inbound.checkItems.length - pending.length}/{inbound.checkItems.length}
          </p>
        </div>
      </div>

      {current ? (
        <ReceivingTerminal checkId={selectedCheck.id} item={current} />
      ) : (
        <div className="flex flex-col gap-4">
          <RfPanel
            eyebrow="Conferencia completa"
            title="TODAS AS LINHAS CONFERIDAS"
            subtitle="Encerre a conferencia no desktop para liberar a paletizacao."
            tone="accent"
          />
          <Link href={`/receiving/${inbound.order.id}`} className="btn btn-lg w-full justify-center">
            Abrir recebimento
          </Link>
        </div>
      )}

      <section className="mt-7">
        <h2 className="text-[12px] tracking-[0.12em] uppercase text-faint mb-3 font-[family-name:var(--font-editorial)]">
          Linhas da carga
        </h2>
        <ul className="flex flex-col gap-1.5">
          {inbound.checkItems.map((i: any) => (
            <li
              key={i.id}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${
                current?.id === i.id ? "border-accent bg-accent/[0.07]"
                : i.status === "OK" ? "border-[#1F3A2C] bg-[#12201A]"
                : i.status === "DIVERGENCE" ? "border-[#5A451E] bg-[#1A1613]"
                : "border-border bg-surface"
              }`}
            >
              <span className="code text-[13px] flex-none">{i.sku}</span>
              <span className="text-[12px] text-secondary truncate flex-1">{i.description}</span>
              <span className="text-[13px] tnum flex-none">
                {i.status === "PENDING" ? fmtNumber(i.expected_qty) : `${fmtNumber(i.checked_qty)}/${fmtNumber(i.expected_qty)}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
