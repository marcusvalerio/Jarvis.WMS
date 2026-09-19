/**
 * Gera src/db/schema.ts a partir de db/schema.postgres.sql.
 *
 * O DDL precisa estar embutido no bundle: em runtime serverless a pasta db/
 * nao acompanha a funcao, entao ler o arquivo do disco falharia — exatamente
 * o tipo de dependencia de filesystem que esta migracao elimina.
 */
import fs from "node:fs";
import path from "node:path";

const sql = fs.readFileSync(path.join(process.cwd(), "db", "schema.postgres.sql"), "utf8");
const out = `/* GERADO POR scripts/gen-schema.ts — NAO EDITAR A MAO.
 * Fonte: db/schema.postgres.sql
 * Embutido em modulo TypeScript para que o DDL viaje no bundle serverless,
 * sem depender do filesystem. */

export const SCHEMA_SQL = ${JSON.stringify(sql)};
`;
fs.writeFileSync(path.join(process.cwd(), "src", "db", "schema.ts"), out);
console.log(`src/db/schema.ts gerado (${sql.length} caracteres de DDL)`);
