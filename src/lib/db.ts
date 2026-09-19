import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export type Row = Record<string, any>;

const DB_DIR = process.env.WMS_DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DB_DIR, "wms.db");
const SCHEMA_FILE = path.join(process.cwd(), "db", "schema.sql");

declare global {
  // eslint-disable-next-line no-var
  var __wmsDb: DatabaseSync | undefined;
}

/**
 * Versao do esquema derivada do proprio arquivo: qualquer alteracao em
 * schema.sql muda a assinatura. Como `CREATE TABLE IF NOT EXISTS` nao
 * altera tabelas ja existentes, um banco com assinatura diferente e
 * recriado — seguro aqui, porque o cenario e sempre recarregavel e
 * deterministico.
 */
function schemaSignature(sql: string): number {
  let h = 2166136261;
  for (let i = 0; i < sql.length; i++) {
    h ^= sql.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 1; // user_version e inteiro de 31 bits com sinal
}

function connect(): DatabaseSync {
  const db = new DatabaseSync(DB_FILE);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  return db;
}

function open(): DatabaseSync {
  fs.mkdirSync(DB_DIR, { recursive: true });
  const sql = fs.readFileSync(SCHEMA_FILE, "utf8");
  const signature = schemaSignature(sql);

  let db = connect();
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number } | undefined;
  const current = row?.user_version ?? 0;

  if (current !== 0 && current !== signature) {
    // Esquema evoluiu: recria o arquivo e deixa o seed recarregar o cenario.
    db.close();
    for (const suffix of ["", "-wal", "-shm", "-journal"]) {
      try { fs.rmSync(DB_FILE + suffix, { force: true }); } catch { /* ignora */ }
    }
    db = connect();
  }

  db.exec(sql);
  db.exec(`PRAGMA user_version = ${signature}`);
  return db;
}

/** Conexao unica por processo (reaproveitada entre hot-reloads do Next). */
export function db(): DatabaseSync {
  if (!globalThis.__wmsDb) globalThis.__wmsDb = open();
  return globalThis.__wmsDb;
}

export function closeDb(): void {
  globalThis.__wmsDb?.close();
  globalThis.__wmsDb = undefined;
}

/** Caminho do arquivo de banco — usado pelo reset da simulacao. */
export const dbFile = DB_FILE;

// ------------------------------------------------------------------ queries
/**
 * node:sqlite devolve linhas com prototipo nulo, que os React Server
 * Components nao conseguem serializar para o cliente. Converter aqui, no
 * unico ponto de leitura, evita ter de tratar isso em cada tela.
 */
function plain<T>(row: any): T {
  return row === undefined || row === null ? row : ({ ...row } as T);
}

export function all<T = Row>(sql: string, ...params: any[]): T[] {
  return (db().prepare(sql).all(...normalize(params)) as any[]).map((r) => plain<T>(r));
}

export function one<T = Row>(sql: string, ...params: any[]): T | undefined {
  const row = db().prepare(sql).get(...normalize(params));
  return row === undefined ? undefined : plain<T>(row);
}

export function scalar<T = number>(sql: string, ...params: any[]): T | undefined {
  const r = one<Row>(sql, ...params);
  if (!r) return undefined;
  const k = Object.keys(r)[0];
  return r[k] as T;
}

export function run(sql: string, ...params: any[]) {
  return db().prepare(sql).run(...normalize(params));
}

export function exec(sql: string) {
  db().exec(sql);
}

/**
 * node:sqlite aceita apenas null/number/bigint/string/Uint8Array.
 * Booleanos e undefined sao convertidos aqui, em um unico ponto.
 */
function normalize(params: any[]): any[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    if (p instanceof Date) return p.toISOString();
    return p;
  });
}

let txDepth = 0;

/**
 * Transacao sincrona e reentrante.
 * O nivel externo usa BEGIN/COMMIT; os internos usam SAVEPOINT, de modo que
 * um servico possa compor outro sem quebrar a atomicidade — qualquer excecao
 * desfaz o bloco correspondente e propaga para o nivel de cima.
 */
export function tx<T>(fn: () => T): T {
  const d = db();
  const depth = txDepth++;
  const name = `sp_${depth}`;
  if (depth === 0) d.exec("BEGIN IMMEDIATE");
  else d.exec(`SAVEPOINT ${name}`);
  try {
    const result = fn();
    if (depth === 0) d.exec("COMMIT");
    else d.exec(`RELEASE ${name}`);
    return result;
  } catch (err) {
    try {
      if (depth === 0) d.exec("ROLLBACK");
      else d.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
    } catch {
      /* rollback best-effort */
    }
    throw err;
  } finally {
    txDepth = depth;
  }
}

/** Insere a partir de um objeto, ignorando chaves undefined. */
export function insert(table: string, data: Record<string, any>) {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  const cols = keys.join(", ");
  const marks = keys.map(() => "?").join(", ");
  return run(
    `INSERT INTO ${table} (${cols}) VALUES (${marks})`,
    ...keys.map((k) => data[k]),
  );
}

export function update(table: string, id: string, data: Record<string, any>) {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  return run(
    `UPDATE ${table} SET ${sets} WHERE id = ?`,
    ...keys.map((k) => data[k]),
    id,
  );
}

export function databaseExists(): boolean {
  return fs.existsSync(DB_FILE);
}

/** Verdadeiro quando o processo aponta para o banco padrao da operacao. */
export function isOperationalDatabase(): boolean {
  return !process.env.WMS_DATA_DIR;
}
