import { scalar } from "@/lib/db";
import { RfLink } from "@/components/rf/Kit";
import { recentScans, scanStats } from "@/domain/services/scan";
import { fmtTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function MobileHome() {
  const counts = {
    putaway: scalar<number>(`SELECT COUNT(*) FROM storage_orders WHERE status IN ('PENDING','IN_PROGRESS')`) ?? 0,
    picking: scalar<number>(`SELECT COUNT(*) FROM picking_orders WHERE status IN ('PENDING','IN_PROGRESS')`) ?? 0,
    loading: scalar<number>(`SELECT COUNT(*) FROM loading_operations WHERE status = 'IN_PROGRESS'`) ?? 0,
    count: scalar<number>(`SELECT COUNT(*) FROM inventory_counts WHERE status IN ('PENDING','IN_PROGRESS')`) ?? 0,
    receiving: scalar<number>(`SELECT COUNT(*) FROM receiving_checks WHERE status = 'IN_PROGRESS'`) ?? 0,
  };
  const scans = recentScans(6);
  const stats = scanStats();

  return (
    <>
      <h1 className="text-[24px] font-[family-name:var(--font-display)] font-semibold mb-1">
        Operacoes
      </h1>
      <p className="text-[13.5px] text-secondary mb-5 leading-snug">
        Selecione a operacao. O leitor USB funciona como teclado — basta bipar.
      </p>

      <nav className="flex flex-col gap-2.5">
        <RfLink href="/mobile/putaway" title="Armazenagem"
          subtitle="Bipar palete, bipar endereco, confirmar" badge={counts.putaway} />
        <RfLink href="/mobile/picking" title="Separacao"
          subtitle="Bipar endereco, bipar produto, confirmar quantidade" badge={counts.picking} />
        <RfLink href="/mobile/receiving" title="Conferencia de recebimento"
          subtitle="Bipar produto e contar a quantidade recebida" badge={counts.receiving} />
        <RfLink href="/mobile/loading" title="Carregamento"
          subtitle="Bipar cada volume do romaneio na doca" badge={counts.loading} />
        <RfLink href="/mobile/count" title="Inventario ciclico"
          subtitle="Bipar endereco, bipar produto, informar contagem" badge={counts.count} />
        <RfLink href="/mobile/scan" title="Consulta livre"
          subtitle="Bipar qualquer codigo e ver a entidade identificada" />
      </nav>

      <section className="mt-7">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[12px] tracking-[0.12em] uppercase text-faint font-[family-name:var(--font-editorial)]">
            Ultimas leituras
          </h2>
          <span className="text-[11.5px] text-faint tnum">
            {stats.total} leituras · {stats.rejected} recusadas
          </span>
        </div>
        {scans.length === 0 ? (
          <p className="text-[13px] text-faint py-4 text-center border border-dashed border-border rounded-xl">
            Nenhuma leitura registrada ainda.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {scans.map((s) => (
              <li
                key={s.id}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${
                  s.result === "OK" ? "border-border bg-surface" : "border-error-line bg-error-soft"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-none ${s.result === "OK" ? "bg-success" : "bg-error"}`} />
                <span className="code text-[12px] flex-none">{s.raw_code}</span>
                <span className="text-[11.5px] text-secondary truncate flex-1">{s.message}</span>
                <span className="text-[11px] text-faint tnum flex-none">{fmtTime(s.occurred_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
