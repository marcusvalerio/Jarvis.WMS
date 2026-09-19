/**
 * EXECUTA A OPERACAO LOG122 COMPLETA, de ponta a ponta.
 *
 * Serve ao preparo da apresentacao: com o cenario percorrido ate a expedicao,
 * `npm run docs:pdf` encontra TODAS as entidades e gera o conjunto completo —
 * as 18 etiquetas de volume, os 2 romaneios, os documentos de transporte.
 *
 * Nao ha atalho aqui: cada etapa chama exatamente o mesmo servico de dominio
 * que a interface e a coletora chamam. O resultado e deterministico, entao os
 * documentos impressos continuam valendo depois de um reinicio da simulacao.
 *
 *   npm run sim:run          # reinicia o cenario e percorre tudo
 *   npm run sim:run -- --keep  # aproveita o estado atual, sem reiniciar
 */
import { seed, isSeeded, resetSimulation } from "../src/domain/services/simulation.ts";
import * as receiving from "../src/domain/services/receiving.ts";
import * as orders from "../src/domain/services/orders.ts";
import * as picking from "../src/domain/services/picking.ts";
import * as packing from "../src/domain/services/packing.ts";
import * as shipping from "../src/domain/services/shipping.ts";
import { stockOf } from "../src/domain/services/inventory.ts";
import { ROUTES, BOXES_PER_ORDER, BOX } from "../src/seed/scenario.ts";
import { all, closeDb } from "../src/lib/db.ts";

const OP = "OPR-0002";
const SUP = "OPR-0001";
const keep = process.argv.includes("--keep");

function passo(texto: string) { console.log(`  ${texto}`); }

if (!keep) {
  const r = (await isSeeded()) ? await resetSimulation("SISTEMA") : await seed("SISTEMA");
  passo(`Cenario ${r.scenarioId} carregado — ${r.initialUnits} unidades iniciais`);
}

// ------------------------------------------------------------- recebimento
console.log("\nRECEBIMENTO — 10 caixas");
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
  await receiving.registerWeighing({
    refKind: "INBOUND_ORDER", refId: ordem,
    grossKg: 1180, tareKg: 50, expectedKg: io.order.expected_weight_kg,
    equipmentId: "EQP-0007", operatorId: OP,
  });
  const pallet = await receiving.createPallet({
    lines: io.items.map((l: any) => ({
      productId: l.product_id, lotCode: l.lot_code, quantity: l.expected_qty,
    })),
    originKind: "RECEIVING", originRef: ordem, operatorId: OP,
  });
  await receiving.generateStorageOrders(ordem, OP);
  const so = (await receiving.storageOrderForPallet(pallet))!;
  await receiving.executeStorage({
    storageOrderId: so.id, locationId: so.suggested_location_id, operatorId: OP, origin: "RF",
  });
  passo(`${ordem}: conferido, paletizado em ${pallet} e armazenado`);
}
passo(`Estoque: ${(await stockOf("SKU-001")).onHand} shampoos · ${(await stockOf("SKU-002")).onHand} condicionadores`);

// ------------------------------------------------------------- expedicao
for (const rota of ROUTES) {
  console.log(`\n${rota.code} — ${rota.name}`);
  const manifestId = await shipping.createManifest({
    warehouseId: "CD-01", route: rota.route, carrier: rota.carrier,
    vehiclePlate: rota.vehiclePlate, vehicleKind: rota.vehicleKind,
    driverName: rota.driverName, driverDoc: rota.driverDoc,
    dockId: rota.dockId, actor: SUP,
  });

  const caixas: string[] = [];
  for (const pedido of rota.stops) {
    await orders.releaseOrder(pedido, SUP);

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

    const conf = await shipping.startShippingCheck(pedido, OP);
    for (const vol of doPedido) {
      await shipping.checkVolume({ checkId: conf, volumeCode: vol, operatorId: OP });
    }
    await shipping.finishShippingCheck(conf, OP);

    await shipping.addOrderToManifest({ manifestId, orderId: pedido, actor: SUP });
    caixas.push(...doPedido);
    passo(`${pedido}: ${doPedido.length} caixas (${doPedido.join(", ")})`);
  }

  await shipping.releaseManifest(manifestId, SUP);
  const carreg = await shipping.startLoading({ manifestId, dockId: rota.dockId, operatorId: OP });
  for (const vol of caixas) {
    await shipping.scanVolumeForLoading({ loadingId: carreg, volumeCode: vol, operatorId: OP });
  }
  await shipping.completeLoading({
    loadingId: carreg, seal: `LCR-${rota.id.slice(-5)}`, operatorId: OP,
  });
  await shipping.createTransportDocument(manifestId, SUP);
  await shipping.shipManifest(manifestId, SUP);
  passo(`${manifestId} expedido com ${caixas.length} caixas`);
}

// ------------------------------------------------------------- conferencia
const volumes = await all<any>(`SELECT id FROM volumes WHERE status = 'SHIPPED'`);
const totais = await all<any>(
  `SELECT vi.product_id, SUM(vi.quantity) q FROM volume_items vi
     JOIN volumes v ON v.id = vi.volume_id
    WHERE v.status = 'SHIPPED' GROUP BY vi.product_id ORDER BY 1`,
);
console.log(`\nOPERACAO CONCLUIDA`);
console.log(`  ${volumes.length} caixas expedidas`);
for (const t of totais) console.log(`  ${t.product_id}: ${t.q} unidades`);
console.log(`  Saldo: ${(await stockOf("SKU-001")).onHand} shampoos · ${(await stockOf("SKU-002")).onHand} condicionadores\n`);

await closeDb();
