import Link from "next/link";
import type { Metadata } from "next";
import { all, scalar } from "@/lib/db";
import { listOperators } from "@/domain/context";
import { listZones, occupancy, listDocks } from "@/domain/services/warehouse";
import { getScenario } from "@/domain/services/simulation";
import { WAREHOUSE } from "@/seed/scenario";
import { PREFIX } from "@/lib/ids";
import { PageHeader, Card, CardHeader, MetaItem, Metric, IdChip } from "@/components/ui/Primitives";
import { Badge } from "@/components/ui/Badge";
import { Barcode } from "@/components/Barcode";
import { fmtCnpj, fmtNumber, fmtDateTime } from "@/lib/format";
import { IconScan, IconPrint } from "@/components/ui/Icons";
import { ThemeControl } from "@/components/ThemeControl";
import { currentTheme } from "@/domain/theme.server";

export const metadata: Metadata = { title: "Configuracoes" };
export const dynamic = "force-dynamic";

const PREFIX_LABEL: Record<string, string> = {
  PC: "Pedido de compra", OR: "Ordem de recebimento", NFS: "Nota fiscal simulada",
  PES: "Comprovante de pesagem", CONF: "Conferencia de recebimento", PLT: "Palete",
  ARM: "Ordem de armazenagem", END: "Endereco", MOV: "Movimento de estoque",
  RES: "Reserva", PED: "Pedido de venda", PCK: "Lista de separacao",
  PKI: "Linha de separacao", PAK: "Ordem de embalagem", VOL: "Volume",
  CEX: "Conferencia de expedicao", ROM: "Romaneio", DTS: "Documento de transporte",
  CAR: "Carregamento", EXP: "Remessa", INV: "Inventario", OCO: "Ocorrencia",
  EQP: "Equipamento", OPR: "Operador", FOR: "Fornecedor", CLI: "Cliente", LOT: "Lote",
};

export default async function SettingsPage() {
  const theme = await currentTheme();
  const operators = await listOperators();
  const users = await all<any>(`SELECT * FROM users ORDER BY name`);
  const zones = await listZones();
  const docks = await listDocks();
  const occ = await occupancy();
  const scenario = await getScenario();
  const sequences = await all<{ prefix: string; current: number }>(
    `SELECT * FROM id_sequences ORDER BY prefix`,
  );
  const customers = await all<any>(`SELECT * FROM customers ORDER BY name`);

  return (
    <>
      <PageHeader
        eyebrow="Sistema"
        title="Configuracoes"
        description="Parametros do armazem, cadastros de apoio e convencoes de identificacao usadas pela coletora e pelos documentos."
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <div className="xl:col-span-2 flex flex-col gap-5">
          {/* ------------------------------------------------ armazem */}
          <Card>
            <CardHeader title="Armazem" subtitle="Dados usados no cabecalho de todos os documentos" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-[12.5px]">
              <MetaItem label="Codigo" value={WAREHOUSE.id} />
              <MetaItem label="Razao social" value={WAREHOUSE.name} />
              <MetaItem label="Unidade" value={WAREHOUSE.tradeName} />
              <MetaItem label="CNPJ" value={fmtCnpj(WAREHOUSE.cnpj)} />
              <MetaItem label="Inscricao estadual" value={WAREHOUSE.ie} />
              <MetaItem label="Endereco" value={WAREHOUSE.address} />
              <MetaItem label="Cidade" value={`${WAREHOUSE.city}/${WAREHOUSE.state}`} />
              <MetaItem label="CEP" value={WAREHOUSE.zip} />
            </div>
            <p className="text-[11.5px] text-warning-fg mt-3">
              Dados ficticios — o cenario e uma simulacao academica.
            </p>
          </Card>

          {/* ------------------------------------------------ estrutura */}
          <Card padded={false}>
            <div className="p-5 pb-0">
              <CardHeader
                title="Estrutura de enderecamento"
                subtitle="Zona → corredor → modulo → nivel, no formato A-02-03-01"
              />
            </div>
            <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
              <table className="table">
                <thead>
                  <tr><th>Zona</th><th>Nome</th><th>Tipo</th><th>Classe ABC</th><th>Temperatura</th>
                    <th className="num">Posicoes</th><th className="num">Ocupadas</th></tr>
                </thead>
                <tbody>
                  {zones.map((z) => {
                    const stat = occ.byZone.find((b) => b.zoneId === z.id);
                    return (
                      <tr key={z.id}>
                        <td><span className="chip-id">{z.code}</span></td>
                        <td>{z.name}</td>
                        <td className="text-secondary">{z.kind}</td>
                        <td>{z.abc_class ? <Badge tone="accent">{z.abc_class}</Badge> : <span className="text-faint">—</span>}</td>
                        <td className="text-secondary">{z.temperature}</td>
                        <td className="num tnum">{stat?.total ?? 0}</td>
                        <td className="num tnum">{stat?.occupied ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ------------------------------------------------ operadores */}
          <Card padded={false}>
            <div className="p-5 pb-0">
              <CardHeader
                title="Operadores"
                subtitle="O cracha e lido pela coletora; o operador em sessao assina a auditoria"
              />
            </div>
            <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
              <table className="table">
                <thead>
                  <tr><th>Codigo</th><th>Nome</th><th>Turno</th><th>Usuario</th><th>Cracha</th></tr>
                </thead>
                <tbody>
                  {operators.map((o) => (
                    <tr key={o.id}>
                      <td><span className="chip-id">{o.id}</span></td>
                      <td>{o.name}</td>
                      <td className="text-secondary">{o.shift}</td>
                      <td className="text-secondary">
                        {users.find((u) => u.id === (o as any).user_id)?.email ?? "—"}
                      </td>
                      <td><Barcode value={o.badge} height={26} moduleWidth={1.1} showText={false} quietZone={5} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ------------------------------------------------ clientes */}
          <Card padded={false}>
            <div className="p-5 pb-0">
              <CardHeader title="Clientes" subtitle="Destinatarios dos pedidos de venda" />
            </div>
            <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
              <table className="table">
                <thead>
                  <tr><th>Codigo</th><th>Razao social</th><th>CNPJ</th><th>Cidade</th><th>Telefone</th></tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id}>
                      <td><span className="chip-id">{c.id}</span></td>
                      <td>{c.name}</td>
                      <td className="code text-secondary">{fmtCnpj(c.cnpj)}</td>
                      <td className="text-secondary">{c.city}/{c.state}</td>
                      <td className="text-secondary">{c.phone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          {/* ------------------------------------------------ aparencia */}
          <Card>
            <CardHeader
              title="Aparencia"
              subtitle="A preferencia fica gravada neste navegador e vale para todas as telas"
            />
            <ThemeControl theme={theme} />
            <p className="text-[11.5px] text-faint mt-3 leading-relaxed">
              Documentos, etiquetas e codigos de barras sao impressos sempre em papel branco
              com tinta preta, independentemente do tema escolhido.
            </p>
          </Card>

          {/* ------------------------------------------------ coletora */}
          <Card>
            <CardHeader title="Coletora" subtitle="Configuracao do leitor de codigo de barras" />
            <div className="flex flex-col gap-2.5 text-[12.5px]">
              <MetaItem label="Interface" value="USB / HID (emulacao de teclado)" />
              <MetaItem label="Simbologia" value="Code 128 subconjunto B" />
              <MetaItem label="Terminador" value="Enter (CR)" />
              <MetaItem label="Integracao" value="Nenhuma — entrada padrao de teclado" />
            </div>
            <p className="text-[12px] text-secondary leading-relaxed mt-3">
              Configure o leitor para enviar um <strong className="text-primary">Enter</strong> ao
              final da leitura. Nenhum driver proprietario e necessario: o sistema trata a leitura
              como digitacao. A mesma configuracao atende leitores Bluetooth em modo HID.
            </p>
            <Link href="/mobile" className="btn w-full mt-4"><IconScan size={14} /> Abrir a coletora</Link>
          </Card>

          {/* ------------------------------------------------ identificadores */}
          <Card>
            <CardHeader
              title="Convencao de identificadores"
              subtitle="O valor do codigo de barras e o proprio ID da entidade"
            />
            <ul
              className="flex flex-col gap-1 max-h-[340px] overflow-y-auto"
              tabIndex={0} aria-label="Prefixos de identificador"
            >
              {Object.values(PREFIX).map((p) => {
                const seq = sequences.find((s) => s.prefix === p);
                return (
                  <li key={p} className="flex items-center gap-2.5 py-1 text-[12px]">
                    <span className="chip-id w-[52px] justify-center flex-none">{p}</span>
                    <span className="text-secondary truncate flex-1">{PREFIX_LABEL[p] ?? p}</span>
                    <span className="text-faint tnum flex-none">{seq?.current ?? 0}</span>
                  </li>
                );
              })}
            </ul>
            <p className="text-[11.5px] text-faint mt-3 leading-relaxed">
              Enderecos usam o formato <span className="code">END-A020301</span>, equivalente a
              <span className="code"> A-02-03-01</span>. A coletora aceita as duas formas.
            </p>
          </Card>

          {/* ------------------------------------------------ docas */}
          <Card>
            <CardHeader title="Docas" />
            <ul className="flex flex-col gap-2">
              {docks.map((d) => (
                <li key={d.id} className="flex items-center gap-2.5 h-9 px-3 rounded-md border border-border bg-bg">
                  <span className="chip-id">{d.id}</span>
                  <span className="text-[12px] text-secondary truncate flex-1">{d.name}</span>
                  <Badge tone={d.kind === "INBOUND" ? "info" : "accent"}>{d.kind === "INBOUND" ? "Entrada" : "Saida"}</Badge>
                </li>
              ))}
            </ul>
          </Card>

          {/* ------------------------------------------------ cenario */}
          <Card>
            <CardHeader title="Cenario ativo" />
            <div className="flex flex-col gap-2.5 text-[12.5px]">
              <MetaItem label="Identificador" value={scenario?.id ?? "—"} />
              <MetaItem label="Nome" value={scenario?.name ?? "—"} />
              <MetaItem label="Carregado" value={fmtDateTime(scenario?.seeded_at)} />
              <MetaItem label="Reinicios" value={scenario?.reset_count ?? 0} />
            </div>
            <Link href="/simulation" className="btn w-full mt-4">Gerenciar simulacao</Link>
          </Card>
        </div>
      </div>
    </>
  );
}
