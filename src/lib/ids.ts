import { one, run } from "./db";

/**
 * Prefixos de identificadores. O ID e o MESMO valor impresso no codigo de
 * barras — a coletora le exatamente estas strings.
 */
export const PREFIX = {
  PURCHASE_ORDER: "PC",
  INBOUND_ORDER: "OR",
  INVOICE: "NFS",
  WEIGHING: "PES",
  RECEIVING_CHECK: "CONF",
  PALLET: "PLT",
  STORAGE_ORDER: "ARM",
  LOCATION: "END",
  MOVEMENT: "MOV",
  RESERVATION: "RES",
  SALES_ORDER: "PED",
  PICKING_ORDER: "PCK",
  PICKING_ITEM: "PKI",
  PACKING_ORDER: "PAK",
  VOLUME: "VOL",
  SHIPPING_CHECK: "CEX",
  MANIFEST: "ROM",
  TRANSPORT_DOC: "DTS",
  LOADING: "CAR",
  SHIPMENT: "EXP",
  INVENTORY_COUNT: "INV",
  INCIDENT: "OCO",
  EQUIPMENT: "EQP",
  OPERATOR: "OPR",
  SUPPLIER: "FOR",
  CUSTOMER: "CLI",
  LOT: "LOT",
} as const;

export type IdPrefix = (typeof PREFIX)[keyof typeof PREFIX];

/** Largura padrao do contador por prefixo. */
const WIDTH: Record<string, number> = {
  OPR: 4,
  FOR: 4,
  CLI: 4,
  EQP: 4,
};

function pad(n: number, width: number) {
  return String(n).padStart(width, "0");
}

/**
 * Proximo identificador sequencial e deterministico para o prefixo.
 * Usa a tabela id_sequences — reiniciada junto com a simulacao.
 */
export async function nextId(prefix: string): Promise<string> {
  const width = WIDTH[prefix] ?? 6;
  const row = await one<{ current: number }>(
    "SELECT current FROM id_sequences WHERE prefix = ?",
    prefix,
  );
  const next = (row?.current ?? 0) + 1;
  if (row) {
    await run("UPDATE id_sequences SET current = ? WHERE prefix = ?", next, prefix);
  } else {
    await run("INSERT INTO id_sequences (prefix, current) VALUES (?, ?)", prefix, next);
  }
  return `${prefix}-${pad(next, width)}`;
}

/** Define o contador (usado pelo seed para IDs determinísticos). */
export async function setSequence(prefix: string, value: number): Promise<void> {
  await run(
    `INSERT INTO id_sequences (prefix, current) VALUES (?, ?)
     ON CONFLICT(prefix) DO UPDATE SET current = excluded.current`,
    prefix,
    value,
  );
}

export function formatId(prefix: string, n: number): string {
  return `${prefix}-${pad(n, WIDTH[prefix] ?? 6)}`;
}

// ------------------------------------------------------------ enderecos
/** 'A-02-03-01' -> 'END-A020301' */
export function locationIdFromCode(code: string): string {
  return `${PREFIX.LOCATION}-${code.replace(/-/g, "")}`;
}

/** 'END-A020301' -> 'A-02-03-01' */
export function locationCodeFromId(id: string): string | null {
  const m = /^END-([A-Z])(\d{2})(\d{2})(\d{2})$/.exec(id.trim().toUpperCase());
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}-${m[4]}`;
}

/** Aceita 'A-02-03-01', 'A020301' ou 'END-A020301'. */
export function normalizeLocationInput(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  if (/^END-[A-Z]\d{6}$/.test(s)) return s;
  const compact = s.replace(/-/g, "");
  if (/^[A-Z]\d{6}$/.test(compact)) return `${PREFIX.LOCATION}-${compact}`;
  return null;
}

export function buildLocationCode(
  zone: string,
  aisle: number,
  rack: number,
  level: number,
): string {
  return `${zone}-${pad(aisle, 2)}-${pad(rack, 2)}-${pad(level, 2)}`;
}

/** Extrai o prefixo de um identificador do sistema. */
export function prefixOf(id: string): string | null {
  const m = /^([A-Z]{2,4})-/.exec(id.trim().toUpperCase());
  return m ? m[1] : null;
}
