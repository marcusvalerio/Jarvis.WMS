import Link from "next/link";
import type { Metadata } from "next";
import { DOC_TYPES, GROUP_LABEL, type DocGroup } from "@/domain/documents";
import { PageHeader, Card, CardHeader, Metric, EmptyState } from "@/components/ui/Primitives";
import { Badge } from "@/components/ui/Badge";
import { DocTypePanel } from "./parts";
import { IconDoc, IconPrint } from "@/components/ui/Icons";

export const metadata: Metadata = { title: "Central de documentos" };
export const dynamic = "force-dynamic";

const GROUPS: DocGroup[] = ["entrada", "armazenagem", "saida"];

export default async function DocumentsPage({
  searchParams,
}: { searchParams: Promise<{ group?: string }> }) {
  const sp = await searchParams;
  const active = (GROUPS.includes(sp.group as DocGroup) ? sp.group : null) as DocGroup | null;

  const catalog = DOC_TYPES.map((d) => ({
    type: d.type, label: d.label, group: d.group, description: d.description,
    format: d.format, simulated: !!d.simulated, items: d.list(),
  }));
  const visible = active ? catalog.filter((c) => c.group === active) : catalog;
  const total = catalog.reduce((s, c) => s + c.items.length, 0);

  return (
    <>
      <PageHeader
        eyebrow="Controle"
        title="Central de documentos"
        description="Todos os documentos sao renderizados a partir das entidades do sistema — o papel impresso corresponde exatamente ao registro no WMS."
        actions={
          <Link href="/simulation#documentos" className="btn btn-sm btn-primary">
            <IconPrint size={13} /> Pre-geracao para a apresentacao
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Card className="p-4"><Metric label="Tipos de documento" value={catalog.length} size="sm" /></Card>
        <Card className="p-4"><Metric label="Documentos disponiveis" value={total} tone="accent" size="sm" /></Card>
        <Card className="p-4"><Metric label="Etiquetas" value={catalog.filter((c) => c.format === "ETIQUETA").reduce((s, c) => s + c.items.length, 0)} size="sm" /></Card>
        <Card className="p-4"><Metric label="Documentos simulados" value={catalog.filter((c) => c.simulated).reduce((s, c) => s + c.items.length, 0)} tone="warning" size="sm" hint="marcados como uso academico" /></Card>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <Link href="/documents" className={`badge ${!active ? "badge-accent" : "badge-neutral"}`}>
          Todos <span className="tnum opacity-70">{catalog.length}</span>
        </Link>
        {GROUPS.map((g) => (
          <Link key={g} href={`/documents?group=${g}`} className={`badge ${active === g ? "badge-accent" : "badge-neutral"}`}>
            {GROUP_LABEL[g]}
            <span className="tnum opacity-70">{catalog.filter((c) => c.group === g).length}</span>
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-5">
        {GROUPS.filter((g) => !active || g === active).map((g) => {
          const group = visible.filter((c) => c.group === g);
          if (group.length === 0) return null;
          return (
            <section key={g}>
              <h2 className="label mb-3">{GROUP_LABEL[g]}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                {group.map((c) => <DocTypePanel key={c.type} doc={c} />)}
              </div>
            </section>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Sobre os documentos simulados"
          subtitle="Delimitacao de uso deste material"
        />
        <p className="text-[12.5px] text-secondary leading-relaxed max-w-3xl">
          As notas fiscais e o documento de transporte gerados por este sistema sao{" "}
          <strong className="text-primary">simulacoes academicas</strong>. Nao ha integracao com a
          SEFAZ, nao ha emissao, transmissao ou autorizacao de documento fiscal eletronico, e as
          chaves de acesso sao geradas por funcao local deterministica. Todo documento dessa
          natureza traz, em destaque, a marcacao{" "}
          <span className="text-warning">DOCUMENTO SIMULADO — USO ACADEMICO</span> no cabecalho e no
          rodape. Os demais documentos (ordens, checklists, romaneio, etiquetas e comprovantes) sao
          documentos operacionais internos, sem natureza fiscal.
        </p>
      </Card>
    </>
  );
}
