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

function open(): DatabaseSync {
  fs.mkdirSync(DB_DIR, { recursive: true });
  const db = new DatabaseSync(DB_FILE);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(fs.readFileSync(SCHEMA_FILE, "utf8"));
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
export function all<T = Row>(sql: string, ...params: any[]): T[] {
  return db().prepare(sql).all(...normalize(params)) as T[];
}

export function one<T = Row>(sql: string, ...params: any[]): T | undefined {
  return db().prepare(sql).get(...normalize(params)) as T | undefined;
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
