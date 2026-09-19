/**
 * Aplica o esquema PostgreSQL em DATABASE_URL.
 *
 * O DDL e idempotente, entao rodar de novo e seguro: serve tanto para criar
 * o banco do zero quanto para aplicar tabelas novas em um banco existente.
 */
import { ensureSchema, closeDb } from "../src/lib/db.ts";

if (!process.env.DATABASE_URL) {
  console.error(
    "\nDATABASE_URL nao esta definida.\n" +
    "  local: postgresql://usuario@127.0.0.1:5432/jarvis_wms\n" +
    "  Neon : a string de conexao do projeto (pooled)\n",
  );
  process.exit(1);
}

await ensureSchema();
console.log("Esquema aplicado em", new URL(process.env.DATABASE_URL).host);
await closeDb();
