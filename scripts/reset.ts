import { resetSimulation, isSeeded, seed } from "../src/domain/services/simulation.ts";

const result = isSeeded() ? resetSimulation("CLI") : seed("CLI");
console.log("Cenario carregado:", JSON.stringify(result, null, 2));
