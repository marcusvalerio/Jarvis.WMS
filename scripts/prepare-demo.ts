/**
 * PREPARA O PACOTE DE DOCUMENTOS DA DEMONSTRACAO.
 *
 * Cria as entidades reais em estado planejado para que TODOS os documentos
 * possam ser impressos antes da apresentacao fisica. Nao executa a operacao:
 * nao baixa estoque, nao conclui recebimento, nao embala, nao carrega e nao
 * expede. Idempotente — rodar de novo nao duplica nada.
 *
 *   npm run docs:prepare
 */
import { ensureSeeded } from "../src/domain/services/simulation.ts";
import { prepareDemoDocuments } from "../src/domain/services/demo.ts";
import { printDemoPackReport } from "./demo-report.ts";
import { closeDb } from "../src/lib/db.ts";

await ensureSeeded();
const relatorio = await prepareDemoDocuments();
printDemoPackReport(relatorio);
await closeDb();
process.exitCode = relatorio.checks.every((c) => c.ok) ? 0 : 1;
