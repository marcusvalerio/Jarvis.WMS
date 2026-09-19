/**
 * CENARIO SIM-001 — "LOG122 — Operacao Integrada"
 *
 * Dados 100% deterministicos. Os mesmos registros alimentam simultaneamente
 * o WMS e os documentos impressos: nao existe documento "de mentira" — cada
 * PDF e renderizado a partir destas entidades.
 *
 * Balanco planejado da apresentacao:
 *   ESTOQUE INICIAL  SKU-001 120 un · SKU-002 120 un  (2 lotes cada, para FEFO)
 *   RECEBIMENTO      10 caixas = 120 shampoos + 120 condicionadores
 *                    OR-000001 6 caixas (72+72) · OR-000002 4 caixas (48+48)
 *   DISPONIVEL       240 un de cada SKU
 *   EXPEDICAO        18 caixas = 216 shampoos + 216 condicionadores
 *                    6 pedidos x 3 caixas · 2 rotas x 9 caixas
 *   SALDO FINAL      24 un de cada SKU
 *
 * A CAIXA e a unidade logistica da operacao: 12 shampoos + 12 condicionadores,
 * 24 unidades. Cada caixa expedida vira um volume com identidade propria
 * (VOL-000001...VOL-000018) e etiqueta Code 128.
 */

export const SCENARIO_ID = "SIM-001";
export const SCENARIO_NAME = "LOG122 — Operacao Integrada";

export const WAREHOUSE = {
  id: "CD-01",
  name: "LOG122 Logistica Integrada LTDA",
  tradeName: "LOG122 — Sede Santa Cruz",
  cnpj: "12200122000110",
  ie: "122.200.122.000",
  address: "Avenida Joao XXIII, 1220 — Distrito Industrial de Santa Cruz",
  city: "Rio de Janeiro",
  state: "RJ",
  zip: "23565-000",
  phone: "(21) 3122-0122",
};

export const ZONES = [
  { id: "R", code: "R", name: "Recebimento", kind: "RECEIVING", abc: null, order: 0 },
  { id: "A", code: "A", name: "Picking A — alto giro", kind: "PICKING", abc: "A", order: 1 },
  { id: "B", code: "B", name: "Armazenagem B — medio giro", kind: "STORAGE", abc: "B", order: 2 },
  { id: "C", code: "C", name: "Armazenagem C — baixo giro", kind: "STORAGE", abc: "C", order: 3 },
  { id: "E", code: "E", name: "Expedicao", kind: "SHIPPING", abc: null, order: 4 },
] as const;

/** Estrutura fisica: zona -> corredores x modulos x niveis. */
export const LAYOUT: Record<string, { aisles: number; racks: number; levels: number }> = {
  A: { aisles: 3, racks: 4, levels: 3 },
  B: { aisles: 2, racks: 4, levels: 3 },
  C: { aisles: 2, racks: 3, levels: 2 },
};

export const DOCKS = [
  { id: "DOCA-01", name: "Doca 01 — Recebimento", kind: "INBOUND" },
  { id: "DOCA-02", name: "Doca 02 — Recebimento", kind: "INBOUND" },
  { id: "DOCA-03", name: "Doca 03 — Expedicao", kind: "OUTBOUND" },
  { id: "DOCA-04", name: "Doca 04 — Expedicao", kind: "OUTBOUND" },
];

export const USERS = [
  { id: "USR-0001", name: "Marcus Valerio", email: "supervisor@log122.sim", role: "ADMIN" },
  { id: "USR-0002", name: "Carlos Andrade", email: "carlos.andrade@log122.sim", role: "SUPERVISOR" },
  { id: "USR-0003", name: "Marina Lopes", email: "marina.lopes@log122.sim", role: "OPERATOR" },
];

export const OPERATORS = [
  { id: "OPR-0001", userId: "USR-0002", name: "Carlos Andrade", badge: "OPR-0001", shift: "MANHA" },
  { id: "OPR-0002", userId: "USR-0003", name: "Marina Lopes", badge: "OPR-0002", shift: "MANHA" },
  { id: "OPR-0003", userId: null, name: "Diego Ferreira", badge: "OPR-0003", shift: "TARDE" },
  { id: "OPR-0004", userId: null, name: "Juliana Castro", badge: "OPR-0004", shift: "TARDE" },
];

export const SUPPLIERS = [
  {
    id: "FOR-0001", name: "Distribuidora Higiene e Beleza Guandu LTDA", trade: "Guandu Distribuidora",
    cnpj: "12345678000190", ie: "111.222.333.444",
    address: "Rodovia Presidente Dutra, km 192, Galpao 7", city: "Nova Iguacu", state: "RJ", zip: "26030-570",
    phone: "(21) 2667-4400", email: "comercial@guandudistribuidora.sim",
  },
  {
    id: "FOR-0002", name: "Atacado Sul Fluminense Cosmeticos S/A", trade: "Sul Fluminense Cosmeticos",
    cnpj: "98765432000155", ie: "555.666.777.888",
    address: "Avenida Nossa Senhora das Gracas, 980", city: "Duque de Caxias", state: "RJ", zip: "25071-210",
    phone: "(21) 2671-9100", email: "vendas@sulfluminensecosmeticos.sim",
  },
];

/**
 * Destinos de entrega: seis unidades do Supermercado Guanabara.
 * Logradouros e CEPs verificados em diretorios publicos (set/2026). O CNPJ e
 * simulado — a operacao e academica e nao emite documento fiscal real.
 *
 * ATENCAO: a SEDE LOG122 tambem fica em Santa Cruz, mas e origem e retorno
 * das rotas, NAO um destino. Sao entidades distintas: a sede e WAREHOUSE.
 */
export const CUSTOMERS = [
  {
    id: "CLI-0001", name: "Supermercados Guanabara — Santa Cruz", trade: "Guanabara Santa Cruz",
    cnpj: "31500122000101", ie: "315.001.220.001",
    address: "Rua Felipe Cardoso, 1470", city: "Rio de Janeiro", state: "RJ", zip: "23520-570",
    phone: "(21) 2418-4015", email: "santacruz@guanabara.sim",
  },
  {
    id: "CLI-0002", name: "Supermercados Guanabara — Paciencia", trade: "Guanabara Paciencia",
    cnpj: "31500122000202", ie: "315.001.220.002",
    address: "Avenida Cesario de Melo, 10809", city: "Rio de Janeiro", state: "RJ", zip: "23585-126",
    phone: "(21) 2409-6145", email: "paciencia@guanabara.sim",
  },
  {
    id: "CLI-0003", name: "Supermercados Guanabara — Campo Grande", trade: "Guanabara Campo Grande",
    cnpj: "31500122000303", ie: "315.001.220.003",
    address: "Estrada Rio do A, 1415", city: "Rio de Janeiro", state: "RJ", zip: "23080-300",
    phone: "(21) 3402-7700", email: "campogrande@guanabara.sim",
  },
  {
    id: "CLI-0004", name: "Supermercados Guanabara — Iraja", trade: "Guanabara Iraja",
    cnpj: "31500122000404", ie: "315.001.220.004",
    address: "Avenida Monsenhor Felix, 1213", city: "Rio de Janeiro", state: "RJ", zip: "21235-112",
    phone: "(21) 2471-1231", email: "iraja@guanabara.sim",
  },
  {
    id: "CLI-0005", name: "Supermercados Guanabara — Penha", trade: "Guanabara Penha",
    cnpj: "31500122000505", ie: "315.001.220.005",
    address: "Avenida Bras de Pina, 201", city: "Rio de Janeiro", state: "RJ", zip: "21070-031",
    phone: "(21) 3355-8400", email: "penha@guanabara.sim",
  },
  {
    id: "CLI-0006", name: "Supermercados Guanabara — Bonsucesso", trade: "Guanabara Bonsucesso",
    cnpj: "31500122000606", ie: "315.001.220.006",
    address: "Avenida Teixeira de Castro, 90", city: "Rio de Janeiro", state: "RJ", zip: "21040-112",
    phone: "(21) 3868-3851", email: "bonsucesso@guanabara.sim",
  },
];

export interface SeedProduct {
  id: string; sku: string; description: string; category: string; unit: string;
  ncm: string; cfopIn: string; cfopOut: string;
  unitWeight: number; unitGross: number;
  l: number; w: number; h: number;
  unitsPerPallet: number; unitPrice: number;
  shelfLifeDays: number | null; minStock: number; abc: string;
  barcode: string;
}

/**
 * Dois produtos, os mesmos da apresentacao fisica. Os identificadores
 * internos (SKU-001/SKU-002) sao preservados: sao eles que vao no Code 128 e
 * que a coletora le. O campo `barcode` guarda o EAN comercial, disponivel
 * para consulta, mas o identificador operacional e o SKU interno.
 */
export const PRODUCTS: SeedProduct[] = [
  {
    id: "SKU-001", sku: "SKU-001", description: "Shampoo Pantene 400ml",
    category: "Higiene e Beleza", unit: "UN", ncm: "33051000", cfopIn: "1102", cfopOut: "5102",
    unitWeight: 0.42, unitGross: 0.45, l: 6.5, w: 6.5, h: 21,
    unitsPerPallet: 120, unitPrice: 24.9, shelfLifeDays: 1080, minStock: 48, abc: "A",
    barcode: "7896094900011",
  },
  {
    id: "SKU-002", sku: "SKU-002", description: "Condicionador Pantene 400ml",
    category: "Higiene e Beleza", unit: "UN", ncm: "33059000", cfopIn: "1102", cfopOut: "5102",
    unitWeight: 0.44, unitGross: 0.47, l: 6.5, w: 6.5, h: 21,
    unitsPerPallet: 120, unitPrice: 26.5, shelfLifeDays: 1080, minStock: 48, abc: "A",
    barcode: "7896094900028",
  },
];

/** A caixa e a unidade logistica: 12 + 12 = 24 unidades. */
export const BOX = {
  shampooPerBox: 12,
  conditionerPerBox: 12,
  get unitsPerBox() { return this.shampooPerBox + this.conditionerPerBox; },
  inboundBoxes: 10,
  outboundBoxes: 18,
} as const;

export const EQUIPMENT = [
  { id: "EQP-0001", kind: "COLETORA", model: "Zebra TC22 (USB/HID)", serial: "ZB-TC22-0431" },
  { id: "EQP-0002", kind: "COLETORA", model: "Honeywell CK65", serial: "HW-CK65-1180" },
  { id: "EQP-0003", kind: "EMPILHADEIRA", model: "Hyster J2.0XN eletrica", serial: "HY-J20-0077" },
  { id: "EQP-0004", kind: "EMPILHADEIRA", model: "Toyota 8FBE15", serial: "TY-8FB-0219" },
  { id: "EQP-0005", kind: "PALETEIRA", model: "Paleteira eletrica BT LWE130", serial: "BT-LWE-0342" },
  { id: "EQP-0006", kind: "IMPRESSORA", model: "Zebra ZT411 (etiquetas 100x150)", serial: "ZB-ZT411-0908" },
  { id: "EQP-0007", kind: "BALANCA", model: "Toledo 2098 plataforma 1500kg", serial: "TL-2098-0455" },
];

/**
 * Estoque inicial: o cenario NAO comeca vazio.
 * 120 unidades de cada SKU, divididas em dois lotes por SKU — e o que permite
 * demonstrar FEFO na separacao. Somadas as 120 de cada que entram pelo
 * recebimento, dao as 240 necessarias para expedir 216 e ainda sobrar 24.
 */
export const INITIAL_STOCK = [
  { productId: "SKU-001", quantity: 60, locationCode: "A-01-01-01", lot: "L2601S", expiresInDays: 700 },
  { productId: "SKU-001", quantity: 60, locationCode: "A-01-01-02", lot: "L2602S", expiresInDays: 900 },
  { productId: "SKU-002", quantity: 60, locationCode: "A-01-02-01", lot: "L2601C", expiresInDays: 700 },
  { productId: "SKU-002", quantity: 60, locationCode: "A-01-02-02", lot: "L2602C", expiresInDays: 900 },
];

/**
 * Pedidos de compra que originam o recebimento das 10 caixas.
 * PC-000001: 6 caixas (72 shampoos + 72 condicionadores)
 * PC-000002: 4 caixas (48 shampoos + 48 condicionadores)
 */
export const PURCHASE_ORDERS = [
  {
    id: "PC-000001", supplierId: "FOR-0001", buyer: "Carlos Andrade",
    paymentTerms: "28 dias", expectedInDays: 0,
    items: [
      { productId: "SKU-001", quantity: 72, lot: "L2603S", expiresInDays: 1080 },
      { productId: "SKU-002", quantity: 72, lot: "L2603C", expiresInDays: 1080 },
    ],
  },
  {
    id: "PC-000002", supplierId: "FOR-0002", buyer: "Carlos Andrade",
    paymentTerms: "21 dias", expectedInDays: 0,
    items: [
      { productId: "SKU-001", quantity: 48, lot: "L2604S", expiresInDays: 1080 },
      { productId: "SKU-002", quantity: 48, lot: "L2604C", expiresInDays: 1080 },
    ],
  },
];

export const INBOUND_ORDERS = [
  {
    id: "OR-000001", purchaseOrderId: "PC-000001", supplierId: "FOR-0001",
    invoiceId: "NFS-000001", dockId: "DOCA-01",
    vehiclePlate: "RQZ-4G18", vehicleKind: "Truck bau", carrier: "Guandu Transportes",
    driverName: "Sebastiao Ramos", driverDoc: "MG-14.882.301",
    scheduledInMinutes: -60, expectedVolumes: 6,  // 6 caixas
  },
  {
    id: "OR-000002", purchaseOrderId: "PC-000002", supplierId: "FOR-0002",
    invoiceId: "NFS-000002", dockId: "DOCA-02",
    vehiclePlate: "SCD-7H42", vehicleKind: "VUC", carrier: "Sul Fluminense Transportes",
    driverName: "Antonio Beltrao", driverDoc: "SC-9.114.775",
    scheduledInMinutes: -30, expectedVolumes: 4,  // 4 caixas
  },
];

/**
 * Pedidos de venda — um por unidade Guanabara.
 * Cada pedido equivale a 3 caixas: 36 shampoos + 36 condicionadores.
 * Seis pedidos x 3 caixas = 18 caixas = 216 + 216 unidades.
 * A distribuicao e fixa aqui no cenario, nunca sorteada, para que um
 * reinicio da simulacao reproduza exatamente a mesma carga.
 */
export const SALES_ORDERS = [
  // ---------------------------------------------- Rota 01 — Zona Oeste
  {
    id: "PED-000125", customerId: "CLI-0001", priority: "ALTA", dueInHours: 8,
    carrier: "LOG122 Frota Propria",
    items: [{ productId: "SKU-001", quantity: 36 }, { productId: "SKU-002", quantity: 36 }],
  },
  {
    id: "PED-000126", customerId: "CLI-0002", priority: "NORMAL", dueInHours: 10,
    carrier: "LOG122 Frota Propria",
    items: [{ productId: "SKU-001", quantity: 36 }, { productId: "SKU-002", quantity: 36 }],
  },
  {
    id: "PED-000127", customerId: "CLI-0003", priority: "NORMAL", dueInHours: 12,
    carrier: "LOG122 Frota Propria",
    items: [{ productId: "SKU-001", quantity: 36 }, { productId: "SKU-002", quantity: 36 }],
  },
  // ---------------------------------------------- Rota 02 — Zona Norte
  {
    id: "PED-000128", customerId: "CLI-0004", priority: "ALTA", dueInHours: 8,
    carrier: "LOG122 Frota Propria",
    items: [{ productId: "SKU-001", quantity: 36 }, { productId: "SKU-002", quantity: 36 }],
  },
  {
    id: "PED-000129", customerId: "CLI-0005", priority: "NORMAL", dueInHours: 10,
    carrier: "LOG122 Frota Propria",
    items: [{ productId: "SKU-001", quantity: 36 }, { productId: "SKU-002", quantity: 36 }],
  },
  {
    id: "PED-000130", customerId: "CLI-0006", priority: "NORMAL", dueInHours: 12,
    carrier: "LOG122 Frota Propria",
    items: [{ productId: "SKU-001", quantity: 36 }, { productId: "SKU-002", quantity: 36 }],
  },
];

/** Quantas caixas cada pedido leva — 3 por entrega, 9 por rota. */
export const BOXES_PER_ORDER = 3;

/**
 * As duas rotas da operacao.
 *
 * A SEDE LOG122 (Santa Cruz) e a origem e o retorno de ambas — e por isso
 * NAO aparece em `stops`: `stops` lista apenas entregas, e o romaneio deriva
 * origem e retorno do proprio armazem. O Guanabara Santa Cruz, este sim, e
 * uma entrega, e nao se confunde com a sede.
 */
export const ROUTES = [
  {
    id: "ROM-000018",
    code: "ROTA 01",
    name: "Rota 01 — Zona Oeste",
    route: "Zona Oeste — Santa Cruz / Paciencia / Campo Grande",
    vehicle: "VEICULO 01",
    carrier: "LOG122 Frota Propria",
    vehiclePlate: "LOG-1A22",
    vehicleKind: "Truck bau 14t",
    driverName: "Roberto Nunes",
    driverDoc: "RJ-28.441.903",
    dockId: "DOCA-03",
    /** Ordem das paradas — vira manifest_orders.stop_sequence. */
    stops: ["PED-000125", "PED-000126", "PED-000127"],
  },
  {
    id: "ROM-000019",
    code: "ROTA 02",
    name: "Rota 02 — Zona Norte",
    route: "Zona Norte — Iraja / Penha / Bonsucesso",
    vehicle: "VEICULO 02",
    carrier: "LOG122 Frota Propria",
    vehiclePlate: "LOG-2B22",
    vehicleKind: "Truck bau 14t",
    driverName: "Antonio Beltrao",
    driverDoc: "RJ-31.775.220",
    dockId: "DOCA-04",
    stops: ["PED-000128", "PED-000129", "PED-000130"],
  },
] as const;

/** Compatibilidade: a primeira rota, usada onde antes havia um unico romaneio. */
export const MANIFEST_SEED = ROUTES[0];

/** Contadores iniciais para que os IDs batam com os documentos impressos. */
export const SEQUENCE_SEEDS: Record<string, number> = {
  PED: 124,   // primeiro pedido gerado sera PED-000125
  ROM: 17,    // primeiro romaneio sera ROM-000018
};
