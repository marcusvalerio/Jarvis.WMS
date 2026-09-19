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
  ensureSeeded();

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

  const targets = DOC_TYPES
    .filter((d) => !groupFilter || d.group === groupFilter)
    .filter((d) => !typeFilter || d.type === typeFilter)
    .flatMap((d) => d.list().map((item) => ({ def: d, item })));

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

  let done = 0;
  const failures: string[] = [];

  for (const { def, item } of targets) {
    const dir = path.join(OUT, slug(GROUP_LABEL[def.group]), slug(def.label));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${slug(item.id)}.pdf`);
    const url = `${BASE}/documents/${def.type}/${encodeURIComponent(item.id)}`;

    try {
      const response = await page.goto(url, { waitUntil: "networkidle", timeout: 40000 });
      if (!response || response.status() >= 400) throw new Error(`HTTP ${response?.status()}`);
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
      process.stdout.write(`  ${String(done).padStart(3)}/${targets.length}  ${def.label} · ${item.id}\n`);
    } catch (err) {
      failures.push(`${def.label} ${item.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await browser.close();

  console.log(`\n${done} documento(s) gerado(s) em ${OUT}`);
  if (failures.length) {
    console.log(`\n${failures.length} falha(s):`);
    for (const f of failures) console.log(`  · ${f}`);
    process.exitCode = 1;
  } else {
    console.log("\nTodos os documentos do cenario estao prontos para impressao.");
  }
}

await main();
