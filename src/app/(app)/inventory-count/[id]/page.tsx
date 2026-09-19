import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCount, accuracyOf } from "@/domain/services/counting";
import { PageHeader, Card, CardHeader, Metric, MetaItem, Progress } from "@/components/ui/Primitives";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { StartCount, CountRow, CloseCount } from "../parts";
import { TASK_STATUS_META } from "@/domain/states";
import { fmtNumber, fmtPercent, fmtDateTime } from "@/lib/format";
import { IconScan } from "@/components/ui/Icons";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Inventario ${id}` };
}

export default async function CountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getCount(id);
  if (!data) notFound();
  const { count, items } = data;

  const pending = items.filter((i: any) => i.status === "PENDING");
  const closed = count.status === "COMPLETED";
  const accuracy = count.accuracy ?? await accuracyOf(id);

  return (
    <>
      <PageHeader
        eyebrow={`Inventario ${count.kind === "CYCLIC" ? "ciclico" : count.kind.toLowerCase()}`}
        title={count.id}
        description={count.scope ?? undefined}
        meta={
          <>
            <StatusBadge status={count.status} meta={TASK_STATUS_META} />
            <MetaItem label="Operador" value={count.operator_name ?? "—"} />
            <MetaItem label="Criado" value={fmtDateTime(count.created_at)} />
            <MetaItem label="Encerrado" value={fmtDateTime(count.completed_at)} />
          </>
        }
        actions={<Link href={`/mobile/count?id=${count.id}`} className="btn btn-sm"><IconScan size={13} /> Coletora</Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Card className="p-4"><Metric label="Posicoes" value={`${count.counted_items}/${count.total_items}`} size="sm" /></Card>
        <Card className="p-4"><Metric label="Divergencias" value={count.divergence_items} tone={count.divergence_items > 0 ? "warning" : "muted"} size="sm" /></Card>
        <Card className="p-4">
          <Metric
            label="Acuracidade"
            value={count.counted_items > 0 ? fmtPercent(accuracy, 2) : "—"}
            tone={count.counted_items === 0 ? "muted" : accuracy >= 99 ? "success" : "warning"}
            size="sm"
          />
        </Card>
        <Card className="p-4"><Metric label="Pendentes" value={pending.length} tone={pending.length > 0 ? "accent" : "success"} size="sm" /></Card>
      </div>

      <Card className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="flex justify-between text-[12.5px] text-secondary mb-2">
              <span>Progresso da contagem</span>
              <span className="tnum">{count.counted_items}/{count.total_items}</span>
            </div>
            <Progress value={count.counted_items} max={Math.max(1, count.total_items)} height={6}
              tone={closed ? "success" : "accent"} />
          </div>
          {count.status === "PENDING" && <StartCount countId={count.id} />}
          {count.status === "IN_PROGRESS" && (
            <div className="w-full md:w-auto">
              <CloseCount countId={count.id} disabled={pending.length > 0} />
            </div>
          )}
          {closed && (
            <p className="text-[13px] text-success-fg">
              Encerrado com acuracidade de {fmtPercent(accuracy, 2)}
            </p>
          )}
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        {items.map((it: any) => (
          <CountRow key={it.id} countId={count.id} item={it} closed={closed || count.status === "PENDING"} />
        ))}
      </div>
    </>
  );
}
