/**
 * CATALOGO DE DOCUMENTOS.
 * Cada documento e uma VISAO de uma entidade real do sistema — nao existe
 * documento com dados proprios. O catalogo define como localizar as
 * entidades disponiveis para cada tipo.
 */
import { all, scalar } from "@/lib/db";
import { SCENARIO_ID } from "@/seed/scenario";

export type DocGroup = "entrada" | "armazenagem" | "saida";

export interface DocType {
  type: string;
  label: string;
  group: DocGroup;
  description: string;
  /** Formato de impressao. */
  format: "A4" | "ETIQUETA";
  /** Documento fiscal/tributario simulado — exige aviso academico. */
  simulated?: boolean;
  /** Entidades disponiveis para este tipo. */
  list: () => Promise<{ id: string; label: string; sublabel?: string; status?: string }[]>;
}

/**
 * Folha A4 com 6 etiquetas (2 x 3). O documento e UM so, com quantas
 * paginas forem necessarias — ceil(total / 6) —, e nao um arquivo por
 * etiqueta. `list()` devolve um unico item porque o conjunto inteiro e o
 * documento; o sublabel diz quantas etiquetas e quantas folhas saem.
 */
async function folhaDeEtiquetas(sql: string, ...params: any[]) {
  const total = Number(await scalar<number>(sql, ...params) ?? 0);
  if (total === 0) return [];
  const folhas = Math.ceil(total / 6);
  return [{
    id: SCENARIO_ID,
    label: `${total} etiqueta(s)`,
    sublabel: `${folhas} folha(s) A4 · 6 por folha`,
  }];
}

export const DOC_TYPES: DocType[] = [
  // ------------------------------------------------------------- ENTRADA
  {
    type: "purchase-order", label: "Pedido de compra", group: "entrada", format: "A4",
    description: "Documento de origem da carga, com itens, lotes e valores acordados.",
    list: async () => (await all<any>(
      `SELECT po.id, po.status, s.name FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id ORDER BY po.id`,
    )).map((r) => ({ id: r.id, label: r.id, sublabel: r.name, status: r.status })),
  },
  {
    type: "inbound-order", label: "Ordem de recebimento", group: "entrada", format: "A4",
    description: "Ordem operacional da carga: veiculo, doca, itens previstos e conferidos.",
    list: async () => (await all<any>(
      `SELECT io.id, io.status, s.name FROM inbound_orders io
         JOIN suppliers s ON s.id = io.supplier_id ORDER BY io.id`,
    )).map((r) => ({ id: r.id, label: r.id, sublabel: r.name, status: r.status })),
  },
  {
    type: "invoice", label: "Nota fiscal simulada", group: "entrada", format: "A4", simulated: true,
    description: "Nota de entrada ou saida, com chave de acesso simulada e aviso academico.",
    list: async () => (await all<any>(
      `SELECT id, number, series, kind FROM invoices ORDER BY id`,
    )).map((r) => ({
      id: r.id, label: `NF ${r.number}/${r.series}`,
      sublabel: r.kind === "INBOUND" ? "Entrada" : "Saida",
    })),
  },
  {
    type: "weighing", label: "Comprovante de pesagem", group: "entrada", format: "A4",
    description: "Bruto, tara e liquido com o calculo explicito e a divergencia sobre o previsto.",
    list: async () => (await all<any>(
      `SELECT id, ref_id, net_kg FROM weighings ORDER BY weighed_at DESC`,
    )).map((r) => ({ id: r.id, label: r.id, sublabel: `${r.ref_id} · ${r.net_kg} kg` })),
  },
  {
    type: "receiving-checklist", label: "Checklist de recebimento", group: "entrada", format: "A4",
    description: "Roteiro de conferencia fisica: quantidades, pesagem, paletizacao e ocorrencias.",
    list: async () => (await all<any>(
      `SELECT io.id, io.status, s.name FROM inbound_orders io
         JOIN suppliers s ON s.id = io.supplier_id ORDER BY io.id`,
    )).map((r) => ({ id: r.id, label: r.id, sublabel: r.name, status: r.status })),
  },
  {
    type: "inbound-volume-label", label: "Etiqueta de caixa recebida", group: "entrada", format: "ETIQUETA",
    description: "Identificacao da caixa que chega na doca, com fornecedor, nota de entrada e conteudo.",
    list: async () => (await all<any>(
      `SELECT id, status, inbound_order_id FROM volumes
        WHERE status <> 'CANCELLED' AND inbound_order_id IS NOT NULL ORDER BY id`,
    )).map((r) => ({ id: r.id, label: r.id, sublabel: r.inbound_order_id, status: r.status })),
  },
  {
    type: "inbound-volume-label-sheet", label: "Folha A4 · etiquetas de caixa recebida",
    group: "entrada", format: "A4",
    description: "Seis etiquetas de caixa recebida por folha A4, em 2 colunas x 3 linhas.",
    list: () => folhaDeEtiquetas(
      `SELECT COUNT(*) FROM volumes WHERE status <> 'CANCELLED' AND inbound_order_id IS NOT NULL`,
    ),
  },
  {
    type: "product-label-sheet", label: "Folha A4 · etiquetas de produto",
    group: "entrada", format: "A4",
    description: "Seis etiquetas de produto por folha A4, em 2 colunas x 3 linhas.",
    list: () => folhaDeEtiquetas(`SELECT COUNT(*) FROM products`),
  },
  {
    type: "product-label", label: "Etiqueta de produto", group: "entrada", format: "ETIQUETA",
    description: "Identificacao do SKU com codigo interno Code 128 e EAN do fabricante.",
    list: async () => (await all<any>(`SELECT id, sku, description FROM products ORDER BY sku`))
      .map((r) => ({ id: r.id, label: r.sku, sublabel: r.description })),
  },

  // -------------------------------------------------------- ARMAZENAGEM
  {
    type: "storage-order", label: "Ordem de armazenagem", group: "armazenagem", format: "A4",
    description: "Palete, endereco sugerido pelo WMS e confirmacao do operador.",
    list: async () => (await all<any>(
      `SELECT so.id, so.status, so.pallet_id FROM storage_orders so ORDER BY so.id`,
    )).map((r) => ({ id: r.id, label: r.id, sublabel: r.pallet_id, status: r.status })),
  },
  {
    type: "pallet-label", label: "Etiqueta de palete", group: "armazenagem", format: "ETIQUETA",
    description: "Identificacao do palete com conteudo, lote, validade, peso e endereco.",
    list: async () => (await all<any>(
      `SELECT pl.id, pl.status, l.code FROM pallets pl
         LEFT JOIN locations l ON l.id = pl.location_id ORDER BY pl.id`,
    )).map((r) => ({ id: r.id, label: r.id, sublabel: r.code ?? "sem endereco", status: r.status })),
  },
  {
    type: "pallet-label-sheet", label: "Folha A4 · etiquetas de palete",
    group: "armazenagem", format: "A4",
    description: "Seis etiquetas de palete por folha A4, em 2 colunas x 3 linhas.",
    list: () => folhaDeEtiquetas(`SELECT COUNT(*) FROM pallets`),
  },
  {
    type: "location-label", label: "Etiqueta de endereco", group: "armazenagem", format: "ETIQUETA",
    description: "Placa do porta-palete com o codigo lido pela coletora.",
    list: async () => (await all<any>(
      `SELECT l.id, l.code, z.name FROM locations l JOIN zones z ON z.id = l.zone_id
        WHERE l.kind = 'PALLET' ORDER BY l.code`,
    )).map((r) => ({ id: r.id, label: r.code, sublabel: r.name })),
  },
  {
    type: "movement", label: "Documento de movimentacao", group: "armazenagem", format: "A4",
    description: "Extrato dos movimentos de estoque de um palete.",
    // So o palete que JA se movimentou. O palete planejado pela preparacao
    // da demonstracao ainda nao lancou entrada nenhuma: um extrato dele
    // seria uma folha em branco, nao um documento.
    list: async () => (await all<any>(
      `SELECT p.id, p.status FROM pallets p
        WHERE EXISTS (SELECT 1 FROM inventory_movements m WHERE m.pallet_id = p.id)
        ORDER BY p.id`,
    )).map((r) => ({ id: r.id, label: r.id, sublabel: "movimentos do palete", status: r.status })),
  },

  // ---------------------------------------------------------------- SAIDA
  {
    type: "sales-order", label: "Pedido de venda", group: "saida", format: "A4",
    description: "Pedido do cliente com itens, reserva, prazo e valores.",
    list: async () => (await all<any>(
      `SELECT so.id, so.status, c.name FROM sales_orders so
         JOIN customers c ON c.id = so.customer_id ORDER BY so.id`,
    )).map((r) => ({ id: r.id, label: r.id, sublabel: r.name, status: r.status })),
  },
  {
    type: "picklist", label: "Lista de separacao", group: "saida", format: "A4",
    description: "Sequencia de coleta pela rota do armazem, com codigos para bipagem.",
    list: async () => (await all<any>(
      `SELECT id, status, sales_order_id FROM picking_orders ORDER BY id`,
    )).map((r) => ({ id: r.id, label: r.id, sublabel: r.sales_order_id, status: r.status })),
  },
  {
    type: "packing-list", label: "Packing list", group: "saida", format: "A4",
    description: "Relacao do conteudo de cada volume do pedido.",
    list: async () => (await all<any>(
      `SELECT DISTINCT so.id, so.status, c.name FROM sales_orders so
         JOIN customers c ON c.id = so.customer_id
         JOIN volumes v ON v.sales_order_id = so.id ORDER BY so.id`,
    )).map((r) => ({ id: r.id, label: r.id, sublabel: r.name, status: r.status })),
  },
  {
    type: "volume-label", label: "Etiqueta de volume", group: "saida", format: "ETIQUETA",
    description: "Etiqueta de expedicao com destinatario, conteudo e peso.",
    list: async () => (await all<any>(
      `SELECT id, status, sales_order_id FROM volumes
        WHERE status <> 'CANCELLED' AND inbound_order_id IS NULL ORDER BY id`,
    )).map((r) => ({ id: r.id, label: r.id, sublabel: r.sales_order_id, status: r.status })),
  },
  {
    type: "volume-label-sheet", label: "Folha A4 · etiquetas de volume",
    group: "saida", format: "A4",
    description: "Seis etiquetas de volume por folha A4, em 2 colunas x 3 linhas.",
    list: () => folhaDeEtiquetas(
      `SELECT COUNT(*) FROM volumes WHERE status <> 'CANCELLED' AND inbound_order_id IS NULL`,
    ),
  },
  {
    type: "shipping-check", label: "Conferencia de expedicao", group: "saida", format: "A4",
    description: "Comparativo pedido x separacao x embalagem x conferencia.",
    list: async () => (await all<any>(
      `SELECT id, status, sales_order_id FROM shipping_checks ORDER BY id`,
    )).map((r) => ({ id: r.id, label: r.id, sublabel: r.sales_order_id, status: r.status })),
  },
  {
    type: "manifest", label: "Romaneio de carga", group: "saida", format: "A4",
    description: "Consolidacao da carga por veiculo, com sequencia de paradas e volumes.",
    list: async () => (await all<any>(
      `SELECT id, status, route FROM shipping_manifests ORDER BY id`,
    )).map((r) => ({ id: r.id, label: r.id, sublabel: r.route, status: r.status })),
  },
  {
    type: "transport", label: "Documento de transporte", group: "saida", format: "A4", simulated: true,
    description: "Documento de transporte simulado com remetente, transportador e carga.",
    list: async () => (await all<any>(
      `SELECT id, manifest_id, number FROM transport_documents ORDER BY id`,
    )).map((r) => ({ id: r.id, label: `DT ${r.number}`, sublabel: r.manifest_id })),
  },
  {
    type: "loading-checklist", label: "Checklist de carregamento", group: "saida", format: "A4",
    description: "Conferencia volume a volume na doca, com lacre e assinaturas.",
    list: async () => (await all<any>(
      `SELECT id, status, manifest_id FROM loading_operations ORDER BY id`,
    )).map((r) => ({ id: r.id, label: r.id, sublabel: r.manifest_id, status: r.status })),
  },
  {
    type: "shipping-receipt", label: "Comprovante de expedicao", group: "saida", format: "A4",
    description: "Comprovante final do embarque, com volumes e declaracao de baixa.",
    // Tambem os pedidos ja roteirizados, nao so os expedidos: o comprovante
    // e assinado na doca, entao precisa sair da impressora ANTES do embarque.
    // Os campos de data e baixa aparecem em branco enquanto a saida nao
    // aconteceu — o documento nunca afirma um embarque que nao houve.
    list: async () => (await all<any>(
      `SELECT so.id, so.status, c.name FROM sales_orders so
         JOIN customers c ON c.id = so.customer_id
        WHERE so.status = 'SHIPPED'
           OR EXISTS (SELECT 1 FROM manifest_orders mo WHERE mo.sales_order_id = so.id)
        ORDER BY so.id`,
    )).map((r) => ({ id: r.id, label: r.id, sublabel: r.name, status: r.status })),
  },
];

export const GROUP_LABEL: Record<DocGroup, string> = {
  entrada: "Entrada",
  armazenagem: "Armazenagem",
  saida: "Saida",
};

export function docType(type: string): DocType | undefined {
  return DOC_TYPES.find((d) => d.type === type);
}
