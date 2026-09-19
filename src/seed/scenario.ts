/**
 * CENARIO SIM-001 — "Operacao Logistica — Apresentacao"
 *
 * Dados 100% deterministicos. Os mesmos registros alimentam simultaneamente
 * o WMS e os documentos impressos: nao existe documento "de mentira" — cada
 * PDF e renderizado a partir destas entidades.
 *
 * Balanco planejado da apresentacao (conforme roteiro):
 *   ESTOQUE INICIAL   SKU-001 40 · SKU-002 25 · SKU-003 60 · SKU-004 30
 *   RECEBIMENTO       SKU-001 +20 · SKU-003 +30 · SKU-005 +40
 *   PEDIDO PED-000125 SKU-001 -15 · SKU-003 -20 · SKU-005 -10
 */

export const SCENARIO_ID = "SIM-001";
export const SCENARIO_NAME = "Operacao Logistica — Apresentacao";

export const WAREHOUSE = {
  id: "CD-01",
  name: "Jarvis Logistica e Armazenagem LTDA",
  tradeName: "Centro de Distribuicao Jarvis — Unidade Sao Paulo",
  cnpj: "55666777000188",
  ie: "999.888.777.666",
  address: "Rodovia Anhanguera, km 24, Galpao 3",
  city: "Cajamar",
  state: "SP",
  zip: "07750-000",
  phone: "(11) 4446-3000",
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
  { id: "USR-0001", name: "Marcus Valerio", email: "supervisor@jarvis.wms", role: "ADMIN" },
  { id: "USR-0002", name: "Carlos Andrade", email: "carlos.andrade@jarvis.wms", role: "SUPERVISOR" },
  { id: "USR-0003", name: "Marina Lopes", email: "marina.lopes@jarvis.wms", role: "OPERATOR" },
];

export const OPERATORS = [
  { id: "OPR-0001", userId: "USR-0002", name: "Carlos Andrade", badge: "OPR-0001", shift: "MANHA" },
  { id: "OPR-0002", userId: "USR-0003", name: "Marina Lopes", badge: "OPR-0002", shift: "MANHA" },
  { id: "OPR-0003", userId: null, name: "Diego Ferreira", badge: "OPR-0003", shift: "TARDE" },
  { id: "OPR-0004", userId: null, name: "Juliana Castro", badge: "OPR-0004", shift: "TARDE" },
];

export const SUPPLIERS = [
  {
    id: "FOR-0001", name: "Distribuidora Andrade Autopecas LTDA", trade: "Andrade Autopecas",
    cnpj: "12345678000190", ie: "111.222.333.444",
    address: "Av. das Industrias, 1250", city: "Diadema", state: "SP", zip: "09960-000",
    phone: "(11) 4055-1200", email: "comercial@andradeautopecas.sim",
  },
  {
    id: "FOR-0002", name: "Metalurgica Sul Componentes S/A", trade: "Metalurgica Sul",
    cnpj: "98765432000155", ie: "555.666.777.888",
    address: "Rua Joaquim Nabuco, 480", city: "Joinville", state: "SC", zip: "89201-200",
    phone: "(47) 3433-9000", email: "vendas@metalurgicasul.sim",
  },
];

export const CUSTOMERS = [
  {
    id: "CLI-0001", name: "Auto Center Ipiranga LTDA", trade: "Auto Center Ipiranga",
    cnpj: "22333444000101", ie: "222.333.444.555",
    address: "Av. Nazare, 2100", city: "Sao Paulo", state: "SP", zip: "04262-100",
    phone: "(11) 2274-8800", email: "compras@autocenteripiranga.sim",
  },
  {
    id: "CLI-0002", name: "Rede Mecanica Vale LTDA", trade: "Mecanica Vale",
    cnpj: "33444555000122", ie: "333.444.555.666",
    address: "Rod. Presidente Dutra, km 155", city: "Sao Jose dos Campos", state: "SP", zip: "12240-420",
    phone: "(12) 3921-4400", email: "suprimentos@mecanicavale.sim",
  },
  {
    id: "CLI-0003", name: "Oficina Central Campinas ME", trade: "Oficina Central",
    cnpj: "44555666000143", ie: "444.555.666.777",
    address: "Rua Barao de Jaguara, 870", city: "Campinas", state: "SP", zip: "13015-002",
    phone: "(19) 3234-7700", email: "contato@oficinacentral.sim",
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

export const PRODUCTS: SeedProduct[] = [
  {
    id: "SKU-001", sku: "SKU-001", description: "Oleo lubrificante sintetico 5W30 — caixa 12x1L",
    category: "Lubrificantes", unit: "CX", ncm: "27101932", cfopIn: "1102", cfopOut: "5102",
    unitWeight: 10.8, unitGross: 11.4, l: 40, w: 30, h: 25,
    unitsPerPallet: 40, unitPrice: 289.9, shelfLifeDays: 1460, minStock: 20, abc: "A",
    barcode: "7891000100011",
  },
  {
    id: "SKU-002", sku: "SKU-002", description: "Filtro de ar automotivo — caixa 6 un",
    category: "Filtros", unit: "CX", ncm: "84213100", cfopIn: "1102", cfopOut: "5102",
    unitWeight: 2.4, unitGross: 2.7, l: 45, w: 35, h: 30,
    unitsPerPallet: 48, unitPrice: 176.5, shelfLifeDays: null, minStock: 12, abc: "B",
    barcode: "7891000100028",
  },
  {
    id: "SKU-003", sku: "SKU-003", description: "Pastilha de freio ceramica dianteira — caixa 8 jogos",
    category: "Freios", unit: "CX", ncm: "87083090", cfopIn: "1102", cfopOut: "5102",
    unitWeight: 9.6, unitGross: 10.2, l: 40, w: 30, h: 22,
    unitsPerPallet: 40, unitPrice: 412.0, shelfLifeDays: null, minStock: 24, abc: "A",
    barcode: "7891000100035",
  },
  {
    id: "SKU-004", sku: "SKU-004", description: "Correia dentada reforcada — caixa 10 un",
    category: "Transmissao", unit: "CX", ncm: "40103100", cfopIn: "1102", cfopOut: "5102",
    unitWeight: 4.2, unitGross: 4.6, l: 40, w: 30, h: 18,
    unitsPerPallet: 48, unitPrice: 238.7, shelfLifeDays: 1825, minStock: 10, abc: "B",
    barcode: "7891000100042",
  },
  {
    id: "SKU-005", sku: "SKU-005", description: "Bateria automotiva 60Ah selada",
    category: "Eletrica", unit: "UN", ncm: "85071000", cfopIn: "1102", cfopOut: "5102",
    unitWeight: 14.2, unitGross: 15.0, l: 28, w: 18, h: 20,
    unitsPerPallet: 40, unitPrice: 468.0, shelfLifeDays: 730, minStock: 15, abc: "A",
    barcode: "7891000100059",
  },
  {
    id: "SKU-006", sku: "SKU-006", description: "Aditivo para radiador concentrado — caixa 12x1L",
    category: "Quimicos", unit: "CX", ncm: "38200000", cfopIn: "1102", cfopOut: "5102",
    unitWeight: 12.3, unitGross: 12.9, l: 40, w: 30, h: 26,
    unitsPerPallet: 40, unitPrice: 154.2, shelfLifeDays: 1095, minStock: 10, abc: "C",
    barcode: "7891000100066",
  },
  {
    id: "SKU-007", sku: "SKU-007", description: "Vela de ignicao iridium — caixa 20 un",
    category: "Eletrica", unit: "CX", ncm: "85111000", cfopIn: "1102", cfopOut: "5102",
    unitWeight: 1.8, unitGross: 2.1, l: 30, w: 25, h: 15,
    unitsPerPallet: 60, unitPrice: 321.4, shelfLifeDays: null, minStock: 15, abc: "B",
    barcode: "7891000100073",
  },
  {
    id: "SKU-008", sku: "SKU-008", description: "Amortecedor dianteiro pressurizado",
    category: "Suspensao", unit: "UN", ncm: "87088000", cfopIn: "1102", cfopOut: "5102",
    unitWeight: 3.6, unitGross: 4.0, l: 60, w: 15, h: 15,
    unitsPerPallet: 36, unitPrice: 287.9, shelfLifeDays: null, minStock: 8, abc: "C",
    barcode: "7891000100080",
  },
];

export const EQUIPMENT = [
  { id: "EQP-0001", kind: "COLETORA", model: "Zebra TC22 (USB/HID)", serial: "ZB-TC22-0431" },
  { id: "EQP-0002", kind: "COLETORA", model: "Honeywell CK65", serial: "HW-CK65-1180" },
  { id: "EQP-0003", kind: "EMPILHADEIRA", model: "Hyster J2.0XN eletrica", serial: "HY-J20-0077" },
  { id: "EQP-0004", kind: "EMPILHADEIRA", model: "Toyota 8FBE15", serial: "TY-8FB-0219" },
  { id: "EQP-0005", kind: "PALETEIRA", model: "Paleteira eletrica BT LWE130", serial: "BT-LWE-0342" },
  { id: "EQP-0006", kind: "IMPRESSORA", model: "Zebra ZT411 (etiquetas 100x150)", serial: "ZB-ZT411-0908" },
  { id: "EQP-0007", kind: "BALANCA", model: "Toledo 2098 plataforma 1500kg", serial: "TL-2098-0455" },
];

/** Estoque inicial: o cenario NAO comeca vazio. */
export const INITIAL_STOCK = [
  { productId: "SKU-001", quantity: 40, locationCode: "A-01-01-01", lot: "L2508A", expiresInDays: 900 },
  { productId: "SKU-002", quantity: 25, locationCode: "B-01-01-01", lot: "L2507B", expiresInDays: null },
  { productId: "SKU-003", quantity: 30, locationCode: "A-01-02-01", lot: "L2506C", expiresInDays: null },
  { productId: "SKU-003", quantity: 30, locationCode: "A-01-02-02", lot: "L2509C", expiresInDays: null },
  { productId: "SKU-004", quantity: 30, locationCode: "B-01-01-02", lot: "L2505D", expiresInDays: 1200 },
  { productId: "SKU-006", quantity: 45, locationCode: "C-01-01-01", lot: "L2504F", expiresInDays: 700 },
  { productId: "SKU-007", quantity: 50, locationCode: "B-01-02-01", lot: "L2508G", expiresInDays: null },
  { productId: "SKU-008", quantity: 12, locationCode: "C-01-01-02", lot: "L2503H", expiresInDays: null },
];

/** Pedidos de compra que originam os recebimentos da apresentacao. */
export const PURCHASE_ORDERS = [
  {
    id: "PC-000001", supplierId: "FOR-0001", buyer: "Carlos Andrade",
    paymentTerms: "28 dias", expectedInDays: 0,
    items: [
      { productId: "SKU-001", quantity: 20, lot: "L2601A", expiresInDays: 1400 },
      { productId: "SKU-003", quantity: 30, lot: "L2601C", expiresInDays: null },
    ],
  },
  {
    id: "PC-000002", supplierId: "FOR-0002", buyer: "Carlos Andrade",
    paymentTerms: "21 dias", expectedInDays: 0,
    items: [
      { productId: "SKU-005", quantity: 40, lot: "L2601E", expiresInDays: 720 },
    ],
  },
];

export const INBOUND_ORDERS = [
  {
    id: "OR-000001", purchaseOrderId: "PC-000001", supplierId: "FOR-0001",
    invoiceId: "NFS-000001", dockId: "DOCA-01",
    vehiclePlate: "RQZ-4G18", vehicleKind: "Truck bau", carrier: "Andrade Logistica",
    driverName: "Sebastiao Ramos", driverDoc: "MG-14.882.301",
    scheduledInMinutes: -60, expectedVolumes: 2,
  },
  {
    id: "OR-000002", purchaseOrderId: "PC-000002", supplierId: "FOR-0002",
    invoiceId: "NFS-000002", dockId: "DOCA-02",
    vehiclePlate: "SCD-7H42", vehicleKind: "VUC", carrier: "Sul Transportes",
    driverName: "Antonio Beltrao", driverDoc: "SC-9.114.775",
    scheduledInMinutes: -30, expectedVolumes: 1,
  },
];

/** Pedidos de venda: consomem estoque inicial E produtos recem-recebidos. */
export const SALES_ORDERS = [
  {
    id: "PED-000125", customerId: "CLI-0001", priority: "ALTA", dueInHours: 8,
    carrier: "Expresso Paulista",
    items: [
      { productId: "SKU-001", quantity: 15 },
      { productId: "SKU-003", quantity: 20 },
      { productId: "SKU-005", quantity: 10 },
    ],
  },
  {
    id: "PED-000126", customerId: "CLI-0002", priority: "NORMAL", dueInHours: 24,
    carrier: "Expresso Paulista",
    items: [
      { productId: "SKU-002", quantity: 10 },
      { productId: "SKU-004", quantity: 8 },
      { productId: "SKU-007", quantity: 12 },
    ],
  },
  {
    id: "PED-000127", customerId: "CLI-0003", priority: "URGENTE", dueInHours: 6,
    carrier: "Expresso Paulista",
    items: [
      { productId: "SKU-001", quantity: 8 },
      { productId: "SKU-006", quantity: 15 },
    ],
  },
];

/** Romaneio pre-numerado conforme o roteiro da apresentacao. */
export const MANIFEST_SEED = {
  id: "ROM-000018",
  route: "SP Capital / Vale do Paraiba",
  carrier: "Expresso Paulista Transportes",
  vehiclePlate: "FTK-2D09",
  vehicleKind: "Truck bau 14t",
  driverName: "Roberto Nunes",
  driverDoc: "SP-28.441.903",
  dockId: "DOCA-03",
};

/** Contadores iniciais para que os IDs batam com os documentos impressos. */
export const SEQUENCE_SEEDS: Record<string, number> = {
  PED: 124,   // primeiro pedido gerado sera PED-000125
  ROM: 17,    // primeiro romaneio sera ROM-000018
};
