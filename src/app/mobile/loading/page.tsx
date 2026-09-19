import Link from "next/link";
import { all } from "@/lib/db";
import { getLoading } from "@/domain/services/shipping";
import { RfLink, RfPanel, RfRow } from "@/components/rf/Kit";
import { LoadingTerminal } from "./parts";
import { fmtNumber, fmtTime } from "@/lib/format";

export const metadata = { title: "Carregamento" };
export const dynamic = "force-dynamic";

export default async function MobileLoadingPage({
  searchParams,
}: { searchParams: Promise<{ id?: string }> }) {
  const sp = await searchParams;
  const active = all<any>(
    `SELECT lo.*, m.route, m.vehicle_plate, d.name AS dock_name
       FROM loading_operations lo
       JOIN shipping_manifests m ON m.id = lo.manifest_id
       LEFT JOIN docks d ON d.id = lo.dock_id
      WHERE lo.status = 'IN_PROGRESS' ORDER BY lo.created_at DESC`,
  );
  const selected = sp.id ? getLoading(sp.id) : active.length === 1 ? getLoading(active[0].id) : null;

  if (!selected) {
    return (
      <>
        <h1 className="text-[22px] font-[family-name:var(--font-display)] font-semibold mb-1">
          Carregamento
        </h1>
        <p className="text-[13.5px] text-secondary mb-5 leading-snug">
          Selecione o carregamento em andamento na doca.
        </p>
        {active.length === 0 ? (
          <p className="text-[13px] text-faint py-6 text-center border border-dashed border-border rounded-xl">
            Nenhum carregamento em andamento. Inicie pelo romaneio no desktop.
          </p>
        ) : (
          <nav className="flex flex-col gap-2.5">
            {active.map((l) => (
              <RfLink
                key={l.id} href={`/mobile/loading?id=${l.id}`} title={l.id}
                subtitle={`${l.route} · ${l.vehicle_plate ?? "—"} · ${l.dock_name ?? "sem doca"}`}
                badge={l.expected_volumes - l.loaded_volumes}
              />
            ))}
          </nav>
        )}
      </>
    );
  }

  const { loading, expected } = selected;
  const pending = expected.filter((v: any) => !v.scanned_at);

  return (
    <>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="text-[11px] tracking-[0.14em] uppercase text-faint font-[family-name:var(--font-editorial)]">
            Carregamento · {loading.dock_name ?? "doca"}
          </p>
          <h1 className="text-[22px] font-[family-name:var(--font-display)] font-semibold leading-tight">
            {loading.manifest_id}
          </h1>
          <p className="text-[12.5px] text-secondary mt-1">{loading.route} · {loading.vehicle_plate}</p>
        </div>
        <div className="text-right flex-none">
          <p className="text-[11px] tracking-[0.12em] uppercase text-faint">Volumes</p>
          <p className="text-[24px] font-[family-name:var(--font-display)] font-semibold tnum text-accent-fg leading-none mt-1">
            {loading.loaded_volumes}/{loading.expected_volumes}
          </p>
        </div>
      </div>

      {pending.length > 0 ? (
        <LoadingTerminal loadingId={loading.id} pending={pending.length} />
      ) : (
        <div className="flex flex-col gap-4">
          <RfPanel
            eyebrow="Todos os volumes carregados"
            title="CARGA COMPLETA"
            subtitle="Encerre o carregamento e aplique o lacre no desktop."
            tone="accent"
          />
          <Link href={`/shipping/loading/${loading.id}`} className="btn btn-lg w-full justify-center">
            Encerrar e lacrar
          </Link>
        </div>
      )}

      <section className="mt-7">
        <h2 className="text-[12px] tracking-[0.12em] uppercase text-faint mb-3 font-[family-name:var(--font-editorial)]">
          Volumes do romaneio
        </h2>
        <ul className="flex flex-col gap-1.5">
          {expected.map((v: any) => (
            <li
              key={v.id}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${
                v.scanned_at ? "border-success-line bg-success-soft" : "border-border bg-surface"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-none ${v.scanned_at ? "bg-success" : "bg-neutral"}`} />
              <span className="code text-[13px] flex-none">{v.id}</span>
              <span className="text-[12px] text-secondary truncate flex-1">{v.customer_name}</span>
              <span className="text-[11.5px] text-faint tnum flex-none">
                {v.scanned_at ? fmtTime(v.scanned_at) : `parada ${v.stop_sequence}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
