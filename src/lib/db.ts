import { AsyncLocalStorage } from "node:async_hooks";
import { SCHEMA_SQL } from "@/db/schema";

/**
 * CAMADA DE PERSISTENCIA — PostgreSQL (Neon em producao).
 *
 * Substitui o node:sqlite original, que gravava um arquivo em disco e por
 * isso nao sobrevive ao filesystem somente-leitura e efemero do runtime
 * serverless. A interface publica (all/one/scalar/run/exec/tx/insert/update)
 * foi preservada em nome e semantica; mudou apenas o que era impossivel
 * manter: as funcoes agora sao assincronas, porque nenhum driver PostgreSQL
 * oferece API sincrona.
 *
 * As consultas da aplicacao continuam escritas com marcadores `?`, no mesmo
 * dialeto de antes; a conversao para `$1..$n` acontece aqui, em um unico
 * ponto, para que nenhuma query do dominio precise ser reescrita.
 */

export type Row = Record<string, any>;

// --------------------------------------------------------------- conexao
interface QueryResult { rows: any[]; rowCount: number | null }
interface Client {
  query(text: string, values?: any[]): Promise<QueryResult>;
  release(): void;
}
interface PoolLike {
  connect(): Promise<Client>;
  query(text: string, values?: any[]): Promise<QueryResult>;
  end(): Promise<void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __wmsPool: PoolLike | undefined;
  // eslint-disable-next-line no-var
  var __wmsSchema: Promise<void> | undefined;
}

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL nao esta definida. O Jarvis WMS usa PostgreSQL (Neon em " +
      "producao). Defina DATABASE_URL com a string de conexao antes de iniciar.",
    );
  }
  return url;
}

/**
 * O driver do Neon (WebSocket) e o ideal em serverless, mas nao fala com um
 * PostgreSQL comum; `pg` atende desenvolvimento local e testes. A escolha e
 * feita pela propria URL, entao o mesmo codigo roda nos tres ambientes.
 */
function createPool(url: string): PoolLike {
  const isNeon = /\.neon\.tech(:|\/|$)/.test(new URL(url).host + "/");
  if (isNeon) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool, neonConfig, types } = require("@neondatabase/serverless");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    neonConfig.webSocketConstructor ??= require("ws");
    applyTypeParsers(types);
    return new Pool({ connectionString: url, max: 1, idleTimeoutMillis: 10_000 });
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pg = require("pg");
  applyTypeParsers(pg.types);
  return new pg.Pool({
    connectionString: url,
    max: Number(process.env.WMS_DB_POOL ?? 10),
    idleTimeoutMillis: 10_000,
    ssl: /\bsslmode=require\b/.test(url) ? { rejectUnauthorized: false } : undefined,
  });
}

/**
 * Por padrao o driver devolve int8 e numeric como STRING, para nao perder
 * precisao. O dominio do WMS trata contagens e quantidades como number —
 * `COUNT(*)` alimentando KPIs, somas de estoque, pesos. Sem estes parsers,
 * `scalar<number>` devolveria "8" e as contas passariam a concatenar.
 */
function applyTypeParsers(types: any): void {
  if (!types?.setTypeParser) return;
  types.setTypeParser(20, (v: string) => (v === null ? null : Number(v)));   // int8
  types.setTypeParser(1700, (v: string) => (v === null ? null : Number(v))); // numeric
}

function pool(): PoolLike {
  if (!globalThis.__wmsPool) globalThis.__wmsPool = createPool(connectionString());
  return globalThis.__wmsPool;
}

/**
 * Cria o esquema uma vez por processo. O DDL e idempotente e roda sob lock
 * consultivo, para que instancias concorrentes na Vercel nao disputem o
 * mesmo CREATE TABLE.
 */
export function ensureSchema(): Promise<void> {
  globalThis.__wmsSchema ??= (async () => {
    const c = await pool().connect();
    try {
      await c.query("SELECT pg_advisory_lock($1)", [727_001]);
      try {
        await c.query(SCHEMA_SQL);
      } finally {
        await c.query("SELECT pg_advisory_unlock($1)", [727_001]);
      }
    } finally {
      c.release();
    }
  })().catch((err) => {
    globalThis.__wmsSchema = undefined; // permite nova tentativa
    throw err;
  });
  return globalThis.__wmsSchema;
}

export async function closeDb(): Promise<void> {
  const p = globalThis.__wmsPool;
  globalThis.__wmsPool = undefined;
  globalThis.__wmsSchema = undefined;
  await p?.end();
}

// ------------------------------------------------------------ marcadores
/**
 * Converte `?` em `$1..$n` ignorando o que estiver dentro de literais e
 * comentarios, para nao corromper uma query que contenha '?' em texto.
 */
export function toPgPlaceholders(sql: string): string {
  let out = "";
  let n = 0;
  let quote: string | null = null;
  let comment: "line" | "block" | null = null;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const next = sql[i + 1];

    if (comment === "line") { out += c; if (c === "\n") comment = null; continue; }
    if (comment === "block") { out += c; if (c === "*" && next === "/") { out += next; i++; comment = null; } continue; }
    if (!quote && c === "-" && next === "-") { out += c + next; i++; comment = "line"; continue; }
    if (!quote && c === "/" && next === "*") { out += c + next; i++; comment = "block"; continue; }

    if (quote) {
      out += c;
      if (c === quote) {
        if (next === quote) { out += next; i++; }  // aspas escapadas
        else quote = null;
      }
      continue;
    }
    if (c === "'" || c === '"') { quote = c; out += c; continue; }
    if (c === "?") { out += `$${++n}`; continue; }
    out += c;
  }
  return out;
}

/**
 * O driver aceita null/number/string/boolean/Date. Booleanos continuam indo
 * como 0/1 porque as colunas seguem inteiras — a logica de dominio nao muda.
 */
function normalize(params: any[]): any[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    if (p instanceof Date) return p.toISOString();
    return p;
  });
}

// ------------------------------------------------------------- transacao
/**
 * Cliente da transacao em curso. Em serverless varias requisicoes dividem o
 * processo, entao a transacao nao pode viver em uma variavel de modulo: o
 * AsyncLocalStorage mantem cada uma isolada no seu proprio fluxo assincrono.
 */
const txStore = new AsyncLocalStorage<{ client: Client; depth: number }>();

async function query(sql: string, params: any[]): Promise<QueryResult> {
  await ensureSchema();
  const text = toPgPlaceholders(sql);
  const values = normalize(params);
  const ctx = txStore.getStore();
  if (ctx) return ctx.client.query(text, values);
  return pool().query(text, values);
}

/**
 * Transacao reentrante, preservando a semantica do `tx` original: o nivel
 * externo abre BEGIN/COMMIT e os internos usam SAVEPOINT, de modo que um
 * servico possa compor outro sem quebrar a atomicidade.
 */
export async function tx<T>(fn: () => Promise<T> | T): Promise<T> {
  await ensureSchema();
  const ctx = txStore.getStore();

  if (ctx) {
    const name = `sp_${ctx.depth}`;
    await ctx.client.query(`SAVEPOINT ${name}`);
    try {
      const result = await txStore.run({ client: ctx.client, depth: ctx.depth + 1 }, () => fn());
      await ctx.client.query(`RELEASE SAVEPOINT ${name}`);
      return result;
    } catch (err) {
      try { await ctx.client.query(`ROLLBACK TO SAVEPOINT ${name}`); } catch { /* best-effort */ }
      try { await ctx.client.query(`RELEASE SAVEPOINT ${name}`); } catch { /* best-effort */ }
      throw err;
    }
  }

  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    try {
      const result = await txStore.run({ client, depth: 1 }, () => fn());
      await client.query("COMMIT");
      return result;
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch { /* best-effort */ }
      throw err;
    }
  } finally {
    client.release();
  }
}

// --------------------------------------------------------------- queries
export async function all<T = Row>(sql: string, ...params: any[]): Promise<T[]> {
  return (await query(sql, params)).rows as T[];
}

export async function one<T = Row>(sql: string, ...params: any[]): Promise<T | undefined> {
  const { rows } = await query(sql, params);
  return rows.length === 0 ? undefined : (rows[0] as T);
}

export async function scalar<T = number>(sql: string, ...params: any[]): Promise<T | undefined> {
  const r = await one<Row>(sql, ...params);
  if (!r) return undefined;
  return r[Object.keys(r)[0]] as T;
}

export async function run(sql: string, ...params: any[]): Promise<void> {
  await query(sql, params);
}

/** Executa DDL/DML sem parametros (varias instrucoes sao aceitas). */
export async function exec(sql: string): Promise<void> {
  await ensureSchema();
  const ctx = txStore.getStore();
  if (ctx) await ctx.client.query(sql);
  else await pool().query(sql);
}

/** Insere a partir de um objeto, ignorando chaves undefined. */
export async function insert(table: string, data: Record<string, any>): Promise<void> {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  const cols = keys.join(", ");
  const marks = keys.map(() => "?").join(", ");
  await run(`INSERT INTO ${table} (${cols}) VALUES (${marks})`, ...keys.map((k) => data[k]));
}

export async function update(table: string, id: string, data: Record<string, any>): Promise<void> {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  await run(`UPDATE ${table} SET ${sets} WHERE id = ?`, ...keys.map((k) => data[k]), id);
}

/** Verdadeiro quando o processo aponta para o banco padrao da operacao. */
export function isOperationalDatabase(): boolean {
  return !process.env.WMS_TEST_DATABASE;
}
