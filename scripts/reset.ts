import { resetSimulation, isSeeded, seed } from "../src/domain/services/simulation.ts";
import { closeDb } from "../src/lib/db.ts";

const result = await isSeeded() ? await resetSimulation("CLI") : await seed("CLI");
console.log("Cenario carregado:", JSON.stringify(result, null, 2));
await closeDb();   // libera o pool para o processo encerrar
