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
import { all, one } from "../src/lib/db.ts";
import { TABLES } from "../src/domain/services/simulation.ts";

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
  assert.equal((await stockOf("SKU-001")).onHand, 40);
  assert.equal((await stockOf("SKU-002")).onHand, 25);
  assert.equal((await stockOf("SKU-003")).onHand, 60);
  assert.equal((await stockOf("SKU-004")).onHand, 30);
  assert.equal((await stockOf("SKU-005")).onHand, 0, "SKU-005 so entra pelo recebimento");
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

  // Linha 1: SKU-001 esperado 20, conferido 19 (divergencia -1)
  const r1 = await receiving.checkItem({
    checkId, checkItemId: `${checkId}-L01`, quantity: 19, operatorId: OP,
  });
  assert.equal(r1.expected, 20);
  assert.equal(r1.checked, 19);
  assert.equal(r1.divergence, -1);
  assert.equal(r1.status, "DIVERGENCE");
  assert.ok(r1.incidentId, "divergencia deve gerar ocorrencia");
  assert.equal((await listIncidents({ status: "OPEN" })).length, before + 1);

  // Linha 2: SKU-003 conferido integralmente
  const r2 = await receiving.checkItem({
    checkId, checkItemId: `${checkId}-L02`, quantity: 30, operatorId: OP,
  });
  assert.equal(r2.divergence, 0);

  const result = await receiving.finishCheck(checkId, OP);
  assert.equal(result.divergences, 1);
  assert.equal((await receiving.getInbound("OR-000001"))!.order.status, "DIVERGENCE");
});

await test("05 · aprovacao apos tratamento da divergencia", async () => {
  await receiving.approveWithDivergence("OR-000001", SUP, "Falta de 1 CX aceita; debito ao fornecedor");
  assert.equal((await receiving.getInbound("OR-000001"))!.order.status, "APPROVED");
});

let palletA = "";
let palletB = "";
await test("06 · paletizacao da quantidade CONFERIDA entra no estoque", async () => {
  const stockBefore = (await stockOf("SKU-001")).onHand;
  palletA = await receiving.createPallet({
    lines: [{ productId: "SKU-001", lotCode: "L2601A", quantity: 19 }],
    originKind: "RECEIVING", originRef: "OR-000001", operatorId: OP,
  });
  palletB = await receiving.createPallet({
    lines: [{ productId: "SKU-003", lotCode: "L2601C", quantity: 30 }],
    originKind: "RECEIVING", originRef: "OR-000001", operatorId: OP,
  });
  assert.match(palletA, /^PLT-\d{6}$/);
  // Entrou fisicamente, mas ainda na area de recebimento.
  assert.equal((await stockOf("SKU-001")).onHand, stockBefore + 19);
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
  assert.equal((await stockOf("SKU-001")).onHand, 59, "40 iniciais + 19 conferidos");
  assert.equal((await stockOf("SKU-003")).onHand, 90, "60 iniciais + 30 recebidos");
});

await test("09 · segundo recebimento traz o SKU-005, inexistente no estoque inicial", async () => {
  await receiving.registerArrival({ inboundId: "OR-000002", dockId: "DOCA-02", operatorId: OP });
  await receiving.startReceiving("OR-000002", OP);
  const c = await receiving.startCheck("OR-000002", OP);
  await receiving.checkItem({ checkId: c, checkItemId: `${c}-L01`, quantity: 40, operatorId: OP });
  await receiving.finishCheck(c, OP);

  const p = await receiving.createPallet({
    lines: [{ productId: "SKU-005", lotCode: "L2601E", quantity: 40 }],
    originKind: "RECEIVING", originRef: "OR-000002", operatorId: OP,
  });
  await receiving.generateStorageOrders("OR-000002", OP);
  const so = (await receiving.storageOrderForPallet(p))!;
  await receiving.executeStorage({
    storageOrderId: so.id, locationId: so.suggested_location_id, operatorId: OP,
  });
  assert.equal((await stockOf("SKU-005")).onHand, 40);
  assert.equal((await receiving.getInbound("OR-000002"))!.order.status, "COMPLETED");
});

// ------------------------------------------------------------- 3. saida
await test("10 · reserva nunca excede o disponivel", async () => {
  const result = await orders.releaseOrder("PED-000125", SUP);
  assert.equal(result.fullyReserved, true);
  for (const l of result.lines) assert.equal(l.shortage, 0);

  const s1 = await stockOf("SKU-001");
  assert.equal(s1.reserved, 15);
  assert.equal(s1.available, s1.onHand - s1.reserved);
  assert.ok(s1.reserved <= s1.onHand, "reserva jamais acima do saldo");

  // Um pedido gigante nao consegue reservar alem do disponivel.
  const big = await orders.createOrder({
    customerId: "CLI-0001", warehouseId: "CD-01", dueAt: new Date(Date.now() + 864e5).toISOString(),
    items: [{ productId: "SKU-005", quantity: 999 }], actor: SUP,
  });
  const r = await orders.releaseOrder(big, SUP);
  assert.equal(r.fullyReserved, false);
  assert.ok(r.lines[0].shortage > 0);
  assert.equal((await stockOf("SKU-005")).reserved, 40, "reservou apenas o que existe");
  await orders.cancelOrder(big, SUP, "Pedido de teste de limite");
  assert.equal((await stockOf("SKU-005")).reserved, 10, "liberou a reserva do pedido cancelado");
});

let pickId = "";
await test("11 · picklist segue a rota do armazem", async () => {
  pickId = await picking.generatePicklist("PED-000125", SUP);
  const { picking: pk, items } = (await picking.getPicking(pickId))!;
  assert.equal(pk.sales_order_id, "PED-000125");
  assert.ok(items.length >= 3);
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

  const wrongSku = item.product_id === "SKU-003" ? "SKU-002" : "SKU-003";
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
  const before = { s1: (await stockOf("SKU-001")).onHand, s3: (await stockOf("SKU-003")).onHand, s5: (await stockOf("SKU-005")).onHand };

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
  assert.equal((await stockOf("SKU-003")).onHand, before.s3);
  assert.equal((await stockOf("SKU-005")).onHand, before.s5);
  assert.equal((await stockOf("SKU-001")).reserved, 0, "reserva consumida pela coleta");

  const staging = locationIdFromCode("E-01-01-01");
  const inStaging = await one<any>(
    `SELECT SUM(qty_on_hand) q FROM inventory WHERE location_id = ?`, staging);
  assert.equal(inStaging.q, 45, "15 + 20 + 10 no staging de expedicao");

  // E saiu efetivamente das posicoes de picking.
  const picked = await all<any>(
    `SELECT COALESCE(SUM(i.qty_on_hand),0) q FROM inventory i
       JOIN locations l ON l.id = i.location_id
      WHERE i.product_id = 'SKU-005' AND l.kind = 'PALLET'`);
  assert.equal(picked[0].q, before.s5 - 10);
});

let packId = "";
await test("16 · packing cria volumes e limita ao coletado", async () => {
  packId = await packing.generatePacking("PED-000125", OP);
  await packing.startPacking(packId, OP);
  const v1 = await packing.createVolume({ packingId: packId, operatorId: OP });
  assert.match(v1, /^VOL-\d{6}$/);

  await assert.rejects(
    async () => await packing.addToVolume({ volumeId: v1, productId: "SKU-001", quantity: 999, operatorId: OP }),
    /excede o coletado/i,
  );
  await packing.addToVolume({ volumeId: v1, productId: "SKU-001", quantity: 15, operatorId: OP });
  await packing.addToVolume({ volumeId: v1, productId: "SKU-003", quantity: 20, operatorId: OP });

  const v2 = await packing.createVolume({ packingId: packId, operatorId: OP });
  await packing.addToVolume({ volumeId: v2, productId: "SKU-005", quantity: 10, operatorId: OP });

  const result = await packing.completePacking(packId, OP);
  assert.equal(result.volumes, 2);
  assert.ok(result.weightKg > 0, "peso calculado a partir dos produtos");
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

  await shipping.checkVolume({ checkId: shipCheckId, volumeCode: volumes[0].id, operatorId: OP });
  await assert.rejects(
    async () => await shipping.finishShippingCheck(shipCheckId, OP),
    /nao conferido/i,
    "nao encerra com volume pendente",
  );

  await shipping.checkVolume({ checkId: shipCheckId, volumeCode: volumes[1].id, operatorId: OP });
  const res = await shipping.finishShippingCheck(shipCheckId, OP);
  assert.equal(res.divergences, 0);
  assert.equal((await orders.getOrder("PED-000125"))!.order.status, "READY_TO_LOAD");
});

let manifestId = "";
await test("18 · romaneio consolida pedidos prontos", async () => {
  manifestId = await shipping.createManifest({
    warehouseId: "CD-01", route: "SP Capital / Vale do Paraiba",
    carrier: "Expresso Paulista Transportes", vehiclePlate: "FTK-2D09",
    vehicleKind: "Truck bau 14t", driverName: "Roberto Nunes", driverDoc: "SP-28.441.903",
    dockId: "DOCA-03", actor: SUP,
  });
  assert.equal(manifestId, "ROM-000018", "numeracao deterministica do cenario");

  await assert.rejects(
    async () => await shipping.addOrderToManifest({ manifestId, orderId: "PED-000126", actor: SUP }),
    /nao esta pronto para carregar/i,
  );
  await shipping.addOrderToManifest({ manifestId, orderId: "PED-000125", actor: SUP });
  await shipping.releaseManifest(manifestId, SUP);

  const m = (await shipping.getManifest(manifestId))!;
  assert.equal(m.manifest.status, "READY");
  assert.equal(m.manifest.total_orders, 1);
  assert.equal(m.manifest.total_volumes, 2);
});

let loadingId = "";
await test("19 · carregamento valida cada volume bipado", async () => {
  loadingId = await shipping.startLoading({ manifestId, dockId: "DOCA-03", operatorId: OP });
  const { expected } = (await shipping.getLoading(loadingId))!;
  assert.equal(expected.length, 2);

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

  await assert.rejects(
    async () => await shipping.completeLoading({ loadingId, seal: "LCR-88421", operatorId: OP }),
    /Faltam 1 volume/i,
  );

  await shipping.scanVolumeForLoading({ loadingId, volumeCode: expected[1].id, operatorId: OP });
  const res = await shipping.completeLoading({ loadingId, seal: "LCR-88421", operatorId: OP });
  assert.equal(res.status, "COMPLETED");
  assert.equal((await shipping.getManifest(manifestId))!.manifest.status, "LOADED");
});

await test("20 · expedicao baixa o estoque definitivamente", async () => {
  const stagingBefore = await one<any>(
    `SELECT COALESCE(SUM(qty_on_hand),0) q FROM inventory WHERE location_id = ?`,
    locationIdFromCode("E-01-01-01"));
  assert.equal(stagingBefore.q, 45);

  await shipping.createTransportDocument(manifestId, SUP);
  await shipping.shipManifest(manifestId, SUP);

  const stagingAfter = await one<any>(
    `SELECT COALESCE(SUM(qty_on_hand),0) q FROM inventory WHERE location_id = ?`,
    locationIdFromCode("E-01-01-01"));
  assert.equal(stagingAfter.q, 0, "tudo saiu do armazem");

  assert.equal((await orders.getOrder("PED-000125"))!.order.status, "SHIPPED");
  assert.equal((await shipping.getManifest(manifestId))!.manifest.status, "SHIPPED");

  // Saldos finais conforme o roteiro: 40+19-15, 60+30-20, 0+40-10
  assert.equal((await stockOf("SKU-001")).onHand, 44);
  assert.equal((await stockOf("SKU-003")).onHand, 70);
  assert.equal((await stockOf("SKU-005")).onHand, 30);
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
  for (const sku of ["SKU-001", "SKU-003", "SKU-005"]) {
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
  assert.equal((await resolveScan("7891000100011")).id, "SKU-001", "EAN do fabricante tambem resolve");
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
  assert.equal((await stockOf("SKU-001")).onHand, 40);
  assert.equal((await stockOf("SKU-005")).onHand, 0);
  assert.equal((await stockOf("SKU-001")).reserved, 0);
  assert.equal((await orders.getOrder("PED-000125"))!.order.status, "PENDING");
  assert.equal((await receiving.getInbound("OR-000001"))!.order.status, "SCHEDULED");
  assert.equal((await all<any>(`SELECT * FROM volumes`)).length, 0);
  assert.equal((await all<any>(`SELECT * FROM shipping_manifests`)).length, 0);

  // E possivel executar a operacao novamente com os mesmos identificadores.
  await receiving.registerArrival({ inboundId: "OR-000001", dockId: "DOCA-01", operatorId: OP });
  await receiving.startReceiving("OR-000001", OP);
  const c = await receiving.startCheck("OR-000001", OP);
  await receiving.checkItem({ checkId: c, checkItemId: `${c}-L01`, quantity: 20, operatorId: OP });
  await receiving.checkItem({ checkId: c, checkItemId: `${c}-L02`, quantity: 30, operatorId: OP });
  const res = await receiving.finishCheck(c, OP);
  assert.equal(res.divergences, 0, "segunda execucao sem divergencia");
  assert.equal((await receiving.getInbound("OR-000001"))!.order.status, "APPROVED");
});

await test("29 · o reset cobre TODAS as tabelas do esquema", async () => {
  const schema = (await all<{ name: string }>(
    `SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  )).map((r) => r.name).sort();
  const missing = schema.filter((t) => !TABLES.includes(t));
  assert.deepEqual(
    missing, [],
    `tabelas fora do reset deixariam residuo entre execucoes: ${missing.join(", ")}`,
  );
});

await test("30 · dois resets consecutivos produzem exatamente o mesmo estado", async () => {
  const snapshot = async () => ({
    stock: await Promise.all(
      ["SKU-001", "SKU-002", "SKU-003", "SKU-004", "SKU-005"].map(async (s) => (await stockOf(s)).onHand),
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
  assert.deepEqual(a.orders.map((o: any) => o.id), ["PED-000125", "PED-000126", "PED-000127"]);
  assert.deepEqual(a.invoices.map((i: any) => i.id), ["NFS-000001", "NFS-000002"]);
});
