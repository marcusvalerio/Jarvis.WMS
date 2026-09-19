import Link from "next/link";
import type { Metadata } from "next";
import { traceAny } from "@/domain/services/traceability";
import { auditFor } from "@/domain/services/audit";
import { all } from "@/lib/db";
import { PageHeader, Card, CardHeader, EmptyState, IdChip } from "@/components/ui/Primitives";
import { Badge } from "@/components/ui/Badge";
import { Timeline } from "@/components/Timeline";
import { TraceSearch } from "./parts";
import { AUDIT_ACTION_LABEL } from "@/domain/states";
import { fmtDateTime } from "@/lib/format";
import { IconLink } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Rastreabilidade" };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  PRODUCT: "Produto", PALLET: "Palete", SALES_ORDER: "Pedido de venda",
  INBOUND_ORDER: "Recebimento", INVOICE: "Nota fiscal", UNKNOWN: "Nao identificado",
};

export default async function TracePage({
  searchParams,
}: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const query = sp.q?.trim();
  const trace = query ? await traceAny(query) : null;

  const suggestions = {
    products: await all<any>(`SELECT id, sku FROM products ORDER BY sku LIMIT 8`),
    pallets: await all<any>(`SELECT id FROM pallets ORDER BY id LIMIT 6`),
    orders: await all<any>(`SELECT id FROM sales_orders ORDER BY id LIMIT 4`),
    inbound: await all<any>(`SELECT id FROM inbound_orders ORDER BY id LIMIT 4`),
  };

  const audit = trace && !trace.notFound
    ? (await auditFor(trace.kind.toLowerCase(), trace.id)).slice(0, 12)
    : [];

  return (
    <>
      <PageHeader
        eyebrow="Controle"
        title="Rastreabilidade"
        description="Cadeia bidirecional: produto, palete, pedido ou documento — cada no da linha do tempo vem de um registro real da operacao."
      />

      <Card className="mb-5">
        <TraceSearch defaultValue={query ?? ""} />
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <span className="label">Atalhos</span>
          {suggestions.products.map((p: any) => (
            <Link key={p.id} href={`/audit/trace?q=${p.sku}`} className="badge badge-neutral">{p.sku}</Link>
          ))}
          {suggestions.pallets.map((p: any) => (
            <Link key={p.id} href={`/audit/trace?q=${p.id}`} className="badge badge-neutral">{p.id}</Link>
          ))}
          {suggestions.orders.map((o: any) => (
            <Link key={o.id} href={`/audit/trace?q=${o.id}`} className="badge badge-neutral">{o.id}</Link>
          ))}
          {suggestions.inbound.map((o: any) => (
            <Link key={o.id} href={`/audit/trace?q=${o.id}`} className="badge badge-neutral">{o.id}</Link>
          ))}
        </div>
      </Card>

      {!trace && (
        <Card>
          <EmptyState
            icon={<IconLink size={18} />}
            title="Informe um identificador"
            description="Digite ou bipe um SKU, palete, pedido, recebimento ou nota fiscal para ver a cadeia completa."
          />
        </Card>
      )}

      {trace?.notFound && (
        <Card>
          <EmptyState
            title={`Nada encontrado para "${query}"`}
            description="Verifique o identificador. Sao aceitos SKU, PLT-…, PED-…, OR-… e NFS-…"
          />
        </Card>
      )}

      {trace && !trace.notFound && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
          <Card className="xl:col-span-2">
            <CardHeader
              title={trace.title}
              subtitle={trace.subtitle}
              action={<Badge tone="accent">{KIND_LABEL[trace.kind] ?? trace.kind}</Badge>}
            />
            {trace.timeline.length === 0 ? (
              <EmptyState title="Sem eventos" description="Esta entidade ainda nao possui historico operacional." />
            ) : (
              <Timeline nodes={trace.timeline} />
            )}
          </Card>

          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader title="Entidades relacionadas" subtitle={`${trace.related.length} vinculo(s)`} />
              {trace.related.length === 0 ? (
                <p className="text-[12.5px] text-faint">Nenhum vinculo.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {trace.related.map((r, i) => (
                    <li key={`${r.kind}-${r.id}-${i}`}>
                      <Link href={r.href} className="flex items-center gap-2 py-1.5 px-2 -mx-2 rounded-md hover:bg-elevated transition-colors">
                        <span className="eyebrow w-[68px] flex-none truncate">{r.kind}</span>
                        <span className="text-[12.5px] text-primary truncate">{r.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {audit.length > 0 && (
              <Card>
                <CardHeader title="Auditoria da entidade" subtitle={`${audit.length} evento(s) recentes`} />
                <ul className="flex flex-col gap-2">
                  {audit.map((a) => (
                    <li key={a.id} className="text-[12px]">
                      <span className="flex items-center gap-2">
                        <span className="text-faint tnum text-[11px]">{fmtDateTime(a.occurred_at)}</span>
                        <Badge tone="neutral">{AUDIT_ACTION_LABEL[a.action] ?? a.action}</Badge>
                      </span>
                      <span className="block text-secondary mt-0.5 leading-snug">{a.detail}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
