import Link from "next/link";
import { listStorageOrders } from "@/domain/services/receiving";
import { PutawayTerminal } from "./parts";
import { fmtNumber } from "@/lib/format";

export const metadata = { title: "Armazenagem" };
export const dynamic = "force-dynamic";

export default function PutawayPage() {
  const pending = listStorageOrders({ status: "PENDING" });

  return (
    <>
      <h1 className="text-[22px] font-[family-name:var(--font-display)] font-semibold mb-1">
        Armazenagem
      </h1>
      <p className="text-[13.5px] text-secondary mb-5 leading-snug">
        Bipe a etiqueta do palete, leve-o ao endereco indicado e bipe a etiqueta do endereco.
      </p>

      <PutawayTerminal />

      <section className="mt-7">
        <h2 className="text-[12px] tracking-[0.12em] uppercase text-faint mb-3 font-[family-name:var(--font-editorial)]">
          Fila de armazenagem ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-[13px] text-faint py-4 text-center border border-dashed border-border rounded-xl">
            Nenhum palete aguardando armazenagem.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {pending.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-surface">
                <span className="code text-[13px] flex-none">{o.pallet_id}</span>
                <span className="text-[12px] text-secondary truncate flex-1">
                  {o.sku ?? "—"} · {fmtNumber(o.qty)}
                </span>
                <span className="text-[13px] text-accent-fg flex-none font-medium">{o.suggested_code ?? "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
