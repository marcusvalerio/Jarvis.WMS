import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeValues,
  encodeWidths,
  moduleCount,
  toSvg,
  isEncodable,
  Code128Error,
} from "../src/lib/barcode/code128.ts";

await test("estrutura do simbolo: start B, dados, checksum, stop", () => {
  const v = encodeValues("A");
  // 'A' = 65 -> valor 33
  assert.deepEqual(v, [104, 33, (104 + 33 * 1) % 103, 106]);
});

await test("checksum conhecido para PLT-000001", () => {
  const v = encodeValues("PLT-000001");
  const data = [..."PLT-000001"].map((c) => c.charCodeAt(0) - 32);
  let sum = 104;
  data.forEach((d, i) => (sum += d * (i + 1)));
  assert.equal(v[v.length - 2], sum % 103);
  assert.equal(v[0], 104);
  assert.equal(v[v.length - 1], 106);
});

await test("cada caractere ocupa 11 modulos e o stop 13", () => {
  const w = encodeWidths("END-A020301");
  const total = w.reduce((a, b) => a + b, 0);
  const chars = "END-A020301".length;
  // start + dados + check = (chars + 2) * 11 ; stop = 13
  assert.equal(total, (chars + 2) * 11 + 13);
});

await test("simbolo comeca e termina com barra", () => {
  const w = encodeWidths("VOL-000001");
  assert.equal(w.length % 2, 1, "numero impar de elementos -> termina em barra");
});

await test("rejeita caracteres fora do Code 128 B", () => {
  assert.equal(isEncodable("PED-000125"), true);
  assert.equal(isEncodable("PAÇOCA"), false);
  assert.throws(() => encodeValues("PAÇOCA"), Code128Error);
  assert.throws(() => encodeValues(""), Code128Error);
});

await test("svg contem barras e o texto legivel", () => {
  const svg = toSvg("ROM-000018");
  assert.match(svg, /^<svg /);
  assert.ok(svg.includes("ROM-000018"));
  assert.ok((svg.match(/<rect/g) ?? []).length > 10);
});

/**
 * DECODIFICACAO DE VOLTA, a partir da GEOMETRIA do SVG.
 *
 * O teste acima prova que o simbolo tem a estrutura certa; este prova que
 * ele volta a ser a string original quando lido barra a barra — que e o
 * que o leitor fisico faz. Importa especialmente na folha A4, onde o
 * modulo estreita para 1,8 px para caber na celula: se essa reducao
 * corrompesse a proporcao entre barras, a etiqueta impressa nao seria
 * decodificavel e so se descobriria com a coletora na mao.
 */
const PATTERNS_REF: string[] = (() => {
  // Reconstroi a tabela a partir do proprio codificador, sem copia-la:
  // cada valor 0..102 e codificado sozinho e a posicao 1 do simbolo e o
  // seu padrao. Assim o decodificador nao herda um erro da tabela.
  const tabela: string[] = [];
  // 0..95 sao os caracteres imprimiveis do subconjunto B (ASCII 32..127).
  // De 96 em diante vem FNC, SHIFT e troca de conjunto, que nao aparecem
  // em identificador nenhum do sistema — e nao sao codificaveis sozinhos.
  for (let v = 0; v <= 95; v++) {
    const ch = String.fromCharCode(v + 32);
    const w = encodeWidths(ch);
    tabela[v] = w.slice(6, 12).join("");   // pula o START B (6 elementos)
  }
  return tabela;
})();

/** Padrao do START B, lido do proprio codificador (primeiros 6 elementos). */
const START_B_REF = encodeWidths("A").slice(0, 6).join("");

/** Le as barras do SVG e devolve a sequencia de larguras em modulos. */
function widthsFromSvg(svg: string, moduleWidth: number): number[] {
  const rects = [...svg.matchAll(/<rect x="([\d.]+)" y="0" width="([\d.]+)"/g)]
    .map((m) => ({ x: Number(m[1]), w: Number(m[2]) }));
  const widths: number[] = [];
  let cursor = rects[0]!.x;
  for (const r of rects) {
    const espaco = Math.round((r.x - cursor) / moduleWidth);
    if (espaco > 0) widths.push(espaco);
    widths.push(Math.round(r.w / moduleWidth));
    cursor = r.x + r.w;
  }
  return widths;
}

function decode(svg: string, moduleWidth: number): string {
  const widths = widthsFromSvg(svg, moduleWidth);
  // STOP tem 13 modulos em 7 elementos; o resto vem de 6 em 6.
  assert.equal(widths.slice(0, 6).join(""), START_B_REF, "simbolo nao comeca em START B");
  const corpo = widths.slice(6, widths.length - 7);
  const simbolos: number[] = [];
  for (let i = 0; i < corpo.length; i += 6) {
    const padrao = corpo.slice(i, i + 6).join("");
    const valor = PATTERNS_REF.indexOf(padrao);
    if (valor < 0) throw new Error(`padrao desconhecido: ${padrao}`);
    simbolos.push(valor);
  }
  const dados = simbolos.slice(0, -1);
  const checksum = simbolos[simbolos.length - 1]!;
  const esperado = dados.reduce((s, v, i) => s + v * (i + 1), 104) % 103;
  assert.equal(checksum, esperado, "checksum invalido");
  return dados.map((v) => String.fromCharCode(v + 32)).join("");
}

await test("o simbolo renderizado volta a ser o identificador ao ser lido", () => {
  for (const id of ["VOL-000011", "PLT-000001", "SKU-001", "PED-000125", "END-A020301"]) {
    // 2.1 = etiqueta 100 x 150 mm; 1.8 = celula da folha A4.
    for (const moduleWidth of [2.1, 1.8]) {
      const svg = toSvg(id, { moduleWidth, height: 40, fontSize: 8, quietZone: 8 });
      assert.equal(decode(svg, moduleWidth), id, `${id} @ ${moduleWidth}px/modulo`);
    }
  }
});

await test("a folha A4 comporta o simbolo dentro da celula de 93 mm", () => {
  // Celula 93 mm - 2 x 3 mm de recuo - borda ≈ 86,5 mm uteis.
  // Largura do simbolo = (modulos + 2 x quiet zone) x moduleWidth px,
  // convertida a 96 dpi. A margem do <span> do Barcode soma 3,2 mm.
  const MODULE_PX = 1.8, QUIET = 8, PADDING_MM = 3.2, UTIL_MM = 86.5;
  for (const id of ["VOL-000011", "PLT-000001", "SKU-001"]) {
    const px = (moduleCount(id) + QUIET * 2) * MODULE_PX;
    const mm = (px / 96) * 25.4 + PADDING_MM;
    assert.ok(mm <= UTIL_MM, `${id}: simbolo com ${mm.toFixed(1)} mm nao cabe em ${UTIL_MM} mm`);
    // E precisa continuar largo o bastante para ser lido: 0,25 mm e o
    // modulo minimo usual de um leitor Code 128.
    assert.ok((MODULE_PX / 96) * 25.4 >= 0.25, "modulo estreito demais para leitura");
  }
});
