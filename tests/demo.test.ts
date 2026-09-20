/**
 * PACOTE DE DOCUMENTOS DA DEMONSTRACAO.
 *
 * O que estes testes protegem e a regra que deu origem ao pacote:
 * GERAR DOCUMENTO NAO E EXECUTAR A OPERACAO. Cada documento pre-gerado
 * aponta para uma entidade real — e a operacao, quando acontece,
 * reivindica essa mesma entidade em vez de criar outra.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { seed, resetSimulation } from "../src/domain/services/simulation.ts";
import {
  prepareDemoDocuments, ensureDemoDocuments, demoPackReport, demoPackReady,
} from "../src/domain/services/demo.ts";
import { stockOf } from "../src/domain/services/inventory.ts";
import * as receiving from "../src/domain/services/receiving.ts";
import * as orders from "../src/domain/services/orders.ts";
import * as picking from "../src/domain/services/picking.ts";
import * as packing from "../src/domain/services/packing.ts";
import * as shipping from "../src/domain/services/shipping.ts";
import {
  INBOUND_ORDERS, SALES_ORDERS, ROUTES, BOX, BOXES_PER_ORDER,
} from "../src/seed/scenario.ts";
import { all, one, scalar } from "../src/lib/db.ts";

const OP = "OPR-0002";
const SUP = "OPR-0001";

before(async () => {
  assert.ok(
    process.env.WMS_TEST_DATABASE,
    "Defina WMS_TEST_DATABASE=1 e aponte DATABASE_URL para um banco de teste " +
    "antes de rodar os testes (use `npm test`).",
  );
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL nao esta definida.");
  await seed("TESTE");
  await prepareDemoDocuments();
});

// --------------------------------------------------------------- composicao
await test("D01 · 10 caixas de entrada, divididas entre as duas ordens", async () => {
  const total = await scalar<number>(
    `SELECT COUNT(*) FROM volumes WHERE inbound_order_id IS NOT NULL AND status <> 'CANCELLED'`,
  );
  assert.equal(Number(total), BOX.inboundBoxes);

  for (const io of INBOUND_ORDERS) {
    const n = await scalar<number>(
      `SELECT COUNT(*) FROM volumes WHERE inbound_order_id = ? AND status <> 'CANCELLED'`, io.id,
    );
    assert.equal(Number(n), io.expectedVolumes, `caixas de ${io.id}`);
  }
});

await test("D02 · cada caixa de entrada leva 12 shampoos e 12 condicionadores", async () => {
  const caixas = await all<any>(
    `SELECT id FROM volumes WHERE inbound_order_id IS NOT NULL ORDER BY id`,
  );
  assert.equal(caixas.length, BOX.inboundBoxes);
  for (const c of caixas) {
    const itens = await all<any>(
      `SELECT product_id, SUM(quantity) AS q FROM volume_items
        WHERE volume_id = ? GROUP BY product_id ORDER BY product_id`,
      c.id,
    );
    assert.equal(Number(itens.find((i) => i.product_id === "SKU-001")?.q), BOX.shampooPerBox, c.id);
    assert.equal(Number(itens.find((i) => i.product_id === "SKU-002")?.q), BOX.conditionerPerBox, c.id);
  }
});

await test("D03 · 18 caixas de saida, 3 por pedido, 216 + 216 unidades", async () => {
  const total = await scalar<number>(
    `SELECT COUNT(*) FROM volumes WHERE sales_order_id IS NOT NULL AND status <> 'CANCELLED'`,
  );
  assert.equal(Number(total), BOX.outboundBoxes);

  for (const so of SALES_ORDERS) {
    const n = await scalar<number>(
      `SELECT COUNT(*) FROM volumes WHERE sales_order_id = ? AND status <> 'CANCELLED'`, so.id,
    );
    assert.equal(Number(n), BOXES_PER_ORDER, `caixas de ${so.id}`);
  }

  for (const [sku, porCaixa] of [
    ["SKU-001", BOX.shampooPerBox], ["SKU-002", BOX.conditionerPerBox],
  ] as const) {
    const q = await scalar<number>(
      `SELECT COALESCE(SUM(vi.quantity),0) FROM volume_items vi
         JOIN volumes v ON v.id = vi.volume_id
        WHERE v.sales_order_id IS NOT NULL AND v.status <> 'CANCELLED' AND vi.product_id = ?`,
      sku,
    );
    assert.equal(Number(q), BOX.outboundBoxes * porCaixa, sku);
  }
});

await test("D04 · uma nota fiscal de saida por pedido, vinculada ao pedido", async () => {
  for (const so of SALES_ORDERS) {
    const nf = await one<any>(
      `SELECT * FROM invoices WHERE sales_order_id = ? AND kind = 'OUTBOUND'`, so.id,
    );
    assert.ok(nf, `NF de saida de ${so.id}`);
    assert.equal(nf.simulated, 1, "a nota tem de ser marcada como simulada");
    assert.equal(Number(nf.total_volumes), BOXES_PER_ORDER, "caixas declaradas na NF");
  }
  const n = await scalar<number>(`SELECT COUNT(*) FROM invoices WHERE kind = 'OUTBOUND'`);
  assert.equal(Number(n), SALES_ORDERS.length);
});

await test("D05 · dois romaneios, 3 paradas e 9 caixas cada", async () => {
  for (const rota of ROUTES) {
    const m = await one<any>(`SELECT * FROM shipping_manifests WHERE id = ?`, rota.id);
    assert.ok(m, `romaneio ${rota.id}`);
    assert.equal(m.status, "DRAFT", "o romaneio pre-gerado nao pode estar liberado");

    const paradas = await all<any>(
      `SELECT * FROM manifest_orders WHERE manifest_id = ? ORDER BY stop_sequence`, rota.id,
    );
    assert.deepEqual(paradas.map((p) => p.sales_order_id), [...rota.stops]);

    const caixas = await scalar<number>(
      `SELECT COUNT(*) FROM volumes v JOIN manifest_orders mo ON mo.sales_order_id = v.sales_order_id
        WHERE mo.manifest_id = ? AND v.status <> 'CANCELLED'`,
      rota.id,
    );
    assert.equal(Number(caixas), BOXES_PER_ORDER * rota.stops.length, `caixas de ${rota.id}`);
  }
});

await test("D06 · documento de transporte e checklist de carregamento por rota", async () => {
  for (const rota of ROUTES) {
    const dt = await one<any>(`SELECT * FROM transport_documents WHERE manifest_id = ?`, rota.id);
    assert.ok(dt, `documento de transporte de ${rota.id}`);
    assert.equal(dt.simulated, 1);

    const car = await one<any>(`SELECT * FROM loading_operations WHERE manifest_id = ?`, rota.id);
    assert.ok(car, `checklist de carregamento de ${rota.id}`);
    assert.equal(car.status, "PENDING", "o carregamento pre-gerado nao pode ter comecado");
    assert.equal(Number(car.loaded_volumes), 0);
  }
});

// ------------------------------------------------- gerar != executar
await test("D07 · a preparacao NAO executa a operacao", async () => {
  // Saldo fisico intacto: so o inicial, sem o recebimento.
  assert.equal((await stockOf("SKU-001")).onHand, 120);
  assert.equal((await stockOf("SKU-002")).onHand, 120);

  const expedidos = await scalar<number>(
    `SELECT COUNT(*) FROM sales_orders WHERE status = 'SHIPPED'`);
  assert.equal(Number(expedidos), 0, "nenhum pedido pode estar expedido");

  const embaladas = await scalar<number>(
    `SELECT COUNT(*) FROM volumes WHERE status IN ('OPEN','CLOSED','LOADED','SHIPPED')`);
  assert.equal(Number(embaladas), 0, "nenhuma caixa pode estar embalada ou expedida");

  const recebidos = await scalar<number>(
    `SELECT COUNT(*) FROM inbound_orders WHERE status <> 'SCHEDULED'`);
  assert.equal(Number(recebidos), 0, "nenhum recebimento pode ter comecado");

  const romaneios = await scalar<number>(
    `SELECT COUNT(*) FROM shipping_manifests WHERE status <> 'DRAFT'`);
  assert.equal(Number(romaneios), 0, "nenhum romaneio pode estar liberado ou carregado");

  const movimentos = await scalar<number>(
    `SELECT COUNT(*) FROM inventory_movements WHERE kind <> 'RECEIPT'`);
  assert.equal(Number(movimentos), 0, "a preparacao nao pode gerar movimento de estoque");
});

await test("D08 · nenhum documento orfao e todas as validacoes passam", async () => {
  const r = await demoPackReport();
  const falhas = r.checks.filter((c) => !c.ok);
  assert.deepEqual(
    falhas.map((f) => `${f.label}: ${f.detail}`), [],
    "o relatorio de validacao do pacote acusou falhas",
  );
  assert.ok(r.documents > 0);
});

await test("D09 · preparar de novo e idempotente", async () => {
  const antes = await demoPackReport();
  await ensureDemoDocuments();
  await prepareDemoDocuments();
  const depois = await demoPackReport();
  assert.equal(depois.documents, antes.documents, "o pacote nao pode duplicar");

  const volumes = await scalar<number>(`SELECT COUNT(*) FROM volumes`);
  assert.equal(Number(volumes), BOX.inboundBoxes + BOX.outboundBoxes);
});

// ------------------------------------------------- a operacao reivindica
await test("D10 · volume planejado e recusado na conferencia de expedicao", async () => {
  const vol = await one<any>(
    `SELECT * FROM volumes WHERE sales_order_id = ? AND status = 'PLANNED' ORDER BY sequence LIMIT 1`,
    SALES_ORDERS[0].id,
  );
  assert.ok(vol, "deve haver um volume planejado");

  const check = await one<any>(
    `SELECT id FROM shipping_checks WHERE sales_order_id = ?`, SALES_ORDERS[0].id,
  );
  const r = await shipping.checkVolume({
    checkId: check.id, volumeCode: vol.id, operatorId: OP,
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "NOT_PACKED", "caixa nao embalada nao pode ser conferida");
});

await test("D11 · a operacao reivindica as entidades planejadas, sem criar outras", async () => {
  await resetSimulation("TESTE", { demoPack: true });

  const planejados = await all<any>(
    `SELECT id, sales_order_id FROM volumes WHERE sales_order_id IS NOT NULL ORDER BY id`,
  );
  const paletePlanejado = await one<any>(
    `SELECT id FROM pallets WHERE origin_ref = 'OR-000001' AND planned = 1`,
  );
  assert.ok(paletePlanejado, "o palete de recebimento deve nascer planejado");

  // ---------------------------------------------------------- recebimento
  for (const [ordem, doca] of [["OR-000001", "DOCA-01"], ["OR-000002", "DOCA-02"]] as const) {
    await receiving.registerArrival({ inboundId: ordem, dockId: doca, operatorId: OP });
    await receiving.startReceiving(ordem, OP);
    const conf = await receiving.startCheck(ordem, OP);
    const io = (await receiving.getInbound(ordem))!;
    for (const [i, linha] of io.items.entries()) {
      await receiving.checkItem({
        checkId: conf, checkItemId: `${conf}-L${String(i + 1).padStart(2, "0")}`,
        quantity: linha.expected_qty, operatorId: OP,
      });
    }
    await receiving.finishCheck(conf, OP);
    const pallet = await receiving.createPallet({
      lines: io.items.map((l: any) => ({
        productId: l.product_id, lotCode: l.lot_code, quantity: l.expected_qty,
      })),
      originKind: "RECEIVING", originRef: ordem, operatorId: OP,
    });
    if (ordem === "OR-000001") {
      assert.equal(pallet, paletePlanejado.id, "o recebimento tem de reivindicar o palete planejado");
    }
    await receiving.generateStorageOrders(ordem, OP);
    const so = (await receiving.storageOrderForPallet(pallet))!;
    await receiving.executeStorage({
      storageOrderId: so.id, locationId: so.suggested_location_id, operatorId: OP, origin: "RF",
    });
  }
  assert.equal((await stockOf("SKU-001")).onHand, 240, "o recebimento entrou uma vez so");

  // ------------------------------------------------------------- expedicao
  const usados: string[] = [];
  for (const rota of ROUTES) {
    for (const pedido of rota.stops) {
      const r = await one<any>(`SELECT reserved FROM sales_orders WHERE id = ?`, pedido);
      if (!r?.reserved) await orders.releaseOrder(pedido, SUP);

      const pick = await picking.generatePicklist(pedido, SUP);
      await picking.startPicking(pick, OP, "EQP-0001");
      let guarda = 0;
      while ((await picking.currentItem(pick)) && guarda++ < 60) {
        const item = await picking.currentItem(pick);
        if (item.status === "PENDING") {
          await picking.scanLocation({ pickingId: pick, rawCode: item.location_code, operatorId: OP });
        }
        await picking.scanProduct({ pickingId: pick, rawCode: item.sku, operatorId: OP });
        await picking.confirmPick({ pickingId: pick, quantity: item.expected_qty, operatorId: OP });
      }

      const pack = await packing.generatePacking(pedido, OP);
      await packing.startPacking(pack, OP);
      const doPedido: string[] = [];
      for (let i = 0; i < BOXES_PER_ORDER; i++) {
        const vol = await packing.createVolume({ packingId: pack, operatorId: OP });
        await packing.addToVolume({ volumeId: vol, productId: "SKU-001", quantity: BOX.shampooPerBox, operatorId: OP });
        await packing.addToVolume({ volumeId: vol, productId: "SKU-002", quantity: BOX.conditionerPerBox, operatorId: OP });
        doPedido.push(vol);
      }
      await packing.completePacking(pack, OP);
      usados.push(...doPedido);

      const conf = await shipping.startShippingCheck(pedido, OP);
      for (const vol of doPedido) {
        await shipping.checkVolume({ checkId: conf, volumeCode: vol, operatorId: OP });
      }
      await shipping.finishShippingCheck(conf, OP);
      await shipping.addOrderToManifest({ manifestId: rota.id, orderId: pedido, actor: SUP });
    }
    await shipping.releaseManifest(rota.id, SUP);
    const carPlanejado = await one<any>(
      `SELECT id FROM loading_operations WHERE manifest_id = ?`, rota.id,
    );
    const carreg = await shipping.startLoading({
      manifestId: rota.id, dockId: rota.dockId, operatorId: OP,
    });
    assert.equal(carreg, carPlanejado.id, "o carregamento tem de reivindicar o checklist impresso");
    for (const vol of usados) {
      const pertence = await one<any>(
        `SELECT 1 AS ok FROM volumes v JOIN manifest_orders mo ON mo.sales_order_id = v.sales_order_id
          WHERE v.id = ? AND mo.manifest_id = ?`,
        vol, rota.id,
      );
      if (pertence) {
        await shipping.scanVolumeForLoading({ loadingId: carreg, volumeCode: vol, operatorId: OP });
      }
    }
    await shipping.completeLoading({ loadingId: carreg, seal: `LCR-${rota.id.slice(-5)}`, operatorId: OP });
    await shipping.createTransportDocument(rota.id, SUP);
    await shipping.shipManifest(rota.id, SUP);
  }

  // As caixas expedidas sao EXATAMENTE as que foram etiquetadas antes.
  assert.deepEqual(
    usados.slice().sort(),
    planejados.map((v) => v.id).sort(),
    "a operacao criou volumes diferentes dos que foram impressos",
  );
  const totalVolumes = await scalar<number>(`SELECT COUNT(*) FROM volumes`);
  assert.equal(
    Number(totalVolumes), BOX.inboundBoxes + BOX.outboundBoxes,
    "nenhum volume extra pode ter sido criado",
  );
  assert.equal((await stockOf("SKU-001")).onHand, 24, "saldo final de shampoo");
  assert.equal((await stockOf("SKU-002")).onHand, 24, "saldo final de condicionador");
});

await test("D12 · o reset devolve o pacote quando ele existia", async () => {
  await resetSimulation("TESTE", { demoPack: true });
  assert.equal(await demoPackReady(), true);
  const r = await demoPackReport();
  assert.deepEqual(r.checks.filter((c) => !c.ok).map((c) => c.label), []);

  // E o cenario cru continua disponivel para quem nao quer o pacote.
  await resetSimulation("TESTE", { demoPack: false });
  assert.equal(await demoPackReady(), false);
  assert.equal(Number(await scalar<number>(`SELECT COUNT(*) FROM volumes`)), 0);
});
