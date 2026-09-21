/**
 * PACOTE MESTRE DA DEMONSTRACAO — UM UNICO PDF PARA IMPRESSAO.
 *
 *   npm run docs:demo
 *
 * Uma acao so, para o dia da apresentacao. A rotina:
 *
 *   1. garante o cenario SIM-001 carregado (ensureSeeded);
 *   2. garante o pacote de documentos preparado (ensureDemoDocuments —
 *      GERAR DOCUMENTO NAO E EXECUTAR A OPERACAO, ver src/domain/services/demo.ts);
 *   3. sobe o sistema sozinha se ele nao estiver no ar;
 *   4. renderiza, pela mesma tela que qualquer usuario usaria para
 *      imprimir, cada documento do catalogo (src/domain/documents.ts) na
 *      ordem fisica de uso definida em src/domain/services/demo-pack.ts;
 *   5. junta tudo — capa, mapa da simulacao, divisorias, documentos e
 *      indice final — em JARVIS_WMS_LOG122_DEMO_PACK.pdf, mantendo tambem
 *      cada PDF individual;
 *   6. valida o resultado (A4, sem duplicata, sem orfao) e imprime o
 *      relatorio final.
 *
 *   npm run docs:demo -- --sem-servidor   # nao tenta subir "npm run dev"
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { PDFDocument } from "pdf-lib";

import { ensureSeeded } from "../src/domain/services/simulation.ts";
import { ensureDemoDocuments, demoPackReport, type DemoPackReport } from "../src/domain/services/demo.ts";
import { buildDemoPackManifest } from "../src/domain/services/demo-pack.ts";
import { docType } from "../src/domain/documents.ts";
import { printDemoPackReport } from "./demo-report.ts";
import { closeDb } from "../src/lib/db.ts";
import { SCENARIO_ID, WAREHOUSE, PRODUCTS, SALES_ORDERS, ROUTES, BOX } from "../src/seed/scenario.ts";

const BASE = process.env.WMS_URL ?? "http://localhost:3000";
const OUT_DIR = process.env.WMS_DEMO_DIR ?? path.join(process.cwd(), "generated", "demo");
const INDIVIDUAL_DIR = path.join(OUT_DIR, "individual");
const MASTER_PDF = path.join(OUT_DIR, "JARVIS_WMS_LOG122_DEMO_PACK.pdf");
const INDEX_PDF = path.join(OUT_DIR, "JARVIS_WMS_LOG122_DOCUMENT_INDEX.pdf");
const INDEX_JSON = path.join(OUT_DIR, "pack-index.json");

// pt (1/72"): A4 = 210 x 297 mm. Tolerancia cobre arredondamento do motor de impressao.
const A4_PT = { w: 595.28, h: 841.89 };
const A4_TOLERANCE = 3;

const args = process.argv.slice(2);
const semServidor = args.includes("--sem-servidor");

function slug(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

interface RenderTarget {
  fileBase: string;
  url: string;
  kind: "structural" | "document";
  index?: { docType: string; label: string; entity: string; entityId: string; status: string };
}

/** Ordem fisica completa: capa, mapa, [divisoria + documentos] por secao, indice. */
async function buildTargets(): Promise<RenderTarget[]> {
  const sections = await buildDemoPackManifest();
  const targets: RenderTarget[] = [
    { fileBase: "00-capa", url: `${BASE}/documents/pack/cover`, kind: "structural" },
    { fileBase: "01-mapa-da-simulacao", url: `${BASE}/documents/pack/summary`, kind: "structural" },
  ];

  for (const section of sections) {
    targets.push({
      fileBase: `${section.code}-00-divisoria-${slug(section.title)}`,
      url: `${BASE}/documents/pack/divider/${section.code}`,
      kind: "structural",
    });
    section.entries.forEach((entry, i) => {
      const def = docType(entry.docType);
      if (!def) throw new Error(`Tipo de documento sem catalogo: ${entry.docType}`);
      targets.push({
        fileBase: `${section.code}-${String(i + 1).padStart(2, "0")}-${slug(def.label)}-${slug(entry.id)}`,
        url: `${BASE}/documents/${entry.docType}/${encodeURIComponent(entry.id)}`,
        kind: "document",
        index: {
          docType: entry.docType, label: `${def.label} · ${entry.label}`, entity: entry.entity,
          entityId: entry.id, status: entry.status ?? "—",
        },
      });
    });
  }

  targets.push({ fileBase: "15-indice", url: `${BASE}/documents/pack/index`, kind: "structural" });

  const vistos = new Set<string>();
  for (const t of targets) {
    if (vistos.has(t.fileBase)) throw new Error(`Documento duplicado no manifesto do pacote: ${t.fileBase}`);
    vistos.add(t.fileBase);
  }
  return targets;
}

// ------------------------------------------------------------------ servidor

let processoSubido: ChildProcess | null = null;

async function online(tentativas = 10): Promise<boolean> {
  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(`${BASE}/documents`, { signal: AbortSignal.timeout(20000) });
      if (res.ok) return true;
    } catch { /* tenta de novo */ }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

async function garantirServidor() {
  if (await online(3)) return;
  if (semServidor) {
    throw new Error(`Servidor inacessivel em ${BASE} e --sem-servidor foi passado.`);
  }
  console.log(`\nServidor nao encontrado em ${BASE} — subindo "npm run dev"...\n`);
  processoSubido = spawn("npm", ["run", "dev"], { stdio: "ignore", detached: true, env: process.env });
  processoSubido.unref();
  if (!(await online(20))) {
    throw new Error(`O servidor nao respondeu em ${BASE} apos subir "npm run dev".`);
  }
}

function encerrarServidorSubido() {
  if (processoSubido?.pid) {
    try { process.kill(-processoSubido.pid, "SIGTERM"); } catch { /* ja encerrado */ }
  }
}

// -------------------------------------------------------------- renderizacao

async function capturar(page: import("playwright").Page, url: string): Promise<Buffer> {
  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 40000 });
  if (!response || response.status() >= 400) throw new Error(`HTTP ${response?.status()}`);
  // 200 nao prova renderizacao: sessao perdida redireciona para /login DEPOIS
  // da resposta. Confere a URL final e a folha antes de imprimir.
  if (new URL(page.url()).pathname !== new URL(url).pathname) {
    throw new Error(`redirecionado para ${new URL(page.url()).pathname}`);
  }
  const folhas = await page.locator(".doc-sheet").count();
  if (folhas === 0) throw new Error("nenhuma folha renderizada na pagina");
  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({
    format: "A4", printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });
  return pdf;
}

// ------------------------------------------------------------------- main

async function main() {
  await ensureSeeded();
  const prep = await ensureDemoDocuments();
  printDemoPackReport(prep);
  if (prep.checks.some((c) => !c.ok)) {
    console.error("\nA preparacao do pacote acusou falha — corrija antes de montar o PDF mestre.\n");
    process.exitCode = 1;
    await closeDb();
    return;
  }

  try {
    await garantirServidor();
  } catch (err) {
    console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
    await closeDb();
    return;
  }

  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error("\nPlaywright nao esta instalado. Instale com `npm i -D playwright`.\n");
    encerrarServidorSubido();
    process.exitCode = 1;
    await closeDb();
    return;
  }

  fs.mkdirSync(INDIVIDUAL_DIR, { recursive: true });
  const targets = await buildTargets();

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();

  const { entrar } = await import("../tests/login.mjs");
  try {
    await entrar(page, BASE);
  } catch (err) {
    console.error(`\nNao foi possivel autenticar em ${BASE}.\n${err instanceof Error ? err.message : String(err)}\n`);
    await browser.close();
    encerrarServidorSubido();
    process.exitCode = 1;
    await closeDb();
    return;
  }

  console.log(`\nRenderizando ${targets.length} pagina(s) do pacote mestre...\n`);

  const buffers = new Map<string, Buffer>();
  const indexRows: { docType: string; label: string; entity: string; entityId: string; status: string; pages: number }[] = [];
  const failures: string[] = [];

  // O indice (15-indice) depende do JSON escrito ao final do loop —
  // renderiza tudo o mais primeiro, o indice por ultimo.
  for (const t of targets) {
    if (t.fileBase === "15-indice") continue;
    try {
      const buf = await capturar(page, t.url);
      buffers.set(t.fileBase, buf);
      fs.writeFileSync(path.join(INDIVIDUAL_DIR, `${t.fileBase}.pdf`), buf);
      if (t.kind === "document" && t.index) {
        const doc = await PDFDocument.load(buf);
        indexRows.push({ ...t.index, pages: doc.getPageCount() });
      }
      console.log(`  OK     ${t.fileBase}`);
    } catch (err) {
      failures.push(`${t.fileBase}: ${err instanceof Error ? err.message : String(err)}`);
      console.log(`  FALHA  ${t.fileBase} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const linhasIndice = indexRows.map(({ label, entity, entityId, status, pages }) => (
    { label, entity, entityId, status, pages }
  ));
  fs.writeFileSync(INDEX_JSON, JSON.stringify(linhasIndice, null, 2));

  const indice = targets.find((t) => t.fileBase === "15-indice")!;
  try {
    const buf = await capturar(page, indice.url);
    buffers.set(indice.fileBase, buf);
    fs.writeFileSync(path.join(INDIVIDUAL_DIR, `${indice.fileBase}.pdf`), buf);
    fs.writeFileSync(INDEX_PDF, buf);
    console.log(`  OK     ${indice.fileBase}`);
  } catch (err) {
    failures.push(`${indice.fileBase}: ${err instanceof Error ? err.message : String(err)}`);
    console.log(`  FALHA  ${indice.fileBase} — ${err instanceof Error ? err.message : String(err)}`);
  }

  await browser.close();
  encerrarServidorSubido();

  // ---------------------------------------------------------------- merge
  const master = await PDFDocument.create();
  const foraDeA4: string[] = [];
  for (const t of targets) {
    const buf = buffers.get(t.fileBase);
    if (!buf) continue; // falhou acima, ja reportado
    const src = await PDFDocument.load(buf);
    const paginas = await master.copyPages(src, src.getPageIndices());
    for (const p of paginas) {
      const { width, height } = p.getSize();
      if (Math.abs(width - A4_PT.w) > A4_TOLERANCE || Math.abs(height - A4_PT.h) > A4_TOLERANCE) {
        foraDeA4.push(`${t.fileBase} (${Math.round(width)}×${Math.round(height)}pt)`);
      }
      master.addPage(p);
    }
  }
  fs.writeFileSync(MASTER_PDF, await master.save());

  // ------------------------------------------------------------ validacao
  const relatorio = await demoPackReport();
  // A chave e (tipo de documento, id): o mesmo pedido tem varios documentos
  // legitimos (pedido de venda, packing list, comprovante de expedicao...),
  // entao "entidade repetida" nao e duplicata — "mesmo documento repetido" e.
  const chavesUnicas = new Set(indexRows.map((r) => `${r.docType}:${r.entityId}`));
  const duplicados = indexRows.length - chavesUnicas.size;

  imprimirRelatorioFinal({
    prep, indexRows, masterPages: master.getPageCount(),
    failures, foraDeA4, duplicados, relatorio,
  });

  const semFalhas = failures.length === 0 && foraDeA4.length === 0 && duplicados === 0
    && relatorio.checks.every((c) => c.ok);
  process.exitCode = semFalhas ? 0 : 1;

  await closeDb();
}

// ---------------------------------------------------------------- relatorio

function imprimirRelatorioFinal(args: {
  prep: DemoPackReport;
  indexRows: { label: string; entity: string; entityId: string; status: string; pages: number }[];
  masterPages: number;
  failures: string[];
  foraDeA4: string[];
  duplicados: number;
  relatorio: DemoPackReport;
}) {
  const { prep, indexRows, masterPages, failures, foraDeA4, duplicados, relatorio } = args;
  const linha = "=".repeat(56);
  const fina = "-".repeat(56);

  console.log(`\n${linha}`);
  console.log("JARVIS.WMS — DEMO DOCUMENT PACK");
  console.log(linha);
  console.log(`\nCenario: ${SCENARIO_ID}`);
  console.log(`Empresa: ${WAREHOUSE.name}`);
  console.log(`Produtos: ${PRODUCTS.length}`);
  console.log(`\nCaixas de entrada: ${BOX.inboundBoxes}`);
  console.log(`Caixas de saida: ${BOX.outboundBoxes}`);
  console.log(`\nPedidos de venda: ${SALES_ORDERS.length}`);
  console.log(`Notas fiscais de saida: ${SALES_ORDERS.length}`);
  console.log(`Rotas: ${ROUTES.length}`);
  console.log(`Romaneios: ${ROUTES.length}`);
  console.log(`\n${fina}\n`);

  console.log("Documentos gerados:");
  const CHECKLIST: [string, string][] = [
    ["purchase-order", "Pedidos de compra"],
    ["invoice", "Nota fiscal de entrada"],
    ["inbound-order", "Ordens de recebimento"],
    ["weighing", "Comprovantes de pesagem"],
    ["receiving-checklist", "Checklists de recebimento"],
    ["pallet-label-sheet", "Etiquetas de palete"],
    ["location-label-sheet", "Etiquetas de localizacao"],
    ["inbound-volume-label-sheet", "Etiquetas de caixa recebida"],
    ["storage-order", "Ordens de armazenagem"],
    ["sales-order", "Pedidos de venda"],
    ["picklist", "Listas de separacao"],
    ["packing-list", "Packing lists"],
    ["volume-label-sheet", "Etiquetas de volume (expedicao)"],
    ["shipping-check", "Conferencias de expedicao"],
    ["manifest", "Romaneios"],
    ["transport", "Documentos de transporte"],
    ["loading-checklist", "Checklists de carregamento"],
    ["shipping-receipt", "Comprovantes de expedicao"],
  ];
  for (const [tipo, rotulo] of CHECKLIST) {
    const ok = indexRows.some((r) => r.label.startsWith(docType(tipo)?.label ?? "\0"));
    console.log(`  [${ok ? "OK" : "--"}] ${rotulo}`);
  }

  console.log(`\n${fina}\n`);
  console.log("PDF MESTRE");
  console.log(`\nPaginas: ${masterPages}`);
  console.log(`Documentos: ${indexRows.length}`);
  console.log(`\nFaltando: ${failures.length}`);
  console.log(`Duplicados: ${duplicados}`);
  console.log(`Fora do padrao A4: ${foraDeA4.length}`);
  console.log(`Verificacoes de rastreabilidade com falha: ${relatorio.checks.filter((c) => !c.ok).length}`);

  if (foraDeA4.length) {
    console.log("\nPaginas fora do padrao A4:");
    for (const f of foraDeA4) console.log(`  · ${f}`);
  }

  const tudoOk = failures.length === 0 && foraDeA4.length === 0 && duplicados === 0
    && relatorio.checks.every((c) => c.ok) && prep.checks.every((c) => c.ok);

  console.log(`\n${linha}`);
  console.log(tudoOk ? "DEMO PACK PRONTO" : "DEMO PACK COM PENDENCIAS — ver falhas acima");
  console.log(`${linha}\n`);
  console.log(`Master:      ${MASTER_PDF}`);
  console.log(`Indice:      ${INDEX_PDF}`);
  console.log(`Individuais: ${INDIVIDUAL_DIR}\n`);
}

await main();
