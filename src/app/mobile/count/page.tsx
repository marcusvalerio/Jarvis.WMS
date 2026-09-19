import Link from "next/link";
import { listCounts, getCount, currentCountItem } from "@/domain/services/counting";
import { RfLink, RfPanel } from "@/components/rf/Kit";
import { CountTerminal } from "./parts";
import { fmtNumber, fmtPercent } from "@/lib/format";

export const metadata = { title: "Inventario" };
export const dynamic = "force-dynamic";

export default async function MobileCountPage({
  searchParams,
}: { searchParams: Promise<{ id?: string }> }) {
  const sp = await searchParams;
  const open = (await listCounts()).filter((c) => ["PENDING", "IN_PROGRESS"].includes(c.status));
  const selected = sp.id ? await getCount(sp.id) : open.length === 1 ? await getCount(open[0].id) : null;

  if (!selected) {
    return (
      <>
        <h1 className="text-[22px] font-[family-name:var(--font-display)] font-semibold mb-1">
          Inventario ciclico
        </h1>
        <p className="text-[13.5px] text-secondary mb-5 leading-snug">
          Contagem cega: o saldo do sistema nao e exibido antes da contagem.
        </p>
        {open.length === 0 ? (
          <p className="text-[13px] text-faint py-6 text-center border border-dashed border-border rounded-xl">
            Nenhum inventario aberto. Crie um no modulo de inventario.
          </p>
        ) : (
          <nav className="flex flex-col gap-2.5">
            {open.map((c) => (
              <RfLink
                key={c.id} href={`/mobile/count?id=${c.id}`} title={c.id}
                subtitle={`${c.scope ?? "—"} · ${c.counted_items}/${c.total_items} contadas`}
                badge={c.total_items - c.counted_items}
              />
            ))}
          </nav>
        )}
      </>
    );
  }

  const { count, items } = selected;
  const current = await currentCountItem(count.id);

  return (
    <>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="text-[11px] tracking-[0.14em] uppercase text-faint font-[family-name:var(--font-editorial)]">
            Inventario · {count.scope ?? "—"}
          </p>
          <h1 className="text-[22px] font-[family-name:var(--font-display)] font-semibold leading-tight">
            {count.id}
          </h1>
        </div>
        <div className="text-right flex-none">
          <p className="text-[11px] tracking-[0.12em] uppercase text-faint">Posicoes</p>
          <p className="text-[24px] font-[family-name:var(--font-display)] font-semibold tnum text-accent-fg leading-none mt-1">
            {count.counted_items}/{count.total_items}
          </p>
        </div>
      </div>

      {current ? (
        <CountTerminal countId={count.id} item={current} />
      ) : (
        <div className="flex flex-col gap-4">
          <RfPanel
            eyebrow="Contagem concluida"
            title="INVENTARIO CONTADO"
            subtitle={`${count.divergence_items} divergencia(s). Encerre e aplique os ajustes no desktop.`}
            tone="accent"
          />
          <Link href={`/inventory-count/${count.id}`} className="btn btn-lg w-full justify-center">
            Encerrar inventario
          </Link>
        </div>
      )}

      <section className="mt-7">
        <h2 className="text-[12px] tracking-[0.12em] uppercase text-faint mb-3 font-[family-name:var(--font-editorial)]">
          Posicoes
        </h2>
        <ul className="flex flex-col gap-1.5">
          {items.map((i: any) => (
            <li
              key={i.id}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${
                current?.id === i.id ? "border-accent bg-accent/[0.07]"
                : i.status === "PENDING" ? "border-border bg-surface"
                : i.divergence === 0 ? "border-success-line bg-success-soft"
                : "border-warning-line bg-warning-soft"
              }`}
            >
              <span className="code text-[13px] flex-none">{i.location_code}</span>
              <span className="text-[12px] text-secondary truncate flex-1">{i.sku ?? "—"}</span>
              <span className="text-[13px] tnum flex-none">
                {i.status === "PENDING" ? "—" : fmtNumber(i.counted_qty)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
