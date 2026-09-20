import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { all, one, run } from "@/lib/db";
import { nowIso } from "@/lib/format";

const scrypt = promisify(scryptCb) as (
  senha: string | Buffer, salt: string | Buffer, len: number,
) => Promise<Buffer>;

export const SESSION_COOKIE = "wms_session";
/** Sessao longa: a operacao dura a apresentacao inteira. */
export const SESSION_DAYS = 30;

const KEYLEN = 64;

/**
 * Hash de senha com scrypt (node:crypto) — funcao de derivacao lenta,
 * com salt proprio por usuario. Formato: scrypt$<salt hex>$<hash hex>.
 * Nenhuma senha, em nenhum momento, e gravada em claro.
 */
export async function hashPassword(senha: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(senha, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Comparacao em tempo constante — nao vaza informacao pelo tempo de resposta. */
export async function verifyPassword(senha: string, guardado: string | null): Promise<boolean> {
  if (!guardado) return false;
  const [algo, saltHex, hashHex] = guardado.split("$");
  if (algo !== "scrypt" || !saltHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, "hex");
  const obtido = await scrypt(senha, Buffer.from(saltHex, "hex"), esperado.length);
  return esperado.length === obtido.length && timingSafeEqual(esperado, obtido);
}

// ------------------------------------------------------------------ perfil
export interface Profile {
  userId: string;
  name: string;
  email: string;
  role: string;
  jobTitle: string | null;
  sector: string | null;
  operatorId: string;
  badge: string;
  shift: string;
}

const PROFILE_SQL = `
  SELECT u.id AS user_id, u.name, u.email, u.role, u.job_title, u.sector,
         o.id AS operator_id, o.badge, o.shift
    FROM users u
    JOIN operators o ON o.user_id = u.id AND o.active = 1
   WHERE u.active = 1`;

function toProfile(r: any): Profile {
  return {
    userId: r.user_id, name: r.name, email: r.email, role: r.role,
    jobTitle: r.job_title, sector: r.sector,
    operatorId: r.operator_id, badge: r.badge, shift: r.shift,
  };
}

export async function listProfiles(): Promise<Profile[]> {
  return (await all<any>(`${PROFILE_SQL} ORDER BY u.name`)).map(toProfile);
}

// ------------------------------------------------------------------ sessao
/**
 * Autentica por e-mail e senha. Devolve o token de sessao, ou null.
 *
 * A mensagem de erro e unica para e-mail inexistente e senha errada: dizer
 * "este e-mail nao existe" entregaria a lista de usuarios a quem tentasse.
 * O usuario precisa ter um operador ativo vinculado — sem operador nao ha
 * como assinar as operacoes, entao nao ha como entrar.
 */
export async function signIn(email: string, senha: string): Promise<string | null> {
  const normalizado = email.trim().toLowerCase();
  const row = await one<any>(
    `${PROFILE_SQL} AND lower(u.email) = ?`, normalizado,
  );
  const guardado = row
    ? (await one<any>(`SELECT password_hash FROM users WHERE id = ?`, row.user_id))?.password_hash
    : null;

  // Mesmo sem usuario, gasta o tempo de uma verificacao: assim o tempo de
  // resposta nao revela se o e-mail existe.
  const confere = await verifyPassword(senha, guardado ?? "scrypt$00$00");
  if (!row || !confere) return null;

  const token = randomBytes(32).toString("base64url");
  const agora = nowIso();
  await run(
    `INSERT INTO user_sessions (token, user_id, created_at, expires_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?)`,
    token, row.user_id, agora,
    new Date(Date.now() + SESSION_DAYS * 864e5).toISOString(), agora,
  );
  return token;
}

/** Resolve o perfil a partir do token. Sessao expirada nao vale. */
export async function profileForToken(token: string | undefined): Promise<Profile | null> {
  if (!token) return null;
  const row = await one<any>(
    `${PROFILE_SQL} AND u.id = (
       SELECT s.user_id FROM user_sessions s
        WHERE s.token = ? AND s.expires_at > ?
     )`,
    token, nowIso(),
  );
  return row ? toProfile(row) : null;
}

export async function signOut(token: string | undefined): Promise<void> {
  if (!token) return;
  // Revogacao de verdade: a sessao deixa de existir no servidor.
  await run(`DELETE FROM user_sessions WHERE token = ?`, token);
}

/** Limpeza oportunista das sessoes vencidas. */
export async function purgeExpiredSessions(): Promise<void> {
  await run(`DELETE FROM user_sessions WHERE expires_at <= ?`, nowIso());
}
