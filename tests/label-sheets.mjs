/**
 * VALIDACAO DAS FOLHAS A4 DE ETIQUETAS.
 *
 * Nao basta conferir o HTML: o que vai para a grafica e o PDF. Este teste
 * mede as duas coisas —
 *
 *   no navegador  ... 6 etiquetas por folha, 2 colunas x 3 linhas, nenhuma
 *                     celula transbordando e nenhum codigo de barras maior
 *                     que a celula;
 *   no PDF final  ... tamanho A4, ceil(total / 6) paginas, sem pagina em
 *                     branco no fim.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { entrar } from "./login.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "wms-labels-"));

/** Conjuntos do cenario LOG122 e quantas etiquetas cada um tem. */
const FOLHAS = [
  { type: "volume-label-sheet", label: "Etiquetas de volume", etiquetas: 18 },
  { type: "inbound-volume-label-sheet", label: "Etiquetas de caixa recebida", etiquetas: 10 },
  { type: "pallet-label-sheet", label: "Etiquetas de palete", etiquetas: 6 },
  { type: "product-label-sheet", label: "Etiquetas de produto", etiquetas: 2 },
  { type: "location-label-sheet", label: "Etiquetas de localizacao", etiquetas: 2 },
];

const POR_FOLHA = 6;
const results = [];
let step = 0;
function log(ok, label, extra = "") {
  step++;
  results.push({ ok, label, extra });
  console.log(`${ok ? "ok  " : "FAIL"} ${String(step).padStart(2, "0")} · ${label}${extra ? ` — ${extra}` : ""}`);
}

/** Conta objetos /Type /Page (nao /Pages) no PDF. */
function paginasDoPdf(buf) {
  return (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}
/** Dimensoes da primeira MediaBox, em pontos. */
function mediaBox(buf) {
  const m = buf.toString("latin1").match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  return m ? { w: Number(m[3]) - Number(m[1]), h: Number(m[4]) - Number(m[2]) } : null;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.setDefaultTimeout(Number(process.env.E2E_TIMEOUT ?? 40000));

try {
  await entrar(page, BASE);
  log(true, "Autenticado para gerar as folhas");

  for (const folha of FOLHAS) {
    const url = `${BASE}/documents/${folha.type}/SIM-001`;
    await page.goto(url, { waitUntil: "networkidle" });
    if (new URL(page.url()).pathname !== new URL(url).pathname) {
      log(false, `${folha.label}: redirecionado`, page.url());
      continue;
    }
    await page.emulateMedia({ media: "print" });

    const medidas = await page.evaluate(() => {
      const folhas = [...document.querySelectorAll(".doc-sheet")];
      return folhas.map((f) => {
        const celulas = [...f.querySelectorAll(".avoid-break")];
        const caixaFolha = f.getBoundingClientRect();
        return {
          largura: caixaFolha.width,
          altura: f.scrollHeight,
          alturaVisivel: f.clientHeight,
          celulas: celulas.map((c) => {
            const box = c.getBoundingClientRect();
            const interno = c.firstElementChild;
            const svg = c.querySelector("svg");
            return {
              id: (c.querySelector("p")?.textContent ?? "").trim(),
              esq: box.left - caixaFolha.left,
              topo: box.top - caixaFolha.top,
              largura: box.width,
              altura: box.height,
              transbordaY: interno ? interno.scrollHeight - interno.clientHeight : 0,
              transbordaX: interno ? interno.scrollWidth - interno.clientWidth : 0,
              larguraBarcode: svg ? svg.getBoundingClientRect().width : 0,
              larguraUtil: interno ? interno.clientWidth : 0,
            };
          }),
        };
      });
    });

    const total = medidas.reduce((s, f) => s + f.celulas.length, 0);
    const paginasEsperadas = Math.ceil(folha.etiquetas / POR_FOLHA);

    // As etiquetas so existem depois que o pacote da demonstracao cria as
    // entidades. Sem ele a folha sai vazia, e o motivo precisa ficar claro
    // em vez de aparecer como "0 etiquetas".
    if (total === 0) {
      log(false, `${folha.label}: nenhuma etiqueta`,
        "prepare o cenario com `npm run docs:prepare` antes de validar as folhas");
      continue;
    }

    log(total === folha.etiquetas,
      `${folha.label}: ${total} etiqueta(s)`, `esperado ${folha.etiquetas}`);
    log(medidas.length === paginasEsperadas,
      `${folha.label}: ${medidas.length} folha(s) no HTML`, `ceil(${folha.etiquetas}/6) = ${paginasEsperadas}`);

    // Todas as folhas cheias menos, possivelmente, a ultima — e sem buraco.
    const cheias = medidas.slice(0, -1).every((f) => f.celulas.length === POR_FOLHA);
    const ultima = medidas[medidas.length - 1]?.celulas.length ?? 0;
    log(cheias && ultima > 0 && ultima <= POR_FOLHA,
      `${folha.label}: folhas preenchidas sem buraco`,
      `ultima com ${ultima}`);

    // Grade 2 x 3: no maximo duas posicoes horizontais e tres verticais.
    const colunas = new Set();
    const linhas = new Set();
    for (const f of medidas) {
      for (const c of f.celulas) {
        colunas.add(Math.round(c.esq));
        linhas.add(Math.round(c.topo));
      }
    }
    log(colunas.size === Math.min(2, folha.etiquetas) || colunas.size <= 2,
      `${folha.label}: ${colunas.size} coluna(s)`, "esperado ate 2");
    log(linhas.size <= 3, `${folha.label}: ${linhas.size} linha(s)`, "esperado ate 3");

    // Nada cortado: nem conteudo dentro da celula, nem celula fora da folha.
    const cortadas = medidas.flatMap((f) =>
      f.celulas.filter((c) => c.transbordaY > 1 || c.transbordaX > 1));
    log(cortadas.length === 0, `${folha.label}: nenhum conteudo cortado`,
      cortadas.map((c) => `${c.id} (+${Math.round(c.transbordaY)}px)`).join(", "));

    const barrasLargas = medidas.flatMap((f) =>
      f.celulas.filter((c) => c.larguraBarcode > c.larguraUtil));
    log(barrasLargas.length === 0, `${folha.label}: codigo de barras dentro da celula`,
      barrasLargas.map((c) => c.id).join(", "));

    const transbordo = medidas.filter((f) => f.altura - f.alturaVisivel > 1);
    log(transbordo.length === 0, `${folha.label}: nenhuma folha transborda a pagina`,
      `${transbordo.length} de ${medidas.length}`);

    // ------------------------------------------------ o PDF de verdade
    const arquivo = path.join(OUT, `${folha.type}.pdf`);
    await page.pdf({
      path: arquivo, format: "A4", printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    const buf = fs.readFileSync(arquivo);
    const paginas = paginasDoPdf(buf);
    const box = mediaBox(buf);
    log(paginas === paginasEsperadas, `${folha.label}: PDF com ${paginas} pagina(s)`,
      `esperado ${paginasEsperadas}`);
    // A4 = 595,28 x 841,89 pt; o Chromium arredonda para 595,92 x 842,88.
    const a4 = box && Math.abs(box.w - 595.28) < 2 && Math.abs(box.h - 841.89) < 2;
    log(!!a4, `${folha.label}: PDF em A4 retrato`,
      box ? `${box.w.toFixed(1)} x ${box.h.toFixed(1)} pt` : "MediaBox ausente");

    await page.emulateMedia({ media: null });
  }
} catch (err) {
  log(false, "ERRO NA VALIDACAO", String(err).slice(0, 300));
}

console.log("\n" + "=".repeat(60));
const fails = results.filter((r) => !r.ok);
console.log(`${results.length - fails.length}/${results.length} verificacoes OK`);
if (fails.length) console.log("FALHAS:\n" + fails.map((f) => ` · ${f.label} ${f.extra}`).join("\n"));
console.log(`PDFs de validacao em ${OUT}`);

await browser.close();
process.exit(fails.length ? 1 : 0);
