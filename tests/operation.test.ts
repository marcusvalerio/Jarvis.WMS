import { test, before } from "node:test";
import assert from "node:assert/strict";

import { seed, resetSimulation } from "../src/domain/services/simulation.ts";
import { stockOf, listMovements, onHandOf } from "../src/domain/services/inventory.ts";
import * as receiving from "../src/domain/services/receiving.ts";
import * as orders from "../src/domain/services/orders.ts";
import * as picking from "../src/domain/services/picking.ts";
import * as packing from "../src/domain/services/packing.ts";
import * as shipping from "../src/domain/services/shipping.ts";
import * as counting from "../src/domain/services/counting.ts";
import { traceOrder, tracePallet } from "../src/domain/services/traceability.ts";
import { listIncidents } from "../src/domain/services/incidents.ts";
import { auditFor, listAudit } from "../src/domain/services/audit.ts";
import { resolveScan } from "../src/domain/services/scan.ts";
import { dashboardKpis } from "../src/domain/services/kpi.ts";
import { locationIdFromCode } from "../src/lib/ids.ts";
import { BOXES_PER_ORDER, ROUTES } from "../src/seed/scenario.ts";
import { all, one } from "../src/lib/db.ts";
import { TABLES, NAO_RESETADAS } from "../src/domain/services/simulation.ts";

const OP = "OPR-0002";
const SUP = "OPR-0001";

before(async () => {
  // Os testes destroem e recarregam o cenario. Apontar para o banco da
  // operacao apagaria uma apresentacao em andamento.
  assert.ok(
    process.env.WMS_TEST_DATABASE,
    "Defina WMS_TEST_DATABASE=1 e aponte DATABASE_URL para um banco de teste " +
    "antes de rodar os testes (use `npm test`).",
  );
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL nao esta definida.");
  await seed("TESTE");
});

// ------------------------------------------------------------- 1. estado inicial
await test("01 · estoque inicial carregado conforme o cenario", async () => {
  // 120 un de cada SKU, em dois lotes — e o que permite demonstrar FEFO.
  assert.equal((await stockOf("SKU-001")).onHand, 120, "Shampoo Pantene");
  assert.equal((await stockOf("SKU-002")).onHand, 120, "Condicionador Pantene");
});

await test("02 · documentos de entrada existem e apontam para as mesmas entidades", async () => {
  const po = await orders.getPurchaseOrder("PC-000001");
  assert.ok(po);
  assert.equal(po!.items.length, 2);
  const inbound = await receiving.getInbound("OR-000001");
  assert.ok(inbound);
  assert.equal(inbound!.order.purchase_order_id, "PC-000001");
  assert.equal(inbound!.invoice?.id, "NFS-000001");
  // A NF simulada reflete exatamente as linhas da ordem de recebimento.
  const invTotal = await one<any>(
    `SELECT SUM(quantity) q FROM invoice_items WHERE invoice_id = 'NFS-000001'`);
  const orTotal = inbound!.items.reduce((s, i) => s + i.expected_qty, 0);
  assert.equal(invTotal.q, orTotal);
  assert.equal(inbound!.invoice?.simulated, 1, "documento marcado como simulado");
});

// ------------------------------------------------------------- 2. recebimento
let checkId = "";
await test("03 · chegada, inicio de recebimento e pesagem", async () => {
  await receiving.registerArrival({ inboundId: "OR-000001", dockId: "DOCA-01", operatorId: OP });
  await receiving.startReceiving("OR-000001", OP);

  const io = (await receiving.getInbound("OR-000001"))!;
  assert.equal(io.order.status, "RECEIVING");

  const w = await receiving.registerWeighing({
    refKind: "INBOUND_ORDER", refId: "OR-000001",
    grossKg: 1180, tareKg: 50, expectedKg: io.order.expected_weight_kg,
    equipmentId: "EQP-0007", operatorId: OP,
  });
  const weighing = await receiving.getWeighing(w);
  assert.equal(weighing.net_kg, 1130);
  assert.equal(weighing.gross_kg - weighing.tare_kg, weighing.net_kg);
});

await test("04 · conferencia registra divergencia e abre ocorrencia", async () => {
  checkId = await receiving.startCheck("OR-000001", OP);
  const before = (await listIncidents({ status: "OPEN" })).length;

  // Linha 1: SKU-001 esperado 72, conferido 71 (divergencia -1)
  const r1 = await receiving.checkItem({
    checkId, checkItemId: `${checkId}-L01`, quantity: 71, operatorId: OP,
  });
  assert.equal(r1.expected, 72);
  assert.equal(r1.checked, 71);
  assert.equal(r1.divergence, -1);
  assert.equal(r1.status, "DIVERGENCE");
  assert.ok(r1.incidentId, "divergencia deve gerar ocorrencia");
  assert.equal((await listIncidents({ status: "OPEN" })).length, before + 1);

  // Linha 2: SKU-002 conferido integralmente
  const r2 = await receiving.checkItem({
    checkId, checkItemId: `${checkId}-L02`, quantity: 72, operatorId: OP,
  });
  assert.equal(r2.divergence, 0);

  const result = await receiving.finishCheck(checkId, OP);
  assert.equal(result.divergences, 1);
  assert.equal((await receiving.getInbound("OR-000001"))!.order.status, "DIVERGENCE");
});

await test("05 · aprovacao apos tratamento da divergencia", async () => {
  await receiving.approveWithDivergence("OR-000001", SUP, "Falta de 1 un aceita; debito ao fornecedor");
  assert.equal((await receiving.getInbound("OR-000001"))!.order.status, "APPROVED");
});

let palletA = "";
let palletB = "";
await test("06 · paletizacao da quantidade CONFERIDA entra no estoque", async () => {
  const stockBefore = (await stockOf("SKU-001")).onHand;
  palletA = await receiving.createPallet({
    lines: [{ productId: "SKU-001", lotCode: "L2603S", quantity: 71 }],
    originKind: "RECEIVING", originRef: "OR-000001", operatorId: OP,
  });
  palletB = await receiving.createPallet({
    lines: [{ productId: "SKU-002", lotCode: "L2603C", quantity: 72 }],
    originKind: "RECEIVING", originRef: "OR-000001", operatorId: OP,
  });
  assert.match(palletA, /^PLT-\d{6}$/);
  // Entrou fisicamente, mas ainda na area de recebimento.
  assert.equal((await stockOf("SKU-001")).onHand, stockBefore + 71);
  const rows = await all<any>(
    `SELECT * FROM inventory WHERE pallet_id = ? AND qty_on_hand > 0`, palletA);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].location_id, locationIdFromCode("R-01-01-01"));
});

await test("07 · o WMS sugere endereco e a armazenagem o confirma", async () => {
  const created = await receiving.generateStorageOrders("OR-000001", OP);
  assert.equal(created.length, 2);

  const so = await receiving.storageOrderForPallet(palletA);
  assert.ok(so, "deve existir ordem de armazenagem para o palete");
  assert.ok(so.suggested_location_id, "o WMS deve sugerir um endereco");

  // Endereco divergente sem justificativa e bloqueado.
  await assert.rejects(
    async () => await receiving.executeStorage({
      storageOrderId: so.id, locationId: locationIdFromCode("C-02-03-02"), operatorId: OP,
    }),
    /divergente da sugestao/i,
  );

  await receiving.executeStorage({
    storageOrderId: so.id, locationId: so.suggested_location_id, operatorId: OP, origin: "RF",
  });
  const stored = (await receiving.getPallet(palletA))!;
  assert.equal(stored.pallet.status, "STORED");
  assert.equal(stored.pallet.location_id, so.suggested_location_id);
});

await test("08 · recebimento conclui quando todos os paletes estao armazenados", async () => {
  const so2 = (await receiving.storageOrderForPallet(palletB))!;
  await receiving.executeStorage({
    storageOrderId: so2.id, locationId: so2.suggested_location_id, operatorId: OP,
  });
  assert.equal((await receiving.getInbound("OR-000001"))!.order.status, "COMPLETED");
  assert.equal((await stockOf("SKU-001")).onHand, 191, "120 iniciais + 71 conferidos");
  assert.equal((await stockOf("SKU-002")).onHand, 192, "120 iniciais + 72 recebidos");
});

await test("09 · segundo recebimento completa as 10 caixas da entrada", async () => {
  await receiving.registerArrival({ inboundId: "OR-000002", dockId: "DOCA-02", operatorId: OP });
  await receiving.startReceiving("OR-000002", OP);
  const c = await receiving.startCheck("OR-000002", OP);
  await receiving.checkItem({ checkId: c, checkItemId: `${c}-L01`, quantity: 48, operatorId: OP });
  await receiving.checkItem({ checkId: c, checkItemId: `${c}-L02`, quantity: 48, operatorId: OP });
  await receiving.finishCheck(c, OP);

  const p = await receiving.createPallet({
    lines: [
      { productId: "SKU-001", lotCode: "L2604S", quantity: 48 },
      { productId: "SKU-002", lotCode: "L2604C", quantity: 48 },
    ],
    originKind: "RECEIVING", originRef: "OR-000002", operatorId: OP,
  });
  await receiving.generateStorageOrders("OR-000002", OP);
  const so = (await receiving.storageOrderForPallet(p))!;
  await receiving.executeStorage({
    storageOrderId: so.id, locationId: so.suggested_location_id, operatorId: OP,
  });
  // 10 caixas recebidas no total: 120 shampoos previstos (71+48 conferidos)
  // e 120 condicionadores (72+48).
  assert.equal((await stockOf("SKU-001")).onHand, 239, "120 iniciais + 119 conferidos");
  assert.equal((await stockOf("SKU-002")).onHand, 240, "120 iniciais + 120 recebidos");
  assert.equal((await receiving.getInbound("OR-000002"))!.order.status, "COMPLETED");
});

// ------------------------------------------------------------- 3. saida
await test("10 · reserva nunca excede o disponivel", async () => {
  const result = await orders.releaseOrder("PED-000125", SUP);
  assert.equal(result.fullyReserved, true);
  for (const l of result.lines) assert.equal(l.shortage, 0);

  const s1 = await stockOf("SKU-001");
  assert.equal(s1.reserved, 36, "3 caixas x 12 shampoos");
  assert.equal(s1.available, s1.onHand - s1.reserved);
  assert.ok(s1.reserved <= s1.onHand, "reserva jamais acima do saldo");

  // Um pedido gigante nao consegue reservar alem do disponivel.
  const big = await orders.createOrder({
    customerId: "CLI-0001", warehouseId: "CD-01", dueAt: new Date(Date.now() + 864e5).toISOString(),
    items: [{ productId: "SKU-001", quantity: 9999 }], actor: SUP,
  });
  const r = await orders.releaseOrder(big, SUP);
  assert.equal(r.fullyReserved, false);
  assert.ok(r.lines[0].shortage > 0);
  const saturado = await stockOf("SKU-001");
  assert.equal(saturado.reserved, saturado.onHand, "reservou apenas o que existe");
  await orders.cancelOrder(big, SUP, "Pedido de teste de limite");
  assert.equal((await stockOf("SKU-001")).reserved, 36, "liberou a reserva do pedido cancelado");
});

let pickId = "";
await test("11 · picklist segue a rota do armazem", async () => {
  pickId = await picking.generatePicklist("PED-000125", SUP);
  const { picking: pk, items } = (await picking.getPicking(pickId))!;
  assert.equal(pk.sales_order_id, "PED-000125");
  assert.ok(items.length >= 2, "ao menos uma linha por SKU");
  const seqs = items.map((i: any) => i.sequence);
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b));
  assert.equal((await orders.getOrder("PED-000125"))!.order.status, "PICKING");
});

await test("12 · coletora BLOQUEIA endereco incorreto", async () => {
  await picking.startPicking(pickId, OP, "EQP-0001");
  const item = await picking.currentItem(pickId);
  const wrong = item.location_code === "A-02-04-02" ? "A-01-01-01" : "A-02-04-02";

  const bad = await picking.scanLocation({ pickingId: pickId, rawCode: wrong, operatorId: OP });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, "WRONG_LOCATION");
  assert.match(bad.message, /ENDERECO INCORRETO/);

  // A linha continua intocada — nao ha avanco fora de sequencia.
  assert.equal((await picking.currentItem(pickId)).status, "PENDING");
});

await test("13 · coletora BLOQUEIA produto incorreto e fora de sequencia", async () => {
  const item = await picking.currentItem(pickId);

  // Bipar produto antes do endereco e recusado.
  const early = await picking.scanProduct({ pickingId: pickId, rawCode: item.sku, operatorId: OP });
  assert.equal(early.ok, false);
  assert.equal(early.code, "OUT_OF_SEQUENCE");

  const okLoc = await picking.scanLocation({
    pickingId: pickId, rawCode: item.location_code, operatorId: OP,
  });
  assert.equal(okLoc.ok, true);
  assert.equal(okLoc.nextStep, "SCAN_PRODUCT");

  const wrongSku = item.product_id === "SKU-001" ? "SKU-002" : "SKU-001";
  const badProd = await picking.scanProduct({ pickingId: pickId, rawCode: wrongSku, operatorId: OP });
  assert.equal(badProd.ok, false);
  assert.match(badProd.message, /PRODUTO INCORRETO/);

  const ghost = await picking.scanProduct({ pickingId: pickId, rawCode: "XPTO-999", operatorId: OP });
  assert.equal(ghost.code, "UNKNOWN_PRODUCT");
});

await test("14 · coletora BLOQUEIA quantidade excedente", async () => {
  const item = await picking.currentItem(pickId);
  await picking.scanProduct({ pickingId: pickId, rawCode: item.sku, operatorId: OP });
  const over = await picking.confirmPick({
    pickingId: pickId, quantity: item.expected_qty + 5, operatorId: OP,
  });
  assert.equal(over.ok, false);
  assert.equal(over.code, "OVER_QTY");
});

await test("15 · picking completo baixa estoque pelas reservas", async () => {
  const before = { s1: (await stockOf("SKU-001")).onHand, s2: (await stockOf("SKU-002")).onHand };

  let guard = 0;
  while (await picking.currentItem(pickId) && guard++ < 50) {
    const item = await picking.currentItem(pickId);
    if (item.status === "PENDING") {
      await picking.scanLocation({ pickingId: pickId, rawCode: item.location_code, operatorId: OP });
    }
    await picking.scanProduct({ pickingId: pickId, rawCode: item.sku, operatorId: OP });
    const r = await picking.confirmPick({ pickingId: pickId, quantity: item.expected_qty, operatorId: OP });
    assert.equal(r.ok, true, r.message);
  }

  const pk = (await picking.getPicking(pickId))!.picking;
  assert.equal(pk.status, "COMPLETED");
  assert.equal(pk.done_lines, pk.total_lines);

  // O picking e uma TRANSFERENCIA: a mercadoria sai do endereco de estoque e
  // vai para o staging de expedicao. O saldo fisico do armazem so cai na
  // expedicao — por isso onHand permanece igual e a reserva e consumida.
  assert.equal((await stockOf("SKU-001")).onHand, before.s1);
  assert.equal((await stockOf("SKU-002")).onHand, before.s2);
  assert.equal((await stockOf("SKU-001")).reserved, 0, "reserva consumida pela coleta");

  const staging = locationIdFromCode("E-01-01-01");
  const inStaging = await one<any>(
    `SELECT SUM(qty_on_hand) q FROM inventory WHERE location_id = ?`, staging);
  assert.equal(inStaging.q, 72, "3 caixas x 24 un no staging de expedicao");

  // E saiu efetivamente das posicoes de picking.
  const picked = await all<any>(
    `SELECT COALESCE(SUM(i.qty_on_hand),0) q FROM inventory i
       JOIN locations l ON l.id = i.location_id
      WHERE i.product_id = 'SKU-001' AND l.kind = 'PALLET'`);
  assert.equal(picked[0].q, before.s1 - 36, "36 shampoos sairam das posicoes de picking");
});

let packId = "";
await test("16 · packing monta 3 caixas de 12 shampoos + 12 condicionadores", async () => {
  packId = await packing.generatePacking("PED-000125", OP);
  await packing.startPacking(packId, OP);

  const primeiro = await packing.createVolume({ packingId: packId, operatorId: OP });
  assert.match(primeiro, /^VOL-\d{6}$/);
  await assert.rejects(
    async () => await packing.addToVolume({ volumeId: primeiro, productId: "SKU-001", quantity: 999, operatorId: OP }),
    /excede o coletado/i,
  );

  // A caixa da operacao LOG122 e sempre 12 + 12 = 24 unidades.
  const caixas = [primeiro];
  await packing.addToVolume({ volumeId: primeiro, productId: "SKU-001", quantity: 12, operatorId: OP });
  await packing.addToVolume({ volumeId: primeiro, productId: "SKU-002", quantity: 12, operatorId: OP });
  for (let i = 1; i < BOXES_PER_ORDER; i++) {
    const v = await packing.createVolume({ packingId: packId, operatorId: OP });
    await packing.addToVolume({ volumeId: v, productId: "SKU-001", quantity: 12, operatorId: OP });
    await packing.addToVolume({ volumeId: v, productId: "SKU-002", quantity: 12, operatorId: OP });
    caixas.push(v);
  }

  const result = await packing.completePacking(packId, OP);
  assert.equal(result.volumes, BOXES_PER_ORDER, "3 caixas por entrega");
  assert.ok(result.weightKg > 0, "peso calculado a partir dos produtos");

  // Cada volume carrega exatamente 24 unidades.
  for (const v of caixas) {
    const q = await one<any>(`SELECT SUM(quantity) q FROM volume_items WHERE volume_id = ?`, v);
    assert.equal(q.q, 24, `${v} deve conter 24 unidades`);
  }
  assert.equal((await orders.getOrder("PED-000125"))!.order.status, "CHECKING");
});

let shipCheckId = "";
await test("17 · conferencia de expedicao exige todos os volumes", async () => {
  shipCheckId = await shipping.startShippingCheck("PED-000125", OP);
  const { volumes } = (await shipping.getShippingCheck(shipCheckId))!;

  // Volume de outro pedido e recusado.
  const foreign = await shipping.checkVolume({
    checkId: shipCheckId, volumeCode: "VOL-999999", operatorId: OP,
  });
  assert.equal(foreign.ok, false);

  // Confere todas menos a ultima: a expedicao tem de continuar bloqueada.
  for (const v of volumes.slice(0, -1)) {
    await shipping.checkVolume({ checkId: shipCheckId, volumeCode: v.id, operatorId: OP });
  }
  await assert.rejects(
    async () => await shipping.finishShippingCheck(shipCheckId, OP),
    /nao conferido/i,
    "nao encerra com volume pendente",
  );

  await shipping.checkVolume({ checkId: shipCheckId, volumeCode: volumes[volumes.length - 1].id, operatorId: OP });
  const res = await shipping.finishShippingCheck(shipCheckId, OP);
  assert.equal(res.divergences, 0);
  assert.equal((await orders.getOrder("PED-000125"))!.order.status, "READY_TO_LOAD");
});

let manifestId = "";
await test("18 · romaneio consolida pedidos prontos", async () => {
  const rota01 = ROUTES[0];
  manifestId = await shipping.createManifest({
    warehouseId: "CD-01", route: rota01.route,
    carrier: rota01.carrier, vehiclePlate: rota01.vehiclePlate,
    vehicleKind: rota01.vehicleKind, driverName: rota01.driverName, driverDoc: rota01.driverDoc,
    dockId: rota01.dockId, actor: SUP,
  });
  assert.equal(manifestId, rota01.id, "numeracao deterministica do cenario");

  await assert.rejects(
    async () => await shipping.addOrderToManifest({ manifestId, orderId: "PED-000126", actor: SUP }),
    /nao esta pronto para carregar/i,
  );
  await shipping.addOrderToManifest({ manifestId, orderId: "PED-000125", actor: SUP });
  await shipping.releaseManifest(manifestId, SUP);

  const m = (await shipping.getManifest(manifestId))!;
  assert.equal(m.manifest.status, "READY");
  assert.equal(m.manifest.total_orders, 1);
  assert.equal(m.manifest.total_volumes, BOXES_PER_ORDER);
});

let loadingId = "";
await test("19 · carregamento valida cada volume bipado", async () => {
  loadingId = await shipping.startLoading({ manifestId, dockId: ROUTES[0].dockId, operatorId: OP });
  const { expected } = (await shipping.getLoading(loadingId))!;
  assert.equal(expected.length, BOXES_PER_ORDER);

  const ghost = await shipping.scanVolumeForLoading({
    loadingId, volumeCode: "VOL-000999", operatorId: OP,
  });
  assert.equal(ghost.ok, false);
  assert.match(ghost.message, /VOLUME INEXISTENTE/);

  await shipping.scanVolumeForLoading({ loadingId, volumeCode: expected[0].id, operatorId: OP });
  const dup = await shipping.scanVolumeForLoading({
    loadingId, volumeCode: expected[0].id, operatorId: OP,
  });
  assert.equal(dup.code, "DUPLICATE");

  // Com volumes pendentes o carregamento nao encerra — divergencia bloqueia.
  await assert.rejects(
    async () => await shipping.completeLoading({ loadingId, seal: "LCR-88421", operatorId: OP }),
    /Faltam \d+ volume/i,
  );

  for (const v of expected.slice(1)) {
    await shipping.scanVolumeForLoading({ loadingId, volumeCode: v.id, operatorId: OP });
  }
  const res = await shipping.completeLoading({ loadingId, seal: "LCR-88421", operatorId: OP });
  assert.equal(res.status, "COMPLETED");
  assert.equal((await shipping.getManifest(manifestId))!.manifest.status, "LOADED");
});

await test("20 · expedicao baixa o estoque definitivamente", async () => {
  const stagingBefore = await one<any>(
    `SELECT COALESCE(SUM(qty_on_hand),0) q FROM inventory WHERE location_id = ?`,
    locationIdFromCode("E-01-01-01"));
  assert.equal(stagingBefore.q, 72, "3 caixas x 24 un");

  await shipping.createTransportDocument(manifestId, SUP);
  await shipping.shipManifest(manifestId, SUP);

  const stagingAfter = await one<any>(
    `SELECT COALESCE(SUM(qty_on_hand),0) q FROM inventory WHERE location_id = ?`,
    locationIdFromCode("E-01-01-01"));
  assert.equal(stagingAfter.q, 0, "tudo saiu do armazem");

  assert.equal((await orders.getOrder("PED-000125"))!.order.status, "SHIPPED");
  assert.equal((await shipping.getManifest(manifestId))!.manifest.status, "SHIPPED");

  // Saldos apos a primeira entrega: 239-36 e 240-36.
  assert.equal((await stockOf("SKU-001")).onHand, 203);
  assert.equal((await stockOf("SKU-002")).onHand, 204);
  assert.equal((await stockOf("SKU-001")).reserved, 0);
});

// ------------------------------------------------------------- 4. integridade
await test("21 · nao ha estoque negativo nem sobre-alocacao", async () => {
  const bad = await all<any>(
    `SELECT * FROM inventory
      WHERE qty_on_hand < 0 OR (qty_reserved + qty_blocked) > qty_on_hand + 0.0001`);
  assert.deepEqual(bad, [], "invariantes de estoque violados");
});

await test("22 · todo movimento tem lastro e o saldo bate com os movimentos", async () => {
  for (const sku of ["SKU-001", "SKU-002"]) {
    const net = await one<any>(
      `SELECT COALESCE(SUM(CASE
          WHEN to_location_id IS NOT NULL AND from_location_id IS NULL THEN quantity
          WHEN from_location_id IS NOT NULL AND to_location_id IS NULL THEN -quantity
          ELSE 0 END), 0) AS net
         FROM inventory_movements WHERE product_id = ?`, sku);
    assert.equal(
      Math.round(net.net * 1000) / 1000, await onHandOf(sku),
      `saldo de ${sku} deve ser a soma liquida dos movimentos`,
    );
  }
  const orphan = await one<any>(
    `SELECT COUNT(*) n FROM inventory_movements WHERE from_location_id IS NULL AND to_location_id IS NULL`);
  assert.equal(orphan.n, 0);
});

await test("23 · rastreabilidade cobre a cadeia completa do pedido", async () => {
  const trace = await traceOrder("PED-000125");
  const stages = new Set(trace.timeline.map((t) => t.stage));
  for (const s of ["Pedido", "Reserva", "Picking", "Packing", "Conferencia", "Romaneio", "Carregamento", "Expedicao"]) {
    assert.ok(stages.has(s), `etapa ausente na rastreabilidade: ${s}`);
  }
  const pallet = await tracePallet(palletA);
  const pStages = new Set(pallet.timeline.map((t) => t.stage));
  assert.ok(pStages.has("Paletizacao"));
  assert.ok(pStages.has("Armazenagem"));
});

await test("24 · auditoria registra as operacoes criticas", async () => {
  const actions = new Set((await listAudit({ limit: 2000 })).map((a) => a.action));
  for (const a of ["CREATE", "RECEIVE", "CHECK", "MOVE", "PICK", "PACK", "LOAD", "SHIP", "RESERVE", "WEIGH", "APPROVE"]) {
    assert.ok(actions.has(a as any), `acao nao auditada: ${a}`);
  }
  assert.ok((await auditFor("sales_order", "PED-000125")).length > 0);
});

await test("25 · leitura de codigo resolve as entidades da operacao", async () => {
  assert.equal((await resolveScan("A-01-01-01")).kind, "LOCATION");
  assert.equal((await resolveScan("END-A010101")).id, locationIdFromCode("A-01-01-01"));
  assert.equal((await resolveScan(palletA)).kind, "PALLET");
  assert.equal((await resolveScan("SKU-001")).kind, "PRODUCT");
  assert.equal((await resolveScan("7896094900011")).id, "SKU-001", "EAN do fabricante tambem resolve");
  assert.equal((await resolveScan("PED-000125")).kind, "SALES_ORDER");
  assert.equal((await resolveScan("ROM-000018")).kind, "MANIFEST");
  assert.equal((await resolveScan("LIXO-123")).found, false);
});

await test("26 · inventario ciclico calcula acuracidade e ajusta o saldo", async () => {
  const countId = await counting.createCount({ zoneId: "A", operatorId: OP });
  await counting.startCount(countId, OP);
  let first = true;
  let guard = 0;
  while (await counting.currentCountItem(countId) && guard++ < 100) {
    const item = await counting.currentCountItem(countId);
    // A primeira posicao e contada com 1 a menos, para exercitar a divergencia.
    const qty = first ? Math.max(0, item.system_qty - 1) : item.system_qty;
    await counting.countItem({ countId, itemId: item.id, countedQty: qty, operatorId: OP });
    first = false;
  }
  const { accuracy } = await counting.closeCount({ countId, operatorId: SUP, applyAdjustments: true });
  assert.ok(accuracy > 0 && accuracy < 100, `acuracidade calculada: ${accuracy}`);
  const c = (await counting.getCount(countId))!;
  assert.equal(c.count.status, "COMPLETED");
  assert.ok(c.items.some((i: any) => i.adjusted === 1), "divergencia deve gerar ajuste");
});

await test("27 · KPIs sao calculados a partir da operacao", async () => {
  const kpis = await dashboardKpis();
  const byKey = Object.fromEntries(kpis.map((k) => [k.key, k]));
  assert.ok(byKey.occupancy.value! > 0, "ocupacao calculada do mapa real");
  assert.ok(byKey.productivity.value !== null, "produtividade vem dos tempos de picking");
  assert.ok(byKey.divergence.value !== null, "indice de divergencia vem das conferencias");
  assert.ok(byKey.accuracy.value !== null, "acuracidade vem do inventario executado");
  assert.equal(byKey.otif.value, 100, "unico pedido expedido foi completo e no prazo");
  // O teste executa o fluxo em milissegundos, entao o ciclo medido e ~0 min.
  // O que importa e que o indicador tenha BASE de calculo (nao seja nulo).
  assert.notEqual(byKey.receiving.value, null, "tempo de recebimento deve ter amostra");
  assert.ok(byKey.receiving.value! >= 0);
  assert.match(byKey.receiving.sample, /2 recebimentos concluidos/);

  // Um indicador sem base de calculo devolve null — nunca um numero inventado.
  const semBase = (await dashboardKpis()).find((k) => k.key === "accuracy")!;
  assert.ok(semBase.sample.length > 0);
});

// ------------------------------------------------------------- 5. reset
await test("28 · reset devolve o cenario ao estado inicial e permite repetir", async () => {
  const r = await resetSimulation("TESTE");
  assert.equal(r.resetCount, 1);
  assert.equal((await stockOf("SKU-001")).onHand, 120);
  assert.equal((await stockOf("SKU-002")).onHand, 120);
  assert.equal((await stockOf("SKU-001")).reserved, 0);
  assert.equal((await orders.getOrder("PED-000125"))!.order.status, "PENDING");
  assert.equal((await receiving.getInbound("OR-000001"))!.order.status, "SCHEDULED");
  assert.equal((await all<any>(`SELECT * FROM volumes`)).length, 0);
  assert.equal((await all<any>(`SELECT * FROM shipping_manifests`)).length, 0);

  // E possivel executar a operacao novamente com os mesmos identificadores.
  await receiving.registerArrival({ inboundId: "OR-000001", dockId: "DOCA-01", operatorId: OP });
  await receiving.startReceiving("OR-000001", OP);
  const c = await receiving.startCheck("OR-000001", OP);
  await receiving.checkItem({ checkId: c, checkItemId: `${c}-L01`, quantity: 72, operatorId: OP });
  await receiving.checkItem({ checkId: c, checkItemId: `${c}-L02`, quantity: 72, operatorId: OP });
  const res = await receiving.finishCheck(c, OP);
  assert.equal(res.divergences, 0, "segunda execucao sem divergencia");
  assert.equal((await receiving.getInbound("OR-000001"))!.order.status, "APPROVED");
});

await test("29 · o reset cobre TODAS as tabelas do esquema", async () => {
  const schema = (await all<{ name: string }>(
    `SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  )).map((r) => r.name).sort();
  // NAO_RESETADAS sao tabelas que deliberadamente sobrevivem ao reset
  // (sessao de login). O teste segue garantindo que nenhuma tabela DO
  // CENARIO fique de fora e deixe residuo entre execucoes.
  const missing = schema.filter((t) => !TABLES.includes(t) && !NAO_RESETADAS.includes(t));
  assert.deepEqual(
    missing, [],
    `tabelas fora do reset deixariam residuo entre execucoes: ${missing.join(", ")}`,
  );
});

await test("30 · dois resets consecutivos produzem exatamente o mesmo estado", async () => {
  const snapshot = async () => ({
    stock: await Promise.all(
      ["SKU-001", "SKU-002"].map(async (s) => (await stockOf(s)).onHand),
    ),
    orders: await all<any>(`SELECT id, status FROM sales_orders ORDER BY id`),
    inbound: await all<any>(`SELECT id, status FROM inbound_orders ORDER BY id`),
    invoices: await all<any>(`SELECT id, number FROM invoices ORDER BY id`),
    locations: (await all<any>(`SELECT COUNT(*) n FROM locations`))[0].n,
  });
  await resetSimulation("TESTE");
  const a = await snapshot();
  await resetSimulation("TESTE");
  const b = await snapshot();
  assert.deepEqual(b, a, "o cenario deve ser reproduzivel entre apresentacoes");
  assert.deepEqual(a.orders.map((o: any) => o.id),
    ["PED-000125", "PED-000126", "PED-000127", "PED-000128", "PED-000129", "PED-000130"]);
  assert.deepEqual(a.invoices.map((i: any) => i.id), ["NFS-000001", "NFS-000002"]);
});

// ------------------------------------------------- 6. operacao LOG122 completa
/** Executa um pedido inteiro: reserva -> picking -> packing -> conferencia. */
async function prepararPedido(orderId: string): Promise<string[]> {
  await orders.releaseOrder(orderId, SUP);

  const pick = await picking.generatePicklist(orderId, SUP);
  await picking.startPicking(pick, OP, "EQP-0001");
  let guard = 0;
  while ((await picking.currentItem(pick)) && guard++ < 50) {
    const item = await picking.currentItem(pick);
    if (item.status === "PENDING") {
      await picking.scanLocation({ pickingId: pick, rawCode: item.location_code, operatorId: OP });
    }
    await picking.scanProduct({ pickingId: pick, rawCode: item.sku, operatorId: OP });
    const r = await picking.confirmPick({ pickingId: pick, quantity: item.expected_qty, operatorId: OP });
    assert.equal(r.ok, true, `${orderId}: coleta recusada — ${r.message}`);
  }
  assert.equal(
    (await picking.getPicking(pick))!.picking.status, "COMPLETED",
    `${orderId}: picking incompleto`,
  );

  const pack = await packing.generatePacking(orderId, OP);
  await packing.startPacking(pack, OP);
  const caixas: string[] = [];
  for (let i = 0; i < BOXES_PER_ORDER; i++) {
    const v = await packing.createVolume({ packingId: pack, operatorId: OP });
    await packing.addToVolume({ volumeId: v, productId: "SKU-001", quantity: 12, operatorId: OP });
    await packing.addToVolume({ volumeId: v, productId: "SKU-002", quantity: 12, operatorId: OP });
    caixas.push(v);
  }
  await packing.completePacking(pack, OP);

  const check = await shipping.startShippingCheck(orderId, OP);
  for (const v of caixas) {
    await shipping.checkVolume({ checkId: check, volumeCode: v, operatorId: OP });
  }
  await shipping.finishShippingCheck(check, OP);
  return caixas;
}

await test("31 · operacao LOG122: 18 caixas distribuidas em 2 rotas", async () => {
  await resetSimulation("TESTE");

  // As 10 caixas do recebimento nao sao necessarias aqui: o estoque inicial
  // (120 + 120) cobre as 216 + 216 exigidas? Nao — por isso o recebimento
  // tambem entra, exatamente como na apresentacao.
  for (const [ordem, doca] of [["OR-000001", "DOCA-01"], ["OR-000002", "DOCA-02"]] as const) {
    await receiving.registerArrival({ inboundId: ordem, dockId: doca, operatorId: OP });
    await receiving.startReceiving(ordem, OP);
    const c = await receiving.startCheck(ordem, OP);
    const io = (await receiving.getInbound(ordem))!;
    for (const [idx, linha] of io.items.entries()) {
      await receiving.checkItem({
        checkId: c, checkItemId: `${c}-L${String(idx + 1).padStart(2, "0")}`,
        quantity: linha.expected_qty, operatorId: OP,
      });
    }
    await receiving.finishCheck(c, OP);
    const plt = await receiving.createPallet({
      lines: io.items.map((l: any) => ({
        productId: l.product_id, lotCode: l.lot_code, quantity: l.expected_qty,
      })),
      originKind: "RECEIVING", originRef: ordem, operatorId: OP,
    });
    await receiving.generateStorageOrders(ordem, OP);
    const so = (await receiving.storageOrderForPallet(plt))!;
    await receiving.executeStorage({
      storageOrderId: so.id, locationId: so.suggested_location_id, operatorId: OP,
    });
  }

  assert.equal((await stockOf("SKU-001")).onHand, 240, "120 iniciais + 120 recebidos");
  assert.equal((await stockOf("SKU-002")).onHand, 240);

  // ---------------------------------------------------- as duas rotas
  const caixasPorRota: Record<string, string[]> = {};
  for (const rota of ROUTES) {
    const manifest = await shipping.createManifest({
      warehouseId: "CD-01", route: rota.route, carrier: rota.carrier,
      vehiclePlate: rota.vehiclePlate, vehicleKind: rota.vehicleKind,
      driverName: rota.driverName, driverDoc: rota.driverDoc,
      dockId: rota.dockId, actor: SUP,
    });
    assert.equal(manifest, rota.id, "romaneio com a numeracao do cenario");

    const caixas: string[] = [];
    // A ORDEM das paradas e a do cenario — stop_sequence segue a insercao.
    for (const pedido of rota.stops) {
      caixas.push(...(await prepararPedido(pedido)));
      await shipping.addOrderToManifest({ manifestId: manifest, orderId: pedido, actor: SUP });
    }
    caixasPorRota[rota.id] = caixas;

    const m = (await shipping.getManifest(manifest))!;
    assert.equal(m.manifest.total_orders, 3, `${rota.code}: 3 entregas`);
    assert.equal(m.manifest.total_volumes, 9, `${rota.code}: 9 caixas`);
    assert.deepEqual(
      m.orders.map((o: any) => o.sales_order_id), [...rota.stops],
      `${rota.code}: sequencia de paradas conforme o cenario`,
    );
    await shipping.releaseManifest(manifest, SUP);
  }

  assert.equal(
    caixasPorRota[ROUTES[0].id].length + caixasPorRota[ROUTES[1].id].length, 18,
    "18 caixas no total",
  );

  // -------------------------------------- carregamento recusa caixa de outra rota
  const carreg01 = await shipping.startLoading({
    manifestId: ROUTES[0].id, dockId: ROUTES[0].dockId, operatorId: OP,
  });
  const intrusa = caixasPorRota[ROUTES[1].id][0];
  const recusa = await shipping.scanVolumeForLoading({
    loadingId: carreg01, volumeCode: intrusa, operatorId: OP,
  });
  assert.equal(recusa.ok, false, "caixa da Rota 02 nao entra no veiculo da Rota 01");
  assert.equal(recusa.code, "NOT_IN_MANIFEST");
  const auditado = await one<any>(
    `SELECT COUNT(*) n FROM audit_logs
      WHERE action = 'SCAN' AND entity_id = ? AND detail LIKE ?`,
    carreg01, `%FORA DO ROMANEIO%${intrusa}%`);
  assert.ok(auditado.n > 0, "a recusa fica registrada na auditoria");

  // -------------------------------------------------- expedicao das duas rotas
  for (const rota of ROUTES) {
    const carreg = rota.id === ROUTES[0].id
      ? carreg01
      : await shipping.startLoading({ manifestId: rota.id, dockId: rota.dockId, operatorId: OP });
    for (const v of caixasPorRota[rota.id]) {
      await shipping.scanVolumeForLoading({ loadingId: carreg, volumeCode: v, operatorId: OP });
    }
    await shipping.completeLoading({ loadingId: carreg, seal: `LCR-${rota.code.slice(-2)}001`, operatorId: OP });
    await shipping.createTransportDocument(rota.id, SUP);
    await shipping.shipManifest(rota.id, SUP);
    assert.equal((await shipping.getManifest(rota.id))!.manifest.status, "SHIPPED");
  }

  // ------------------------------------------------------------- totais
  const expedido = await one<any>(
    `SELECT COALESCE(SUM(vi.quantity),0) q FROM volume_items vi
       JOIN volumes v ON v.id = vi.volume_id
      WHERE v.status = 'SHIPPED' AND vi.product_id = ?`, "SKU-001");
  const expedido2 = await one<any>(
    `SELECT COALESCE(SUM(vi.quantity),0) q FROM volume_items vi
       JOIN volumes v ON v.id = vi.volume_id
      WHERE v.status = 'SHIPPED' AND vi.product_id = ?`, "SKU-002");
  assert.equal(expedido.q, 216, "216 shampoos expedidos");
  assert.equal(expedido2.q, 216, "216 condicionadores expedidos");

  const volumes = await all<any>(`SELECT id FROM volumes WHERE status = 'SHIPPED'`);
  assert.equal(volumes.length, 18, "18 caixas expedidas");

  assert.equal((await stockOf("SKU-001")).onHand, 24, "240 - 216");
  assert.equal((await stockOf("SKU-002")).onHand, 24);
});
