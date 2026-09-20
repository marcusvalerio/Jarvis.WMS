/**
 * PACOTE DE DOCUMENTOS DA DEMONSTRACAO (SIM-001 / LOG122)
 *
 * A apresentacao academica e fisica: as caixas, as etiquetas e as folhas
 * de conferencia precisam estar impressas ANTES de alguem encostar num
 * produto. O WMS, porem, so cria esses documentos a medida que a operacao
 * acontece — e ai ja e tarde.
 *
 * Esta rotina separa DOIS momentos que o sistema tratava como um so:
 *
 *   momento em que o DOCUMENTO e gerado      (antes, aqui)
 *   momento em que ele passa a VALER         (durante a operacao real)
 *
 * GERAR DOCUMENTO NAO E EXECUTAR A OPERACAO. Nada aqui baixa estoque,
 * conclui recebimento, embala caixa, carrega veiculo ou expede pedido.
 * O que se cria sao as ENTIDADES REAIS em estado planejado — as mesmas
 * linhas, com os mesmos identificadores, que a operacao vai reivindicar
 * quando de fato acontecer. Por isso nao existe PDF orfao: todo documento
 * impresso aponta para uma linha do banco que a execucao vai preencher.
 *
 * O que fica PLANEJADO e quem o reivindica:
 *
 *   palete de recebimento (planned=1) ...... receiving.createPallet
 *   volume de saida (status PLANNED) ....... packing.createVolume
 *   ordem de embalagem (PENDING) ........... packing.generatePacking
 *   conferencia de expedicao (IN_PROGRESS) . shipping.startShippingCheck
 *   carregamento (PENDING) ................. shipping.startLoading
 *
 * Isto e especifico do cenario academico. Fora do SIM-001 o Jarvis
 * continua criando documento so quando a operacao chega nele.
 */
import { all, one, run, insert, scalar, tx } from "@/lib/db";
import { nextId, PREFIX } from "@/lib/ids";
import { nowIso, round3 } from "@/lib/format";
import { audit } from "./audit";
import { createPallet, ensureLot, generateStorageOrders } from "./receiving";
import { receivingLocation } from "./warehouse";
import { releaseOrder } from "./orders";
import { createOutboundInvoice } from "./invoices";
import { createManifest, addOrderToManifest, createTransportDocument } from "./shipping";
import {
  SCENARIO_ID, WAREHOUSE, INBOUND_ORDERS, SALES_ORDERS, ROUTES, BOX, BOXES_PER_ORDER,
} from "@/seed/scenario";

export class DemoPackError extends Error {
  readonly code: string;
  constructor(message: string, code = "DEMO_PACK_ERROR") {
    super(message);
    this.name = "DemoPackError";
    this.code = code;
  }
}

/** Operadores responsaveis pela preparacao — os mesmos do cenario. */
const SUPERVISOR = "OPR-0001";
const OPERADOR = "OPR-0002";

/** Tara padrao da caixa de papelao usada na demonstracao. */
const TARA_CAIXA = 0.4;

export type DemoStage = "entrada" | "armazenagem" | "saida";

interface PackRow {
  docType: string;
  entity: string;
  entityId: string;
  stage: DemoStage;
}

async function registrar(rows: PackRow[], at: string) {
  for (const r of rows) {
    const id = `${r.docType}:${r.entityId}`;
    const existe = await one<{ id: string }>(`SELECT id FROM demo_document_pack WHERE id = ?`, id);
    if (existe) continue;
    await insert("demo_document_pack", {
      id, scenario_id: SCENARIO_ID, doc_type: r.docType,
      entity: r.entity, entity_id: r.entityId, stage: r.stage, created_at: at,
    });
  }
}

/** Ja existe pacote gerado para o cenario carregado? */
export async function demoPackReady(): Promise<boolean> {
  const n = await scalar<number>(
    `SELECT COUNT(*) FROM demo_document_pack WHERE scenario_id = ?`, SCENARIO_ID,
  ) ?? 0;
  return n > 0;
}

// ===================================================================== ENTRADA

/**
 * As 10 caixas que chegam no recebimento (6 + 4). Viram linhas de `volumes`
 * ancoradas na ordem de recebimento — nao no pedido de venda — para que a
 * etiqueta de caixa recebida exista antes do caminhao encostar na doca.
 */
async function caixasDeRecebimento(at: string): Promise<PackRow[]> {
  const rows: PackRow[] = [];
  for (const io of INBOUND_ORDERS) {
    const itens = await all<any>(
      `SELECT ioi.*, p.unit_gross_kg FROM inbound_order_items ioi
         JOIN products p ON p.id = ioi.product_id
        WHERE ioi.inbound_order_id = ? ORDER BY ioi.line_no`,
      io.id,
    );
    if (itens.length === 0) {
      throw new DemoPackError(`Ordem de recebimento ${io.id} sem itens`, "NO_INBOUND_ITEMS");
    }
    const caixas = io.expectedVolumes;

    for (let n = 1; n <= caixas; n++) {
      const existente = await one<any>(
        `SELECT id FROM volumes WHERE inbound_order_id = ? AND sequence = ?`, io.id, n,
      );
      if (existente) { rows.push(row(existente.id)); continue; }

      const volId = await nextId(PREFIX.VOLUME);
      let liquido = 0;
      const linhas: { productId: string; lotId: string | null; qty: number }[] = [];
      for (const it of itens) {
        // Cada caixa leva a mesma composicao: 12 + 12 unidades.
        const qty = Math.round(it.expected_qty / caixas);
        const lotId = it.lot_code
          ? await ensureLot(it.product_id, it.lot_code, it.expires_at ?? null, at, io.supplierId)
          : null;
        linhas.push({ productId: it.product_id, lotId, qty });
        liquido += qty * (it.unit_gross_kg ?? 0);
      }
      await insert("volumes", {
        id: volId, sales_order_id: null, packing_order_id: null,
        inbound_order_id: io.id, planned: 1,
        sequence: n, container_kind: "CAIXA",
        length_cm: 40, width_cm: 30, height_cm: 30, tare_kg: TARA_CAIXA,
        net_weight_kg: round3(liquido), gross_weight_kg: round3(liquido + TARA_CAIXA),
        status: "PLANNED", created_at: at, created_by: SUPERVISOR,
      });
      for (const l of linhas) {
        await insert("volume_items", {
          id: `${volId}-${l.productId}-${l.lotId ?? "NL"}`,
          volume_id: volId, product_id: l.productId, lot_id: l.lotId, quantity: l.qty,
        });
      }
      rows.push(row(volId));
    }
  }
  return rows;

  function row(id: string): PackRow {
    return { docType: "volume-label", entity: "volumes", entityId: id, stage: "entrada" };
  }
}

/**
 * Comprovante de pesagem EM BRANCO, um por ordem de recebimento.
 * Bruto, tara e liquido ficam zerados de proposito: o peso e aferido na
 * balanca durante a demonstracao e anotado a mao na folha impressa.
 */
async function pesagensEmBranco(at: string): Promise<PackRow[]> {
  const rows: PackRow[] = [];
  for (const io of INBOUND_ORDERS) {
    const existente = await one<any>(
      `SELECT id FROM weighings WHERE ref_kind = 'INBOUND_ORDER' AND ref_id = ?`, io.id,
    );
    if (existente) {
      rows.push({ docType: "weighing", entity: "weighings", entityId: existente.id, stage: "entrada" });
      continue;
    }
    const ordem = await one<any>(`SELECT expected_weight_kg FROM inbound_orders WHERE id = ?`, io.id);
    const id = await nextId(PREFIX.WEIGHING);
    await insert("weighings", {
      id, ref_kind: "INBOUND_ORDER", ref_id: io.id,
      gross_kg: 0, tare_kg: 0, net_kg: 0,
      expected_kg: ordem?.expected_weight_kg ?? null, divergence_kg: 0,
      equipment_id: "EQP-0007", operator_id: null, weighed_at: at,
      notes: "FOLHA EM BRANCO — aferir na balanca e preencher a mao durante a operacao.",
    });
    rows.push({ docType: "weighing", entity: "weighings", entityId: id, stage: "entrada" });
  }
  return rows;
}

// ================================================================ ARMAZENAGEM

/**
 * Palete planejado + ordem de armazenagem, um por recebimento.
 *
 * `skipReceipt` e a peca central: o palete nasce SEM lancar entrada de
 * estoque. Ele so passa a existir fisicamente quando o recebimento real
 * chama `createPallet`, que reivindica este mesmo palete (planned = 1) e
 * e ai lanca os movimentos.
 */
async function paletesEArmazenagem(at: string): Promise<PackRow[]> {
  const rows: PackRow[] = [];
  for (const io of INBOUND_ORDERS) {
    let palletId = (await one<any>(
      `SELECT id FROM pallets WHERE origin_ref = ? AND planned = 1`, io.id,
    ))?.id as string | undefined;

    if (!palletId) {
      const ja = await scalar<number>(
        `SELECT COUNT(*) FROM pallets WHERE origin_ref = ?`, io.id,
      ) ?? 0;
      if (ja > 0) continue;   // recebimento ja executado: nao planeja por cima

      const itens = await all<any>(
        `SELECT * FROM inbound_order_items WHERE inbound_order_id = ? ORDER BY line_no`, io.id,
      );
      palletId = await createPallet({
        lines: itens.map((l: any) => ({
          productId: l.product_id, lotCode: l.lot_code,
          expiresAt: l.expires_at ?? null, quantity: l.expected_qty,
        })),
        originKind: "RECEIVING", originRef: io.id, operatorId: SUPERVISOR,
        occurredAt: at,
        skipReceipt: true,   // documento, nao movimento
      });
      await run(`UPDATE pallets SET planned = 1 WHERE id = ?`, palletId);
    }

    rows.push({ docType: "pallet-label", entity: "pallets", entityId: palletId!, stage: "armazenagem" });
    for (const arm of await generateStorageOrders(io.id, SUPERVISOR)) {
      rows.push({ docType: "storage-order", entity: "storage_orders", entityId: arm, stage: "armazenagem" });
    }
    const armExistentes = await all<any>(
      `SELECT id FROM storage_orders WHERE inbound_order_id = ?`, io.id,
    );
    for (const a of armExistentes) {
      rows.push({ docType: "storage-order", entity: "storage_orders", entityId: a.id, stage: "armazenagem" });
    }
  }
  return rows;
}

// ======================================================================= SAIDA

/**
 * Linha projetada de coleta: de onde cada unidade do pedido vai sair.
 */
interface LinhaProjetada {
  salesOrderItemId: string;
  productId: string;
  lotId: string | null;
  locationId: string;
  palletId: string | null;
  reservationId: string | null;
  qty: number;
}

/**
 * De onde virao as unidades que ainda NAO estao no estoque.
 *
 * O cenario LOG122 comeca com 120 unidades de cada SKU e precisa expedir
 * 216: as outras 96 chegam nas 10 caixas do recebimento. Elas nao podem
 * ser reservadas — ainda nao existem. Mas sao conhecidas: a ordem de
 * recebimento declara produto, lote e quantidade, e a ordem de armazenagem
 * ja diz em que endereco o palete vai ser guardado.
 *
 * A projecao usa exatamente esses dados. Nao e um palpite: e o plano do
 * proprio WMS, o mesmo que o operador vai confirmar na coletora.
 */
async function filaDeEntrada(at: string) {
  const fila: { productId: string; lotId: string | null; locationId: string; saldo: number }[] = [];
  for (const io of INBOUND_ORDERS) {
    const arm = await one<any>(
      `SELECT suggested_location_id FROM storage_orders
        WHERE inbound_order_id = ? AND suggested_location_id IS NOT NULL
        ORDER BY id LIMIT 1`,
      io.id,
    );
    const destino = arm?.suggested_location_id ?? receivingLocation();
    const itens = await all<any>(
      `SELECT * FROM inbound_order_items WHERE inbound_order_id = ? ORDER BY line_no`, io.id,
    );
    for (const it of itens) {
      fila.push({
        productId: it.product_id,
        lotId: it.lot_code
          ? await ensureLot(it.product_id, it.lot_code, it.expires_at ?? null, at, io.supplierId)
          : null,
        locationId: destino,
        saldo: Number(it.expected_qty),
      });
    }
  }
  return fila;
}

/**
 * Reserva os pedidos e projeta a coleta.
 *
 * A reserva e o unico ponto da preparacao que toca o estoque — e toca a
 * DISPONIBILIDADE, nunca o saldo fisico: `onHand` continua o mesmo,
 * `available` cai porque a mercadoria esta comprometida. Onde o estoque
 * atual nao cobre, `releaseOrder` reserva o que da e deixa o pedido em
 * PENDING; a reserva do restante acontece na demonstracao, depois do
 * recebimento, com o mesmo `releaseOrder`.
 *
 * A picklist nasce em PENDING com as linhas projetadas, e NAO muda o
 * status do pedido. Quando a coleta comecar de verdade,
 * `generatePicklist` reivindica esta ordem e refaz as linhas a partir das
 * reservas reais — o numero PCK-xxxxxx impresso continua sendo o mesmo.
 */
async function picklists(at: string): Promise<PackRow[]> {
  const rows: PackRow[] = [];
  const entrada = await filaDeEntrada(at);

  for (const so of SALES_ORDERS) {
    const pedido = await one<any>(`SELECT * FROM sales_orders WHERE id = ?`, so.id);
    if (!pedido) throw new DemoPackError(`Pedido ${so.id} inexistente`, "NO_ORDER");
    if (pedido.status === "PENDING" && !pedido.reserved) {
      await releaseOrder(pedido.id, SUPERVISOR);
    }

    const existente = await one<any>(
      `SELECT id FROM picking_orders WHERE sales_order_id = ? AND status IN ('PENDING','IN_PROGRESS')`,
      so.id,
    );
    if (existente) {
      rows.push({ docType: "picklist", entity: "picking_orders", entityId: existente.id, stage: "saida" });
      continue;
    }

    const linhas = await projetarColeta(so.id, entrada);
    const pickId = await nextId(PREFIX.PICKING_ORDER);
    await insert("picking_orders", {
      id: pickId, sales_order_id: so.id, status: "PENDING", strategy: "FEFO",
      priority: pedido.priority, total_lines: linhas.length, done_lines: 0,
      total_units: round3(linhas.reduce((t, l) => t + l.qty, 0)), picked_units: 0,
      created_at: at,
    });
    for (const [idx, l] of linhas.entries()) {
      await insert("picking_items", {
        id: await nextId(PREFIX.PICKING_ITEM),
        picking_order_id: pickId, sequence: idx + 1,
        reservation_id: l.reservationId, sales_order_item_id: l.salesOrderItemId,
        product_id: l.productId, lot_id: l.lotId, location_id: l.locationId,
        pallet_id: l.palletId, expected_qty: round3(l.qty), picked_qty: 0, status: "PENDING",
      });
    }
    rows.push({ docType: "picklist", entity: "picking_orders", entityId: pickId, stage: "saida" });
  }
  return rows;
}

/** Reservas ativas primeiro; o que faltar sai da fila de entrada. */
async function projetarColeta(
  orderId: string,
  entrada: { productId: string; lotId: string | null; locationId: string; saldo: number }[],
): Promise<LinhaProjetada[]> {
  const linhas: LinhaProjetada[] = [];
  const itens = await all<any>(
    `SELECT * FROM sales_order_items WHERE sales_order_id = ? ORDER BY line_no`, orderId,
  );
  for (const it of itens) {
    const reservas = await all<any>(
      `SELECT r.*, l.pick_sequence FROM stock_reservations r
         JOIN locations l ON l.id = r.location_id
        WHERE r.sales_order_item_id = ? AND r.status = 'ACTIVE'
        ORDER BY l.pick_sequence, r.id`,
      it.id,
    );
    let coberto = 0;
    for (const r of reservas) {
      const qty = round3(r.quantity - r.picked_qty);
      if (qty <= 0) continue;
      linhas.push({
        salesOrderItemId: it.id, productId: r.product_id, lotId: r.lot_id,
        locationId: r.location_id, palletId: r.pallet_id, reservationId: r.id, qty,
      });
      coberto += qty;
    }

    let falta = round3(it.quantity - coberto);
    while (falta > 0) {
      const fonte = entrada.find((e) => e.productId === it.product_id && e.saldo > 0);
      if (!fonte) {
        throw new DemoPackError(
          `Nao ha estoque nem recebimento previsto para cobrir ${falta} unidade(s) de `
          + `${it.product_id} em ${orderId}. O cenario nao fecha.`,
          "SHORT_SCENARIO",
        );
      }
      const qty = Math.min(fonte.saldo, falta);
      fonte.saldo = round3(fonte.saldo - qty);
      linhas.push({
        salesOrderItemId: it.id, productId: it.product_id, lotId: fonte.lotId,
        locationId: fonte.locationId, palletId: null, reservationId: null, qty,
      });
      falta = round3(falta - qty);
    }
  }
  return linhas;
}

/**
 * Ordem de embalagem planejada, com as linhas derivadas da PICKLIST.
 *
 * `generatePacking` nao serve aqui: ele exige que algo ja tenha sido
 * coletado. Como o que se quer e justamente a folha ANTES da coleta, as
 * linhas saem do que o FEFO reservou — produto, lote e quantidade. Quando
 * a operacao roda de verdade, `generatePacking` reivindica esta ordem e
 * reconstroi as linhas a partir do que foi coletado de fato.
 */
async function embalagensPlanejadas(at: string): Promise<PackRow[]> {
  const rows: PackRow[] = [];
  for (const so of SALES_ORDERS) {
    let packId = (await one<any>(
      `SELECT id FROM packing_orders WHERE sales_order_id = ? AND status IN ('PENDING','IN_PROGRESS')`,
      so.id,
    ))?.id as string | undefined;

    if (!packId) {
      packId = await nextId(PREFIX.PACKING_ORDER);
      await insert("packing_orders", {
        id: packId, sales_order_id: so.id, status: "PENDING", station: "EMB-01",
        total_volumes: 0, total_weight_kg: 0, created_at: at,
      });
      const linhas = await all<any>(
        `SELECT pi.sales_order_item_id, pi.product_id, pi.lot_id,
                SUM(pi.expected_qty) AS qty, MIN(pi.sequence) AS seq
           FROM picking_items pi
           JOIN picking_orders po ON po.id = pi.picking_order_id
          WHERE po.sales_order_id = ?
          GROUP BY pi.sales_order_item_id, pi.product_id, pi.lot_id
          ORDER BY MIN(pi.sequence)`,
        so.id,
      );
      for (const l of linhas) {
        await insert("packing_items", {
          id: `${packId}-${l.product_id}-${l.lot_id ?? "NL"}`,
          packing_order_id: packId, sales_order_item_id: l.sales_order_item_id,
          product_id: l.product_id, lot_id: l.lot_id,
          expected_qty: round3(l.qty), packed_qty: 0, status: "PENDING",
        });
      }
    }
    rows.push({ docType: "packing-order", entity: "packing_orders", entityId: packId, stage: "saida" });
  }
  return rows;
}

/**
 * As 18 caixas de saida: 3 por pedido, 12 shampoos + 12 condicionadores
 * cada. O lote de cada caixa sai da picklist, na ordem de coleta — se o
 * FEFO dividir uma linha entre dois lotes, a divisao aparece na etiqueta
 * em vez de ser arredondada para "o lote predominante".
 */
async function volumesPlanejados(at: string): Promise<PackRow[]> {
  const rows: PackRow[] = [];
  for (const so of SALES_ORDERS) {
    const jaExistem = await all<any>(
      `SELECT id FROM volumes WHERE sales_order_id = ? AND status <> 'CANCELLED' ORDER BY sequence`,
      so.id,
    );
    if (jaExistem.length >= BOXES_PER_ORDER) {
      for (const v of jaExistem) rows.push(etiqueta(v.id));
      continue;
    }

    // Fila de (lote, saldo) por produto, na ordem em que o picking vai coletar.
    const fila = new Map<string, { lotId: string | null; saldo: number }[]>();
    for (const p of [...new Set(so.items.map((i) => i.productId))]) {
      const linhas = await all<any>(
        `SELECT pi.lot_id, SUM(pi.expected_qty) AS qty
           FROM picking_items pi
           JOIN picking_orders po ON po.id = pi.picking_order_id
          WHERE po.sales_order_id = ? AND pi.product_id = ?
          GROUP BY pi.lot_id ORDER BY MIN(pi.sequence)`,
        so.id, p,
      );
      fila.set(p, linhas.map((l: any) => ({ lotId: l.lot_id, saldo: Number(l.qty) })));
    }

    const porCaixa: Record<string, number> = {
      "SKU-001": BOX.shampooPerBox,
      "SKU-002": BOX.conditionerPerBox,
    };

    for (let n = jaExistem.length + 1; n <= BOXES_PER_ORDER; n++) {
      const volId = await nextId(PREFIX.VOLUME);
      const linhas: { productId: string; lotId: string | null; qty: number }[] = [];
      let liquido = 0;
      for (const item of so.items) {
        let falta = porCaixa[item.productId] ?? Math.round(item.quantity / BOXES_PER_ORDER);
        const p = await one<any>(`SELECT unit_gross_kg FROM products WHERE id = ?`, item.productId);
        const lotes = fila.get(item.productId) ?? [];
        while (falta > 0) {
          const atual = lotes.find((l) => l.saldo > 0);
          const qty = atual ? Math.min(atual.saldo, falta) : falta;
          if (atual) atual.saldo -= qty;
          linhas.push({ productId: item.productId, lotId: atual?.lotId ?? null, qty });
          liquido += qty * (p?.unit_gross_kg ?? 0);
          falta -= qty;
          if (!atual) break;
        }
      }
      await insert("volumes", {
        id: volId, sales_order_id: so.id, packing_order_id: null,
        inbound_order_id: null, planned: 1,
        sequence: n, container_kind: "CAIXA",
        length_cm: 40, width_cm: 30, height_cm: 30, tare_kg: TARA_CAIXA,
        net_weight_kg: round3(liquido), gross_weight_kg: round3(liquido + TARA_CAIXA),
        status: "PLANNED", created_at: at, created_by: SUPERVISOR,
      });
      for (const l of linhas) {
        await insert("volume_items", {
          id: `${volId}-${l.productId}-${l.lotId ?? "NL"}`,
          volume_id: volId, product_id: l.productId, lot_id: l.lotId, quantity: l.qty,
        });
      }
      rows.push(etiqueta(volId));
    }
    // O packing list do pedido e uma visao dos volumes — passa a existir aqui.
    rows.push({ docType: "packing-list", entity: "sales_orders", entityId: so.id, stage: "saida" });
  }
  return rows;

  function etiqueta(id: string): PackRow {
    return { docType: "volume-label", entity: "volumes", entityId: id, stage: "saida" };
  }
}

/**
 * Folha de conferencia de expedicao, em branco.
 * `checked_qty` fica zerado: quem preenche e o conferente bipando as
 * caixas. O snapshot de coletado/embalado e atualizado por
 * `startShippingCheck` no momento em que a conferencia comeca de verdade.
 */
async function conferenciasEmBranco(at: string): Promise<PackRow[]> {
  const rows: PackRow[] = [];
  for (const so of SALES_ORDERS) {
    let checkId = (await one<any>(
      `SELECT id FROM shipping_checks WHERE sales_order_id = ? AND status = 'IN_PROGRESS'`, so.id,
    ))?.id as string | undefined;

    if (!checkId) {
      const itens = await all<any>(
        `SELECT * FROM sales_order_items WHERE sales_order_id = ? ORDER BY line_no`, so.id,
      );
      checkId = await nextId(PREFIX.SHIPPING_CHECK);
      await insert("shipping_checks", {
        id: checkId, sales_order_id: so.id, status: "IN_PROGRESS",
        operator_id: null, started_at: at, divergence_count: 0,
        notes: "FOLHA PRE-IMPRESSA — a conferencia real preenche as quantidades bipadas.",
      });
      for (const it of itens) {
        await insert("shipping_check_items", {
          id: `${checkId}-${it.product_id}`,
          check_id: checkId, product_id: it.product_id,
          ordered_qty: it.quantity, picked_qty: it.picked_qty, packed_qty: it.packed_qty,
          checked_qty: 0, divergence: 0, status: "PENDING",
        });
      }
    }
    rows.push({ docType: "shipping-check", entity: "shipping_checks", entityId: checkId, stage: "saida" });
    rows.push({ docType: "shipping-receipt", entity: "sales_orders", entityId: so.id, stage: "saida" });
  }
  return rows;
}

/** Nota fiscal simulada de saida, uma por pedido. */
async function notasDeSaida(): Promise<PackRow[]> {
  const rows: PackRow[] = [];
  for (const so of SALES_ORDERS) {
    const nf = await createOutboundInvoice({
      salesOrderId: so.id, warehouseId: WAREHOUSE.id, actor: SUPERVISOR,
    });
    rows.push({ docType: "invoice", entity: "invoices", entityId: nf, stage: "saida" });
  }
  return rows;
}

/**
 * Romaneios, documento de transporte e checklist de carregamento.
 *
 * O romaneio e montado (DRAFT, com as 3 paradas e as 9 caixas), mas NAO e
 * liberado e o veiculo NAO e carregado: `loading_operations` nasce em
 * PENDING, sem doca ocupada e sem mexer no status do romaneio. Quem faz a
 * carga virar realidade e `startLoading`, que reivindica esta operacao.
 */
async function romaneios(at: string): Promise<PackRow[]> {
  const rows: PackRow[] = [];
  for (const rota of ROUTES) {
    const existente = await one<any>(`SELECT id FROM shipping_manifests WHERE id = ?`, rota.id);
    const manifestId = existente?.id ?? await createManifest({
      id: rota.id,
      warehouseId: WAREHOUSE.id, route: rota.route, carrier: rota.carrier,
      vehiclePlate: rota.vehiclePlate, vehicleKind: rota.vehicleKind,
      driverName: rota.driverName, driverDoc: rota.driverDoc,
      dockId: rota.dockId, actor: SUPERVISOR,
    });
    for (const pedido of rota.stops) {
      await addOrderToManifest({ manifestId, orderId: pedido, actor: SUPERVISOR, planned: true });
    }
    rows.push({ docType: "manifest", entity: "shipping_manifests", entityId: manifestId, stage: "saida" });

    const dts = await createTransportDocument(manifestId, SUPERVISOR);
    rows.push({ docType: "transport", entity: "transport_documents", entityId: dts, stage: "saida" });

    let carId = (await one<any>(
      `SELECT id FROM loading_operations WHERE manifest_id = ? AND status IN ('PENDING','IN_PROGRESS')`,
      manifestId,
    ))?.id as string | undefined;
    if (!carId) {
      const esperado = await scalar<number>(
        `SELECT COUNT(*) FROM volumes v JOIN manifest_orders mo ON mo.sales_order_id = v.sales_order_id
          WHERE mo.manifest_id = ? AND v.status <> 'CANCELLED'`,
        manifestId,
      ) ?? 0;
      carId = await nextId(PREFIX.LOADING);
      await insert("loading_operations", {
        id: carId, manifest_id: manifestId, dock_id: rota.dockId,
        status: "PENDING", operator_id: null, equipment_id: null,
        expected_volumes: esperado, loaded_volumes: 0,
        started_at: null, created_at: at,
        notes: "CHECKLIST PRE-IMPRESSO — o carregamento real assume esta operacao.",
      });
    }
    rows.push({ docType: "loading-checklist", entity: "loading_operations", entityId: carId, stage: "saida" });
  }
  return rows;
}

// =================================================================== ROTINA

/**
 * Gera o pacote inteiro. Idempotente: rodar de novo nao duplica nada,
 * porque cada etapa procura a entidade antes de cria-la.
 *
 * NAO executa a operacao. Nao conclui recebimento, nao embala, nao
 * carrega e nao expede. A unica coisa que muda no estoque e a RESERVA
 * dos seis pedidos — necessaria para que a picklist (e portanto o lote
 * impresso em cada etiqueta) exista antes da coleta.
 */
export async function prepareDemoDocuments(): Promise<DemoPackReport> {
  const cenario = await one<any>(
    `SELECT id FROM simulation_scenarios WHERE id = ?`, SCENARIO_ID,
  );
  if (!cenario) {
    throw new DemoPackError(
      `O pacote de documentos e especifico do cenario ${SCENARIO_ID}. Carregue a simulacao antes.`,
      "NO_SCENARIO",
    );
  }

  const at = nowIso();
  const rows: PackRow[] = [];

  rows.push(...await tx(async () => await caixasDeRecebimento(at)));
  rows.push(...await tx(async () => await pesagensEmBranco(at)));
  rows.push(...await tx(async () => await paletesEArmazenagem(at)));
  rows.push(...await tx(async () => await picklists(at)));
  rows.push(...await tx(async () => await embalagensPlanejadas(at)));
  rows.push(...await tx(async () => await volumesPlanejados(at)));
  rows.push(...await notasDeSaida());
  rows.push(...await tx(async () => await conferenciasEmBranco(at)));
  rows.push(...await romaneios(at));

  await tx(async () => {
    await registrar(rows, at);
    await audit({
      actor: SUPERVISOR, actorKind: "SYSTEM", action: "CREATE",
      entity: "simulation_scenario", entityId: SCENARIO_ID,
      after: { documentos: rows.length },
      detail:
        `Pacote de documentos da demonstracao preparado: ${rows.length} documento(s) `
        + `vinculados a entidades reais. Nenhuma operacao foi executada.`,
    });
  });

  return await demoPackReport();
}

/** Prepara o pacote apenas se ainda nao existir. */
export async function ensureDemoDocuments(): Promise<DemoPackReport> {
  if (await demoPackReady()) return await demoPackReport();
  return await prepareDemoDocuments();
}

// ================================================================ RELATORIO

export interface DemoPackReport {
  scenarioId: string;
  prepared: boolean;
  documents: number;
  byType: { docType: string; stage: DemoStage; count: number }[];
  checks: { label: string; ok: boolean; detail: string }[];
}

async function verificar(
  label: string, esperado: number, sql: string, ...params: any[]
): Promise<{ label: string; ok: boolean; detail: string }> {
  const achado = await scalar<number>(sql, ...params) ?? 0;
  return {
    label, ok: Number(achado) === esperado,
    detail: `esperado ${esperado}, encontrado ${achado}`,
  };
}

/**
 * Relatorio de validacao do pacote. Checa numeros do cenario LOG122 e,
 * principalmente, procura DOCUMENTO ORFAO — ponteiro no pacote cuja
 * entidade nao existe mais no banco.
 */
export async function demoPackReport(): Promise<DemoPackReport> {
  const pronto = await demoPackReady();
  const byType = (await all<any>(
    `SELECT doc_type, stage, COUNT(*) AS n FROM demo_document_pack
      WHERE scenario_id = ? GROUP BY doc_type, stage ORDER BY stage, doc_type`,
    SCENARIO_ID,
  )).map((r: any) => ({ docType: r.doc_type, stage: r.stage as DemoStage, count: Number(r.n) }));

  const totalCaixas = BOX.inboundBoxes;
  const totalSaida = BOX.outboundBoxes;
  const unidades = SALES_ORDERS.length * BOXES_PER_ORDER * BOX.shampooPerBox;

  const checks = [
    await verificar(
      "Caixas de recebimento", totalCaixas,
      `SELECT COUNT(*) FROM volumes WHERE inbound_order_id IS NOT NULL AND status <> 'CANCELLED'`,
    ),
    await verificar(
      "Caixas de saida", totalSaida,
      `SELECT COUNT(*) FROM volumes WHERE sales_order_id IS NOT NULL AND status <> 'CANCELLED'`,
    ),
    await verificar(
      "Caixas de saida com 3 por pedido", SALES_ORDERS.length,
      `SELECT COUNT(*) FROM (
         SELECT sales_order_id FROM volumes
          WHERE sales_order_id IS NOT NULL AND status <> 'CANCELLED'
          GROUP BY sales_order_id HAVING COUNT(*) = ?) t`,
      BOXES_PER_ORDER,
    ),
    await verificar(
      `Caixas com ${BOX.shampooPerBox} shampoos`, totalSaida,
      `SELECT COUNT(*) FROM (
         SELECT vi.volume_id FROM volume_items vi
           JOIN volumes v ON v.id = vi.volume_id
          WHERE v.sales_order_id IS NOT NULL AND v.status <> 'CANCELLED' AND vi.product_id = 'SKU-001'
          GROUP BY vi.volume_id HAVING SUM(vi.quantity) = ?) t`,
      BOX.shampooPerBox,
    ),
    await verificar(
      `Caixas com ${BOX.conditionerPerBox} condicionadores`, totalSaida,
      `SELECT COUNT(*) FROM (
         SELECT vi.volume_id FROM volume_items vi
           JOIN volumes v ON v.id = vi.volume_id
          WHERE v.sales_order_id IS NOT NULL AND v.status <> 'CANCELLED' AND vi.product_id = 'SKU-002'
          GROUP BY vi.volume_id HAVING SUM(vi.quantity) = ?) t`,
      BOX.conditionerPerBox,
    ),
    await verificar(
      `Unidades planejadas de shampoo (${unidades})`, 1,
      `SELECT COUNT(*) FROM (
         SELECT SUM(vi.quantity) AS q FROM volume_items vi
           JOIN volumes v ON v.id = vi.volume_id
          WHERE v.sales_order_id IS NOT NULL AND v.status <> 'CANCELLED'
            AND vi.product_id = 'SKU-001' HAVING SUM(vi.quantity) = ?) t`,
      unidades,
    ),
    await verificar(
      `Unidades planejadas de condicionador (${unidades})`, 1,
      `SELECT COUNT(*) FROM (
         SELECT SUM(vi.quantity) AS q FROM volume_items vi
           JOIN volumes v ON v.id = vi.volume_id
          WHERE v.sales_order_id IS NOT NULL AND v.status <> 'CANCELLED'
            AND vi.product_id = 'SKU-002' HAVING SUM(vi.quantity) = ?) t`,
      unidades,
    ),
    await verificar("Pedidos de venda", SALES_ORDERS.length, `SELECT COUNT(*) FROM sales_orders`),
    await verificar(
      "Notas fiscais de saida", SALES_ORDERS.length,
      `SELECT COUNT(*) FROM invoices WHERE kind = 'OUTBOUND'`,
    ),
    await verificar("Picklists", SALES_ORDERS.length, `SELECT COUNT(*) FROM picking_orders`),
    await verificar("Ordens de embalagem", SALES_ORDERS.length, `SELECT COUNT(*) FROM packing_orders`),
    await verificar("Conferencias de expedicao", SALES_ORDERS.length, `SELECT COUNT(*) FROM shipping_checks`),
    await verificar("Romaneios", ROUTES.length, `SELECT COUNT(*) FROM shipping_manifests`),
    await verificar(
      "Romaneios com 3 paradas", ROUTES.length,
      `SELECT COUNT(*) FROM (
         SELECT manifest_id FROM manifest_orders GROUP BY manifest_id HAVING COUNT(*) = 3) t`,
    ),
    await verificar(
      `Romaneios com ${BOXES_PER_ORDER * 3} caixas`, ROUTES.length,
      `SELECT COUNT(*) FROM (
         SELECT mo.manifest_id FROM manifest_orders mo
           JOIN volumes v ON v.sales_order_id = mo.sales_order_id AND v.status <> 'CANCELLED'
          GROUP BY mo.manifest_id HAVING COUNT(*) = ?) t`,
      BOXES_PER_ORDER * 3,
    ),
    await verificar("Documentos de transporte", ROUTES.length, `SELECT COUNT(*) FROM transport_documents`),
    await verificar("Operacoes de carregamento", ROUTES.length, `SELECT COUNT(*) FROM loading_operations`),
    await verificar("Ordens de armazenagem", INBOUND_ORDERS.length, `SELECT COUNT(*) FROM storage_orders`),
    await verificar("Comprovantes de pesagem", INBOUND_ORDERS.length, `SELECT COUNT(*) FROM weighings`),

    // --------------------------------------------------------- integridade
    await verificar(
      "Caixas de saida sem pedido (orfaos)", 0,
      `SELECT COUNT(*) FROM volumes v
        WHERE v.inbound_order_id IS NULL
          AND (v.sales_order_id IS NULL
               OR NOT EXISTS (SELECT 1 FROM sales_orders so WHERE so.id = v.sales_order_id))`,
    ),
    await verificar(
      "Caixas sem conteudo (orfaos)", 0,
      `SELECT COUNT(*) FROM volumes v WHERE v.status <> 'CANCELLED'
         AND NOT EXISTS (SELECT 1 FROM volume_items vi WHERE vi.volume_id = v.id)`,
    ),
    await verificar(
      "Itens de caixa sem produto (orfaos)", 0,
      `SELECT COUNT(*) FROM volume_items vi
        WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = vi.product_id)`,
    ),
    await verificar(
      "Paradas sem pedido (orfaos)", 0,
      `SELECT COUNT(*) FROM manifest_orders mo
        WHERE NOT EXISTS (SELECT 1 FROM sales_orders so WHERE so.id = mo.sales_order_id)`,
    ),
    await verificar(
      "Documentos do pacote sem entidade (orfaos)", 0,
      `SELECT COUNT(*) FROM demo_document_pack d
        WHERE (d.entity = 'volumes'             AND NOT EXISTS (SELECT 1 FROM volumes x             WHERE x.id = d.entity_id))
           OR (d.entity = 'weighings'           AND NOT EXISTS (SELECT 1 FROM weighings x           WHERE x.id = d.entity_id))
           OR (d.entity = 'pallets'             AND NOT EXISTS (SELECT 1 FROM pallets x             WHERE x.id = d.entity_id))
           OR (d.entity = 'storage_orders'      AND NOT EXISTS (SELECT 1 FROM storage_orders x      WHERE x.id = d.entity_id))
           OR (d.entity = 'picking_orders'      AND NOT EXISTS (SELECT 1 FROM picking_orders x      WHERE x.id = d.entity_id))
           OR (d.entity = 'packing_orders'      AND NOT EXISTS (SELECT 1 FROM packing_orders x      WHERE x.id = d.entity_id))
           OR (d.entity = 'invoices'            AND NOT EXISTS (SELECT 1 FROM invoices x            WHERE x.id = d.entity_id))
           OR (d.entity = 'shipping_checks'     AND NOT EXISTS (SELECT 1 FROM shipping_checks x     WHERE x.id = d.entity_id))
           OR (d.entity = 'shipping_manifests'  AND NOT EXISTS (SELECT 1 FROM shipping_manifests x  WHERE x.id = d.entity_id))
           OR (d.entity = 'transport_documents' AND NOT EXISTS (SELECT 1 FROM transport_documents x WHERE x.id = d.entity_id))
           OR (d.entity = 'loading_operations'  AND NOT EXISTS (SELECT 1 FROM loading_operations x  WHERE x.id = d.entity_id))
           OR (d.entity = 'sales_orders'        AND NOT EXISTS (SELECT 1 FROM sales_orders x        WHERE x.id = d.entity_id))`,
    ),

    // ------------------------------- a preparacao NAO executou a operacao
    await verificar(
      "Nenhum pedido expedido", 0,
      `SELECT COUNT(*) FROM sales_orders WHERE status = 'SHIPPED'`,
    ),
    await verificar(
      "Nenhuma caixa embalada ou expedida", 0,
      `SELECT COUNT(*) FROM volumes WHERE status IN ('CLOSED','CHECKED','LOADED','SHIPPED')`,
    ),
    await verificar(
      "Nenhum romaneio carregado", 0,
      `SELECT COUNT(*) FROM shipping_manifests WHERE status <> 'DRAFT'`,
    ),
    await verificar(
      "Nenhum recebimento concluido", 0,
      `SELECT COUNT(*) FROM inbound_orders WHERE status = 'COMPLETED'`,
    ),
  ];

  return {
    scenarioId: SCENARIO_ID,
    prepared: pronto,
    documents: byType.reduce((s, b) => s + b.count, 0),
    byType,
    checks,
  };
}
