/**
 * PRE-GERACAO DOCUMENTAL
 *
 * Renderiza TODOS os documentos do cenario em PDF, prontos para impressao,
 * a partir das mesmas entidades que o WMS usa em operacao. Como os
 * identificadores sao deterministicos, os PDFs gerados antes da
 * apresentacao continuam validos apos um reinicio do cenario.
 *
 *   npm run docs:pdf                    # tudo
 *   npm run docs:pdf -- --group=saida   # apenas um grupo
 *   npm run docs:pdf -- --type=invoice  # apenas um tipo
 */
import fs from "node:fs";
import path from "node:path";
import { DOC_TYPES, GROUP_LABEL } from "../src/domain/documents.ts";
import { ensureSeeded } from "../src/domain/services/simulation.ts";
import { ensureDemoDocuments, demoPackReport } from "../src/domain/services/demo.ts";
import { printDemoPackReport } from "./demo-report.ts";

const BASE = process.env.WMS_URL ?? "http://localhost:3000";
const OUT = process.env.WMS_DOCS_DIR ?? path.join(process.cwd(), "generated-docs");

const args = process.argv.slice(2);
const only = (flag: string) => args.find((a) => a.startsWith(`--${flag}=`))?.split("=")[1];
const groupFilter = only("group");
const typeFilter = only("type");

function slug(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

async function main() {
  await ensureSeeded();

  // Prepara o pacote da demonstracao ANTES de sair listando documentos.
  // Sem isso a maior parte do cenario ainda nao tem entidade: etiquetas de
  // caixa, picklists, romaneios e checklists so nasceriam durante a
  // operacao — quando ja e tarde para imprimir. Nada disso executa a
  // operacao; apenas cria as entidades que os documentos exibem.
  if (!args.includes("--sem-preparo")) await ensureDemoDocuments();

  // Confirma que o servidor esta no ar. A primeira compilacao do Next pode
  // demorar, entao vale insistir por alguns segundos antes de desistir.
  let online = false;
  for (let attempt = 0; attempt < 10 && !online; attempt++) {
    try {
      const res = await fetch(`${BASE}/documents`, { signal: AbortSignal.timeout(20000) });
      online = res.ok;
    } catch { /* tenta de novo */ }
    if (!online) await new Promise((r) => setTimeout(r, 3000));
  }
  if (!online) {
    console.error(
      `\nNao foi possivel acessar ${BASE}.\n` +
      `Inicie o sistema antes de gerar os PDFs:\n\n    npm run dev\n\n` +
      `Em outro terminal:\n\n    npm run docs:pdf\n`,
    );
    process.exit(1);
  }


  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error(
      "\nPlaywright nao esta instalado.\n" +
      "Instale com `npm i -D playwright` e `npx playwright install chromium`,\n" +
      "ou gere os PDFs individualmente pelo botao Imprimir de cada documento.\n",
    );
    process.exit(1);
  }

  const targets = (await Promise.all(
    DOC_TYPES
      .filter((d) => !groupFilter || d.group === groupFilter)
      .filter((d) => !typeFilter || d.type === typeFilter)
      .map(async (d) => (await d.list()).map((item) => ({ def: d, item }))),
  )).flat();

  if (targets.length === 0) {
    console.log("Nenhum documento corresponde ao filtro informado.");
    return;
  }

  fs.mkdirSync(OUT, { recursive: true });
  console.log(`\nGerando ${targets.length} documento(s) em ${OUT}\n`);

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const page = await browser.newPage();

  // Desde que o sistema passou a exigir sessao, abrir um documento sem
  // estar autenticado devolve 200 e SO DEPOIS redireciona para /login pelo
  // roteador. O gerador precisa entrar antes — e conferir folha a folha
  // que o que saiu e o documento, nao a tela de login (ver abaixo).
  const { entrar } = await import("../tests/login.mjs");
  try {
    await entrar(page, BASE);
  } catch (err) {
    console.error(
      `\nNao foi possivel autenticar em ${BASE}.\n` +
      `Defina WMS_TEST_EMAIL e WMS_TEST_PASSWORD se as credenciais nao forem as padrao.\n` +
      `${err instanceof Error ? err.message : String(err)}\n`,
    );
    await browser.close();
    process.exit(1);
  }

  let done = 0;
  const failures: string[] = [];
  const gerados: string[] = [];

  for (const { def, item } of targets) {
    const dir = path.join(OUT, slug(GROUP_LABEL[def.group]), slug(def.label));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${slug(item.id)}.pdf`);
    const url = `${BASE}/documents/${def.type}/${encodeURIComponent(item.id)}`;

    try {
      const response = await page.goto(url, { waitUntil: "networkidle", timeout: 40000 });
      if (!response || response.status() >= 400) throw new Error(`HTTP ${response?.status()}`);

      // O status 200 nao prova que o documento renderizou: uma sessao
      // perdida redireciona para /login DEPOIS da resposta, e o PDF sairia
      // com a tela de login em vez da folha. Confere a URL final e a
      // presenca da folha antes de imprimir.
      if (new URL(page.url()).pathname !== new URL(url).pathname) {
        throw new Error(`redirecionado para ${new URL(page.url()).pathname}`);
      }
      const folhas = await page.locator(".doc-sheet").count();
      if (folhas === 0) throw new Error("nenhuma folha renderizada na pagina");

      await page.emulateMedia({ media: "print" });
      await page.pdf({
        path: file,
        format: def.format === "ETIQUETA" ? undefined : "A4",
        width: def.format === "ETIQUETA" ? "100mm" : undefined,
        height: def.format === "ETIQUETA" ? "150mm" : undefined,
        printBackground: true,
        // Margem zero: o espacamento do documento vem do padding da folha.
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      done++;
      gerados.push(file);
      process.stdout.write(`  ${String(done).padStart(3)}/${targets.length}  ${def.label} · ${item.id}\n`);
    } catch (err) {
      failures.push(`${def.label} ${item.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await browser.close();

  // Limpa PDFs de execucoes antigas. Um cenario que mudou (SKU removido,
  // romaneio renumerado) deixaria folhas obsoletas na pasta, e quem for
  // imprimir nao tem como saber quais. So roda quando nao ha filtro: com
  // `--group` ou `--type` a pasta contem, de proposito, documentos que esta
  // execucao nao gerou.
  if (!groupFilter && !typeFilter) {
    const mantidos = new Set(gerados);
    let removidos = 0;
    for (const grupo of fs.readdirSync(OUT, { withFileTypes: true })) {
      if (!grupo.isDirectory()) continue;
      const gDir = path.join(OUT, grupo.name);
      for (const tipo of fs.readdirSync(gDir, { withFileTypes: true })) {
        if (!tipo.isDirectory()) continue;
        const tDir = path.join(gDir, tipo.name);
        for (const arquivo of fs.readdirSync(tDir)) {
          const alvo = path.join(tDir, arquivo);
          if (arquivo.endsWith(".pdf") && !mantidos.has(alvo)) {
            fs.unlinkSync(alvo);
            removidos++;
          }
        }
      }
    }
    if (removidos > 0) console.log(`\n${removidos} PDF(s) de execucoes anteriores removido(s).`);
  }

  console.log(`\n${done} documento(s) gerado(s) em ${OUT}`);
  if (failures.length) {
    console.log(`\n${failures.length} falha(s):`);
    for (const f of failures) console.log(`  · ${f}`);
    process.exitCode = 1;
  } else {
    console.log("\nTodos os documentos do cenario estao prontos para impressao.");
  }

  // Relatorio de validacao: confere os numeros do cenario LOG122 e,
  // sobretudo, se algum documento do pacote ficou sem entidade no banco.
  const relatorio = await demoPackReport();
  printDemoPackReport(relatorio);
  if (relatorio.checks.some((c) => !c.ok)) process.exitCode = 1;
}

await main();
