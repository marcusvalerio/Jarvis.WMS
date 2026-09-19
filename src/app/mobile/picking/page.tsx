import Link from "next/link";
import { listPicking, getPicking, currentItem } from "@/domain/services/picking";
import { RfLink, RfPanel } from "@/components/rf/Kit";
import { PickTerminal, StartPickButton } from "./parts";
import { fmtNumber } from "@/lib/format";

export const metadata = { title: "Separacao" };
export const dynamic = "force-dynamic";

export default async function MobilePickingPage({
  searchParams,
}: { searchParams: Promise<{ id?: string }> }) {
  const sp = await searchParams;
  const open = listPicking().filter((p) => ["PENDING", "IN_PROGRESS"].includes(p.status));
  const selected = sp.id ? getPicking(sp.id) : null;

  if (!selected) {
    return (
      <>
        <h1 className="text-[22px] font-[family-name:var(--font-display)] font-semibold mb-1">
          Separacao
        </h1>
        <p className="text-[13.5px] text-secondary mb-5 leading-snug">
          Selecione a lista de separacao a executar.
        </p>
        {open.length === 0 ? (
          <p className="text-[13px] text-faint py-6 text-center border border-dashed border-border rounded-xl">
            Nenhuma lista de separacao aberta. Libere um pedido no desktop.
          </p>
        ) : (
          <nav className="flex flex-col gap-2.5">
            {open.map((p) => (
              <RfLink
                key={p.id}
                href={`/mobile/picking?id=${p.id}`}
                title={p.id}
                subtitle={`${p.sales_order_id} · ${p.customer_name} · ${p.total_lines} linhas · ${p.priority}`}
                badge={p.total_lines - p.done_lines}
              />
            ))}
          </nav>
        )}
      </>
    );
  }

  const { picking, items } = selected;
  const current = currentItem(picking.id);

  return (
    <>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="text-[11px] tracking-[0.14em] uppercase text-faint font-[family-name:var(--font-editorial)]">
            Separacao
          </p>
          <h1 className="text-[22px] font-[family-name:var(--font-display)] font-semibold leading-tight">
            {picking.id}
          </h1>
          <p className="text-[12.5px] text-secondary mt-1 truncate">
            {picking.sales_order_id} · {picking.customer_name}
          </p>
        </div>
        <div className="text-right flex-none">
          <p className="text-[11px] tracking-[0.12em] uppercase text-faint">Linhas</p>
          <p className="text-[24px] font-[family-name:var(--font-display)] font-semibold tnum text-accent-fg leading-none mt-1">
            {picking.done_lines}/{picking.total_lines}
          </p>
        </div>
      </div>

      {picking.status === "PENDING" && <StartPickButton pickingId={picking.id} />}

      {picking.status === "IN_PROGRESS" && current && (
        <PickTerminal pickingId={picking.id} item={current} />
      )}

      {!current && picking.status !== "PENDING" && (
        <div className="flex flex-col gap-4">
          <RfPanel
            eyebrow="Operacao concluida"
            title="SEPARACAO FINALIZADA"
            subtitle={`${picking.done_lines} linhas · ${fmtNumber(picking.picked_units)} unidades`}
            tone="accent"
          />
          <Link href="/mobile/picking" className="btn btn-lg w-full justify-center">
            Voltar as listas
          </Link>
        </div>
      )}

      <section className="mt-7">
        <h2 className="text-[12px] tracking-[0.12em] uppercase text-faint mb-3 font-[family-name:var(--font-editorial)]">
          Linhas da lista
        </h2>
        <ul className="flex flex-col gap-1.5">
          {items.map((it: any) => (
            <li
              key={it.id}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${
                current?.id === it.id ? "border-accent bg-accent/[0.07]"
                : it.status === "COMPLETED" ? "border-border bg-surface opacity-60"
                : it.status === "DIVERGENCE" || it.status === "SKIPPED" ? "border-warning-line bg-warning-soft"
                : "border-border bg-surface"
              }`}
            >
              <span className="text-[12px] text-faint tnum w-5 flex-none">{it.sequence}</span>
              <span className="code text-[13px] flex-none">{it.location_code}</span>
              <span className="text-[12px] text-secondary truncate flex-1">{it.sku}</span>
              <span className="text-[13px] tnum flex-none">
                {it.status === "PENDING" ? fmtNumber(it.expected_qty) : `${fmtNumber(it.picked_qty)}/${fmtNumber(it.expected_qty)}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
