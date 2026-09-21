/**
 * MANIFESTO DO PACOTE MESTRE (DEMO DOCUMENT PACK).
 *
 * `demo.ts` prepara as ENTIDADES da demonstracao; este modulo organiza os
 * DOCUMENTOS que ja existem no catalogo (`src/domain/documents.ts`) na
 * ORDEM OPERACIONAL exigida pela apresentacao fisica e agrupa cada bloco
 * atras de uma divisoria.
 *
 * Nao renderiza nada e nao inventa documento novo: cada entrada aponta para
 * um `DocType` e um `id` que ja existem no catalogo. O merge em UM PDF e a
 * captura via Playwright ficam em `scripts/docs-demo.ts` — aqui so a ORDEM.
 */
import { docType } from "@/domain/documents";

export interface PackDocRef {
  /** Tipo do catalogo (`DOC_TYPES`), usado para montar a URL do documento. */
  docType: string;
  id: string;
  label: string;
  sublabel?: string;
  status?: string;
  /** Tabela real por tras do documento — para o indice e para auditoria. */
  entity: string;
}

export interface PackSection {
  code: string;
  title: string;
  entries: PackDocRef[];
}

/** Tabela que sustenta cada tipo de documento — usada no indice final. */
const ENTITY_TABLE: Record<string, string> = {
  "purchase-order": "purchase_orders",
  "inbound-order": "inbound_orders",
  invoice: "invoices",
  weighing: "weighings",
  "receiving-checklist": "inbound_orders",
  "product-label-sheet": "products",
  "pallet-label-sheet": "pallets",
  "inbound-volume-label-sheet": "volumes",
  "location-label-sheet": "locations",
  "storage-order": "storage_orders",
  movement: "pallets",
  "sales-order": "sales_orders",
  picklist: "picking_orders",
  "packing-list": "sales_orders",
  "volume-label-sheet": "volumes",
  "shipping-check": "shipping_checks",
  manifest: "shipping_manifests",
  transport: "transport_documents",
  "loading-checklist": "loading_operations",
  "shipping-receipt": "sales_orders",
};

async function refs(
  type: string,
  filter?: (r: { id: string; label: string; sublabel?: string; status?: string }) => boolean,
): Promise<PackDocRef[]> {
  const def = docType(type);
  if (!def) throw new Error(`Tipo de documento desconhecido no pacote: ${type}`);
  const entity = ENTITY_TABLE[type];
  if (!entity) throw new Error(`Sem tabela mapeada para o tipo ${type} no indice do pacote`);
  const items = await def.list();
  return (filter ? items.filter(filter) : items).map((r) => ({
    docType: type, id: r.id, label: r.label, sublabel: r.sublabel, status: r.status, entity,
  }));
}

interface SectionSpec {
  code: string;
  title: string;
  /** Secao pode ficar vazia sem ser erro (ex.: nenhum palete se moveu ainda). */
  optional?: boolean;
  build: () => Promise<PackDocRef[]>;
}

/**
 * Ordem operacional das secoes 02–14 do pacote (00/01 sao a capa e o mapa,
 * 15 e o indice final — estruturais, sem entrada de catalogo, montadas em
 * `scripts/docs-demo.ts`).
 */
const SECTIONS: SectionSpec[] = [
  {
    code: "02", title: "Compras / Recebimento",
    build: async () => [
      ...await refs("purchase-order"),
      ...await refs("invoice", (r) => r.sublabel === "Entrada"),
      ...await refs("inbound-order"),
      ...await refs("weighing"),
      ...await refs("receiving-checklist"),
    ],
  },
  {
    code: "03", title: "Identificacao de recebimento",
    build: async () => [
      ...await refs("product-label-sheet"),
      ...await refs("pallet-label-sheet"),
      ...await refs("inbound-volume-label-sheet"),
      ...await refs("location-label-sheet"),
    ],
  },
  {
    code: "04", title: "Armazenagem", optional: true,
    build: async () => [
      ...await refs("storage-order"),
      ...await refs("movement"),
    ],
  },
  { code: "05", title: "Vendas", build: () => refs("sales-order") },
  { code: "06", title: "Separacao", build: () => refs("picklist") },
  { code: "07", title: "Etiquetas de expedicao", build: () => refs("volume-label-sheet") },
  { code: "08", title: "Packing", build: () => refs("packing-list") },
  { code: "09", title: "Conferencia", build: () => refs("shipping-check") },
  {
    code: "10", title: "Notas fiscais de saida",
    build: () => refs("invoice", (r) => r.sublabel === "Saida"),
  },
  { code: "11", title: "Romaneios", build: () => refs("manifest") },
  { code: "12", title: "Documentos de transporte", build: () => refs("transport") },
  { code: "13", title: "Carregamento", build: () => refs("loading-checklist") },
  { code: "14", title: "Expedicao", build: () => refs("shipping-receipt") },
];

/** Titulo de cada secao, usado pelas paginas divisorias (`/documents/pack/divider/[code]`). */
export const SECTION_TITLES: Record<string, string> = Object.fromEntries(
  SECTIONS.map((s) => [s.code, s.title]),
);

/** Monta as secoes do pacote mestre, na ordem fisica de uso da apresentacao. */
export async function buildDemoPackManifest(): Promise<PackSection[]> {
  const sections = await Promise.all(
    SECTIONS.map(async (s) => ({ code: s.code, title: s.title, entries: await s.build(), optional: s.optional })),
  );

  const vazias = sections.filter((s) => s.entries.length === 0 && !s.optional);
  if (vazias.length > 0) {
    throw new Error(
      `O pacote mestre ficou com secao(oes) vazia(s): ${vazias.map((s) => `${s.code} ${s.title}`).join(", ")}. ` +
      `Rode "npm run docs:prepare" antes de montar o pacote.`,
    );
  }

  return sections.map(({ code, title, entries }) => ({ code, title, entries }));
}
