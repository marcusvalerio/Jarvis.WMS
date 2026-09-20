/**
 * Reinicia o cenario SIM-001.
 *
 *   npm run db:reset             # cenario cru; preserva o pacote de
 *                                # documentos da demonstracao se ele existia
 *   npm run db:reset -- --demo   # reinicia E prepara o pacote de documentos
 *   npm run db:reset -- --sem-demo
 */
import { resetSimulation, isSeeded, seed } from "../src/domain/services/simulation.ts";
import { prepareDemoDocuments } from "../src/domain/services/demo.ts";
import { closeDb } from "../src/lib/db.ts";

const args = process.argv.slice(2);
const comDemo = args.includes("--demo");
const semDemo = args.includes("--sem-demo") || args.includes("--no-demo");
const demoPack = comDemo ? true : semDemo ? false : undefined;

let result: unknown;
if (await isSeeded()) {
  result = await resetSimulation("CLI", { demoPack });
} else {
  result = { ...await seed("CLI"), demoPack: comDemo };
  if (comDemo) await prepareDemoDocuments();
}

console.log("Cenario carregado:", JSON.stringify(result, null, 2));
await closeDb();   // libera o pool para o processo encerrar
