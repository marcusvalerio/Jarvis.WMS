/**
 * MANIFESTO DO PACOTE MESTRE.
 * Testa a ORDEM e a COMPOSICAO das secoes que `scripts/docs-demo.ts` usa
 * para montar o PDF unico — sem tocar em Playwright/PDF, so o dominio.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { seed } from "../src/domain/services/simulation.ts";
import { prepareDemoDocuments } from "../src/domain/services/demo.ts";
import { buildDemoPackManifest, SECTION_TITLES } from "../src/domain/services/demo-pack.ts";
import { docType } from "../src/domain/documents.ts";
import { SALES_ORDERS, ROUTES, INBOUND_ORDERS } from "../src/seed/scenario.ts";

before(async () => {
  assert.ok(process.env.WMS_TEST_DATABASE, "Defina WMS_TEST_DATABASE=1 (use `npm test`).");
  await seed("TESTE");
  await prepareDemoDocuments();
});

await test("P01 · o manifesto cobre as secoes 02 a 14, na ordem", async () => {
  const secoes = await buildDemoPackManifest();
  assert.deepEqual(
    secoes.map((s) => s.code),
    ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14"],
  );
  for (const s of secoes) {
    assert.equal(s.title, SECTION_TITLES[s.code], `titulo da secao ${s.code}`);
  }
});

await test("P02 · toda entrada do manifesto aponta para um tipo real do catalogo", async () => {
  const secoes = await buildDemoPackManifest();
  for (const s of secoes) {
    for (const e of s.entries) {
      assert.ok(docType(e.docType), `secao ${s.code}: tipo ${e.docType} nao existe no catalogo`);
      assert.ok(e.id, `secao ${s.code}/${e.docType}: entrada sem id`);
      assert.ok(e.entity, `secao ${s.code}/${e.docType}: entrada sem tabela mapeada`);
    }
  }
});

await test("P03 · nenhuma entrada se repete no manifesto (sem documento duplicado)", async () => {
  const secoes = await buildDemoPackManifest();
  const vistos = new Set<string>();
  for (const s of secoes) {
    for (const e of s.entries) {
      const chave = `${e.docType}:${e.id}`;
      assert.ok(!vistos.has(chave), `documento duplicado no pacote: ${chave}`);
      vistos.add(chave);
    }
  }
});

await test("P04 · vendas, separacao e notas de saida tem um documento por pedido", async () => {
  const secoes = await buildDemoPackManifest();
  const porCodigo = new Map(secoes.map((s) => [s.code, s]));

  assert.equal(porCodigo.get("05")!.entries.length, SALES_ORDERS.length, "pedidos de venda");
  assert.equal(porCodigo.get("06")!.entries.length, SALES_ORDERS.length, "picklists");
  assert.equal(porCodigo.get("08")!.entries.length, SALES_ORDERS.length, "packing lists");
  assert.equal(porCodigo.get("09")!.entries.length, SALES_ORDERS.length, "conferencias de expedicao");
  assert.equal(porCodigo.get("10")!.entries.length, SALES_ORDERS.length, "notas de saida");
  assert.equal(porCodigo.get("14")!.entries.length, SALES_ORDERS.length, "comprovantes de expedicao");

  assert.deepEqual(
    porCodigo.get("05")!.entries.map((e) => e.id),
    SALES_ORDERS.map((s) => s.id),
    "pedidos na mesma ordem do cenario",
  );
});

await test("P05 · romaneios, transporte e carregamento tem um documento por rota", async () => {
  const secoes = await buildDemoPackManifest();
  const porCodigo = new Map(secoes.map((s) => [s.code, s]));

  assert.equal(porCodigo.get("11")!.entries.length, ROUTES.length, "romaneios");
  assert.equal(porCodigo.get("12")!.entries.length, ROUTES.length, "documentos de transporte");
  assert.equal(porCodigo.get("13")!.entries.length, ROUTES.length, "checklists de carregamento");
  assert.deepEqual(
    porCodigo.get("11")!.entries.map((e) => e.id),
    ROUTES.map((r) => r.id),
    "romaneios na mesma ordem das rotas do cenario",
  );
});

await test("P06 · recebimento tem um documento por ordem, exceto etiquetas em folha", async () => {
  const secoes = await buildDemoPackManifest();
  const s02 = secoes.find((s) => s.code === "02")!;

  const porTipo = new Map<string, number>();
  for (const e of s02.entries) porTipo.set(e.docType, (porTipo.get(e.docType) ?? 0) + 1);

  assert.equal(porTipo.get("purchase-order"), INBOUND_ORDERS.length);
  assert.equal(porTipo.get("invoice"), INBOUND_ORDERS.length, "uma NF de entrada por recebimento");
  assert.equal(porTipo.get("inbound-order"), INBOUND_ORDERS.length);
  assert.equal(porTipo.get("weighing"), INBOUND_ORDERS.length);
  assert.equal(porTipo.get("receiving-checklist"), INBOUND_ORDERS.length);
});

await test("P07 · secao 03 tem as quatro folhas de etiqueta de recebimento, uma vez cada", async () => {
  const secoes = await buildDemoPackManifest();
  const s03 = secoes.find((s) => s.code === "03")!;
  assert.deepEqual(
    s03.entries.map((e) => e.docType).sort(),
    ["inbound-volume-label-sheet", "location-label-sheet", "pallet-label-sheet", "product-label-sheet"].sort(),
  );
});

await test("P08 · etiquetas de expedicao sao UMA folha (nao uma por caixa)", async () => {
  const secoes = await buildDemoPackManifest();
  const s07 = secoes.find((s) => s.code === "07")!;
  assert.equal(s07.entries.length, 1, "a folha de etiquetas de volume e um documento so, com varias paginas");
  assert.equal(s07.entries[0].docType, "volume-label-sheet");
});

await test("P09 · notas de entrada (secao 02) e de saida (secao 10) nao se misturam", async () => {
  const secoes = await buildDemoPackManifest();
  const entrada = secoes.find((s) => s.code === "02")!.entries.filter((e) => e.docType === "invoice");
  const saida = secoes.find((s) => s.code === "10")!.entries;
  for (const e of entrada) assert.equal(e.sublabel, "Entrada");
  for (const e of saida) assert.equal(e.sublabel, "Saida");
  assert.equal(new Set([...entrada, ...saida].map((e) => e.id)).size, entrada.length + saida.length);
});
