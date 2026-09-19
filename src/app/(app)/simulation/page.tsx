import Link from "next/link";
import type { Metadata } from "next";
import { getScenario, scenarioProgress, listEvents } from "@/domain/services/simulation";
import { DOC_TYPES, GROUP_LABEL, type DocGroup } from "@/domain/documents";
import { stockByProduct } from "@/domain/services/inventory";
import { headline } from "@/domain/services/kpi";
import { scalar } from "@/lib/db";
import { SCENARIO_ID, SALES_ORDERS, INBOUND_ORDERS, INITIAL_STOCK } from "@/seed/scenario";
import { PageHeader, Card, CardHeader, Metric, Progress, MetaItem, EmptyState } from "@/components/ui/Primitives";
import { Badge } from "@/components/ui/Badge";
import { ResetSimulation, MarkEvent } from "./parts";
import { fmtNumber, fmtDateTime, fmtPercent, fmtTime } from "@/lib/format";
import { IconCheck, IconPrint, IconArrowRight, IconPlay } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Simulacao" };
export const dynamic = "force-dynamic";

const GROUPS: DocGroup[] = ["entrada", "armazenagem", "saida"];

export default async function SimulationPage() {
  const scenario = await getScenario();
  const progress = await scenarioProgress();
  const events = await listEvents(24);
  const head = await headline();
  const stock = await stockByProduct({ onlyWithStock: true });

  const catalog = await Promise.all(DOC_TYPES.map(async (d) => ({
    type: d.type, label: d.label, group: d.group,
    format: d.format, simulated: !!d.simulated, count: (await d.list()).length,
  })));
  const totalDocs = catalog.reduce((s, c) => s + c.count, 0);

  return (
    <>
      <PageHeader
        eyebrow="Sistema"
        title="Cenario da apresentacao"
        description="Carga, acompanhamento e reinicio do cenario operacional. Todos os identificadores sao deterministicos — o mesmo documento impresso serve a qualquer execucao."
        meta={
          <>
            <Badge tone="accent" dot>{scenario?.id ?? SCENARIO_ID}</Badge>
            <MetaItem label="Nome" value={scenario?.name ?? "—"} />
            <MetaItem label="Carregado" value={fmtDateTime(scenario?.seeded_at)} />
            <MetaItem label="Reinicios" value={scenario?.reset_count ?? 0} />
            {scenario?.last_reset_at && <MetaItem label="Ultimo reinicio" value={fmtDateTime(scenario.last_reset_at)} />}
          </>
        }
        actions={<Link href="/documents" className="btn btn-sm"><IconPrint size={13} /> Central de documentos</Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Card className="p-4"><Metric label="Progresso do roteiro" value={fmtPercent(progress.pct, 0)} tone="accent" size="sm" hint={`${progress.done}/${progress.total} etapas`} /></Card>
        <Card className="p-4"><Metric label="SKUs em estoque" value={head.skus} size="sm" /></Card>
        <Card className="p-4"><Metric label="Unidades" value={fmtNumber(head.unitsOnHand)} size="sm" /></Card>
        <Card className="p-4"><Metric label="Movimentos" value={fmtNumber(head.movements)} size="sm" /></Card>
        <Card className="p-4"><Metric label="Documentos" value={totalDocs} size="sm" hint={`${catalog.length} tipos`} /></Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start mb-5">
        {/* ---------------------------------------------------- roteiro */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Roteiro da operacao"
            subtitle="Sequencia executada durante a apresentacao"
            action={
              <span className="text-[22px] font-[family-name:var(--font-display)] font-semibold tnum text-accent-fg">
                {progress.done}/{progress.total}
              </span>
            }
          />
          <Progress value={progress.done} max={progress.total} height={6} />
          <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-6 mt-4">
            {progress.steps.map((s, i) => (
              <li key={s.key}>
                <Link
                  href={s.href}
                  className="flex items-center gap-3 h-9 px-2 -mx-2 rounded-md hover:bg-elevated transition-colors"
                >
                  <span className={`w-5 h-5 rounded-full border flex items-center justify-center flex-none text-[10px] tnum ${
                    s.done ? "border-accent bg-accent text-on-accent" : "border-border text-faint"
                  }`}>
                    {s.done ? <IconCheck size={11} /> : i + 1}
                  </span>
                  <span className={`text-[12.5px] truncate flex-1 ${s.done ? "text-primary" : "text-secondary"}`}>
                    {s.label}
                  </span>
                  <span className="text-[11px] text-faint tnum flex-none truncate max-w-[120px]">{s.detail}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>

        {/* ---------------------------------------------------- composicao */}
        <Card>
          <CardHeader title="Composicao do cenario" subtitle="O que o SIM-001 carrega" />
          <ul className="flex flex-col gap-2.5 text-[12.5px]">
            <Row label="Estoque inicial" value={`${INITIAL_STOCK.length} posicoes · ${fmtNumber(INITIAL_STOCK.reduce((s, i) => s + i.quantity, 0))} un`} />
            <Row label="Recebimentos" value={`${INBOUND_ORDERS.length} cargas com NF simulada`} />
            <Row label="Pedidos de venda" value={`${SALES_ORDERS.length} pedidos`} />
            <Row label="Enderecos" value={`${await scalar<number>(`SELECT COUNT(*) FROM locations WHERE kind='PALLET'`) ?? 0} posicoes-palete`} />
            <Row label="Produtos" value={`${await scalar<number>(`SELECT COUNT(*) FROM products`) ?? 0} SKUs`} />
            <Row label="Operadores" value={`${await scalar<number>(`SELECT COUNT(*) FROM operators`) ?? 0}`} />
            <Row label="Equipamentos" value={`${await scalar<number>(`SELECT COUNT(*) FROM equipment`) ?? 0}`} />
          </ul>

          <div className="hr my-4" />
          <p className="label mb-2.5">Balanco planejado</p>
          <p className="text-[12px] text-secondary leading-relaxed">
            O pedido <span className="code">PED-000125</span> consome parte do estoque inicial
            (SKU-001 e SKU-003) e parte do que chega no recebimento (SKU-005), obrigando a operacao
            a percorrer o fluxo inteiro antes da expedicao.
          </p>
        </Card>
      </div>

      {/* ------------------------------------------------- pre-geracao */}
      <Card className="mb-5" id="documentos">
        <CardHeader
          title="Pre-geracao documental"
          subtitle="Gere e imprima os documentos ANTES da apresentacao — eles permanecem consistentes com a operacao posterior"
          action={<Link href="/documents" className="btn btn-sm btn-primary">Abrir central <IconArrowRight size={13} /></Link>}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {GROUPS.map((g) => (
            <div key={g}>
              <p className="label mb-2.5">{GROUP_LABEL[g]}</p>
              <ul className="flex flex-col gap-1">
                {catalog.filter((c) => c.group === g).map((c) => (
                  <li key={c.type}>
                    <Link
                      href={`/documents?group=${g}`}
                      className="flex items-center gap-2 py-1.5 px-2 -mx-2 rounded-md hover:bg-elevated transition-colors"
                    >
                      <span className="text-faint flex-none"><IconPrint size={12} /></span>
                      <span className="text-[12.5px] text-primary truncate flex-1">{c.label}</span>
                      {c.simulated && <Badge tone="warning">simulado</Badge>}
                      <span className="text-[11.5px] text-faint tnum flex-none">{c.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-faint mt-4 leading-relaxed max-w-3xl">
          Use <span className="text-secondary">npm run docs:pdf</span> para gerar todos os PDFs de uma
          vez em <span className="code">generated-docs/</span>, ou abra cada documento e use
          Imprimir / salvar PDF.
        </p>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        {/* ---------------------------------------------- linha do tempo */}
        <Card className="xl:col-span-2">
          <CardHeader title="Linha do tempo do cenario" subtitle="Marcos registrados durante a execucao" />
          <MarkEvent />
          <div className="hr my-4" />
          {events.length === 0 ? (
            <EmptyState title="Nenhum marco registrado" description="Os marcos sao criados conforme a operacao avanca." />
          ) : (
            <ol className="relative">
              <span className="absolute left-[5px] top-2 bottom-2 w-px bg-border" aria-hidden />
              {events.map((e) => (
                <li key={e.id} className="relative pl-6 py-[7px]">
                  <span className="absolute left-0 top-[13px] w-[11px] h-[11px] rounded-full border-2 border-surface bg-accent" aria-hidden />
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-[11px] text-faint tnum w-[42px] flex-none">{fmtTime(e.occurred_at)}</span>
                    <span className="eyebrow w-[104px] flex-none truncate">{e.stage}</span>
                    <span className="text-[12.5px] text-primary flex-1 min-w-0">{e.label}</span>
                    {e.ref_id && <span className="code text-[11px] text-faint flex-none">{e.ref_id}</span>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <div className="flex flex-col gap-5">
          {/* --------------------------------------------- estoque atual */}
          <Card>
            <CardHeader title="Estoque atual" subtitle="Saldo por SKU no momento" />
            {stock.length === 0 ? (
              <p className="text-[12.5px] text-faint">Sem estoque.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {stock.map((s) => (
                  <li key={s.product_id} className="flex items-center gap-2 text-[12.5px]">
                    <span className="chip-id">{s.sku}</span>
                    <span className="text-secondary truncate flex-1">{s.description}</span>
                    <span className="tnum text-primary flex-none">{fmtNumber(s.on_hand)}</span>
                    {s.reserved > 0 && (
                      <span className="tnum text-warning-fg flex-none text-[11.5px]">−{fmtNumber(s.reserved)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* --------------------------------------------- reset */}
          <Card className="border-error-line">
            <CardHeader
              title="Reiniciar simulacao"
              subtitle="Restaura o cenario para executar a apresentacao novamente"
            />
            <ResetSimulation />
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="label flex-none">{label}</span>
      <span className="text-primary text-right">{value}</span>
    </li>
  );
}
