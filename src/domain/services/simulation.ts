import { all, one, run, insert, exec, scalar, tx } from "@/lib/db";
import { nextId, setSequence, PREFIX, locationIdFromCode, buildLocationCode } from "@/lib/ids";
import { nowIso, addDays, addMinutes, round3 } from "@/lib/format";
import { audit } from "./audit";
import { hashPassword } from "@/domain/auth";
import { INITIAL_PASSWORD } from "@/seed/credentials";
import { createPallet, ensureLot } from "./receiving";
import { createInboundInvoice } from "./invoices";
import { createOrder } from "./orders";
import {
  SCENARIO_ID, SCENARIO_NAME, WAREHOUSE, ZONES, LAYOUT, DOCKS, USERS, OPERATORS,
  SUPPLIERS, CUSTOMERS, PRODUCTS, EQUIPMENT, INITIAL_STOCK, PURCHASE_ORDERS,
  INBOUND_ORDERS, SALES_ORDERS, SEQUENCE_SEEDS,
} from "@/seed/scenario";

/**
 * Tabelas que NAO pertencem ao cenario e por isso ficam fora do reset.
 * Sessao de login e identidade de quem esta operando, nao dado da
 * simulacao: reiniciar o SIM-001 nao pode expulsar a equipe do sistema.
 */
export const NAO_RESETADAS: string[] = ["user_sessions"];

/** Tabelas limpas no reset, na ordem inversa das dependencias. */
export const TABLES: string[] = [
  "scan_events", "simulation_events", "simulation_scenarios",
  "audit_logs", "incidents",
  "loading_scans", "loading_operations", "transport_documents",
  "shipments", "manifest_orders", "shipping_manifests",
  "shipping_check_items", "shipping_checks",
  "volume_items", "volumes",
  "packing_items", "packing_orders",
  "picking_items", "picking_orders",
  "stock_reservations",
  "sales_order_items", "sales_orders",
  "inventory_count_items", "inventory_counts",
  "inventory_movements", "inventory",
  "storage_orders",
  "receiving_check_items", "receiving_checks",
  "weighings", "invoice_items", "invoices",
  "inbound_order_items", "inbound_orders",
  "purchase_order_items", "purchase_orders",
  "pallet_items", "pallets",
  "equipment", "docks", "locations", "zones", "warehouses",
  "lots", "product_barcodes", "products",
  "customers", "suppliers", "operators", "users",
  "id_sequences",
];

/**
 * Limpa o banco.
 *
 * O SQLite exigia desligar `PRAGMA foreign_keys` para apagar as tabelas em
 * massa; no PostgreSQL um unico TRUNCATE ... CASCADE resolve as dependencias
 * de uma vez e e transacional, entao o resultado e o mesmo — todas as
 * tabelas do cenario vazias — sem precisar afrouxar as chaves estrangeiras.
 */
export async function wipe(): Promise<void> {
  await exec(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
}

export async function isSeeded(): Promise<boolean> {
  return (await scalar<number>(`SELECT COUNT(*) FROM simulation_scenarios WHERE id = ?`, SCENARIO_ID) ?? 0) > 0;
}

export interface SeedResult {
  scenarioId: string;
  locations: number;
  products: number;
  pallets: number;
  initialUnits: number;
  inboundOrders: number;
  salesOrders: number;
  documents: number;
}

/**
 * Carrega o cenario SIM-001 completo.
 * Deterministico: os mesmos IDs sao produzidos a cada execucao, de modo que
 * os documentos ja impressos continuam validos apos um reset.
 */
export async function seed(actor = "SISTEMA"): Promise<SeedResult> {
  // A limpeza entra DENTRO da transacao. No SQLite ela precisava ficar de
  // fora, porque `PRAGMA foreign_keys` era ignorado dentro de uma transacao
  // aberta; com TRUNCATE ... CASCADE essa restricao deixou de existir. A
  // diferenca importa: com o banco remoto o seed leva segundos, e com a
  // limpeza fora da transacao havia uma janela em que o cenario ja tinha
  // sido apagado e ainda nao fora recriado — quem abrisse uma tela nesse
  // intervalo recebia 404. Agora o reset e atomico: ate o commit, todos
  // continuam vendo o cenario anterior.
  return await tx(async () => {
    await wipe();
    const now = nowIso();
    const SEED_ORIGIN = "SEED" as const;

    // ----------------------------------------------------------- estrutura
    await insert("warehouses", {
      id: WAREHOUSE.id, name: WAREHOUSE.name, cnpj: WAREHOUSE.cnpj, ie: WAREHOUSE.ie,
      address: WAREHOUSE.address, city: WAREHOUSE.city, state: WAREHOUSE.state,
      zip: WAREHOUSE.zip, phone: WAREHOUSE.phone, created_at: now,
    });

    for (const z of ZONES) {
      await insert("zones", {
        id: z.id, warehouse_id: WAREHOUSE.id, code: z.code, name: z.name,
        kind: z.kind, temperature: "AMBIENTE", abc_class: z.abc, sort_order: z.order,
      });
    }

    let locationCount = 0;
    let pickSeq = 0;
    for (const [zoneId, layout] of Object.entries(LAYOUT)) {
      for (let aisle = 1; aisle <= layout.aisles; aisle++) {
        for (let rack = 1; rack <= layout.racks; rack++) {
          for (let level = 1; level <= layout.levels; level++) {
            const code = buildLocationCode(zoneId, aisle, rack, level);
            pickSeq += 10;
            await insert("locations", {
              id: locationIdFromCode(code), code, warehouse_id: WAREHOUSE.id, zone_id: zoneId,
              aisle: String(aisle).padStart(2, "0"),
              rack: String(rack).padStart(2, "0"),
              level: String(level).padStart(2, "0"),
              position: "01", kind: "PALLET", status: "AVAILABLE",
              capacity_pallets: 1, capacity_units: 60, max_weight_kg: 1200,
              pick_sequence: pickSeq, created_at: now,
            });
            locationCount++;
          }
        }
      }
    }

    // Enderecos de sistema (staging) — usados pelos fluxos de entrada/saida.
    for (const s of [
      { zone: "R", code: "R-01-01-01", name: "Area de Recebimento" },
      { zone: "E", code: "E-01-01-01", name: "Staging de Expedicao" },
    ]) {
      await insert("locations", {
        id: locationIdFromCode(s.code), code: s.code, warehouse_id: WAREHOUSE.id,
        zone_id: s.zone, aisle: "01", rack: "01", level: "01", position: "01",
        kind: "STAGING", status: "AVAILABLE", capacity_pallets: 99,
        capacity_units: 99999, max_weight_kg: 99999, pick_sequence: 0, created_at: now,
      });
    }

    for (const d of DOCKS) {
      await insert("docks", {
        id: d.id, warehouse_id: WAREHOUSE.id, name: d.name, kind: d.kind, status: "FREE",
      });
    }

    // ----------------------------------------------------------- cadastros
    for (const u of USERS) {
      await insert("users", {
        id: u.id, name: u.name, email: u.email, role: u.role,
        job_title: u.jobTitle, sector: u.sector,
        // O reset recarrega os perfis COM a credencial: reiniciar o cenario
        // nao pode deixar a equipe sem conseguir entrar.
        password_hash: await hashPassword(INITIAL_PASSWORD),
        active: 1, created_at: now,
      });
    }
    for (const o of OPERATORS) {
      await insert("operators", {
        id: o.id, user_id: o.userId, name: o.name, badge: o.badge,
        shift: o.shift, active: 1, created_at: now,
      });
    }
    for (const s of SUPPLIERS) {
      await insert("suppliers", {
        id: s.id, name: s.name, trade_name: s.trade, cnpj: s.cnpj, ie: s.ie,
        address: s.address, city: s.city, state: s.state, zip: s.zip,
        phone: s.phone, email: s.email, created_at: now,
      });
    }
    for (const c of CUSTOMERS) {
      await insert("customers", {
        id: c.id, name: c.name, trade_name: c.trade, cnpj: c.cnpj, ie: c.ie,
        address: c.address, city: c.city, state: c.state, zip: c.zip,
        phone: c.phone, email: c.email, created_at: now,
      });
    }
    for (const p of PRODUCTS) {
      await insert("products", {
        id: p.id, sku: p.sku, description: p.description, category: p.category, unit: p.unit,
        ncm: p.ncm, cfop_in: p.cfopIn, cfop_out: p.cfopOut,
        unit_weight_kg: p.unitWeight, unit_gross_kg: p.unitGross,
        length_cm: p.l, width_cm: p.w, height_cm: p.h,
        units_per_pallet: p.unitsPerPallet, unit_price: p.unitPrice,
        lot_controlled: 1, shelf_life_days: p.shelfLifeDays, min_stock: p.minStock,
        abc_class: p.abc, active: 1, created_at: now,
      });
      // Codigo interno (Code 128, igual ao SKU) + EAN do fabricante.
      await insert("product_barcodes", {
        id: `${p.id}-INT`, product_id: p.id, code: p.sku,
        symbology: "CODE128", kind: "INTERNAL", is_primary: 1,
      });
      await insert("product_barcodes", {
        id: `${p.id}-EAN`, product_id: p.id, code: p.barcode,
        symbology: "EAN13", kind: "EAN13", is_primary: 0,
      });
    }
    for (const e of EQUIPMENT) {
      await insert("equipment", {
        id: e.id, kind: e.kind, model: e.model, serial: e.serial,
        status: "AVAILABLE", monitored_minutes: 480, downtime_minutes: 0,
        last_event_at: now, created_at: now,
      });
    }

    // ------------------------------------------------------- estoque inicial
    // Entra pelo mesmo caminho do estoque normal: palete + movimento RECEIPT.
    const stockDate = addDays(now, -5);
    let pallets = 0;
    let initialUnits = 0;
    for (const s of INITIAL_STOCK) {
      await createPallet({
        lines: [{
          productId: s.productId,
          lotCode: s.lot,
          expiresAt: s.expiresInDays ? addDays(now, s.expiresInDays) : null,
          quantity: s.quantity,
        }],
        originKind: "INITIAL_STOCK",
        originRef: SCENARIO_ID,
        operatorId: "OPR-0001",
        locationId: locationIdFromCode(s.locationCode),
        occurredAt: stockDate,
      });
      pallets++;
      initialUnits += s.quantity;
    }

    // ------------------------------------------------------ pedidos de compra
    for (const po of PURCHASE_ORDERS) {
      const expected = addDays(now, po.expectedInDays);
      let total = 0;
      let weight = 0;
      await insert("purchase_orders", {
        id: po.id, supplier_id: po.supplierId, issued_at: addDays(now, -7),
        expected_at: expected, status: "CONFIRMED", buyer: po.buyer,
        payment_terms: po.paymentTerms, total_value: 0, total_weight_kg: 0,
        created_at: addDays(now, -7),
      });
      for (const [idx, it] of po.items.entries()) {
        const p = PRODUCTS.find((x) => x.id === it.productId)!;
        const lineValue = round3(it.quantity * p.unitPrice);
        const lineWeight = round3(it.quantity * p.unitGross);
        total += lineValue;
        weight += lineWeight;
        await insert("purchase_order_items", {
          id: `${po.id}-L${String(idx + 1).padStart(2, "0")}`,
          purchase_order_id: po.id, line_no: idx + 1, product_id: it.productId,
          quantity: it.quantity, unit: p.unit, unit_price: p.unitPrice,
          lot_code: it.lot, expires_at: it.expiresInDays ? addDays(now, it.expiresInDays) : null,
          weight_kg: lineWeight, received_qty: 0,
        });
      }
      await run(
        `UPDATE purchase_orders SET total_value = ?, total_weight_kg = ? WHERE id = ?`,
        Math.round(total * 100) / 100, round3(weight), po.id,
      );
    }
    await setSequence("PC", PURCHASE_ORDERS.length);

    // ------------------------------------------------- ordens de recebimento
    for (const io of INBOUND_ORDERS) {
      const po = PURCHASE_ORDERS.find((p) => p.id === io.purchaseOrderId)!;
      const expectedWeight = po.items.reduce((s, it) => {
        const p = PRODUCTS.find((x) => x.id === it.productId)!;
        return s + it.quantity * p.unitGross;
      }, 0);
      await insert("inbound_orders", {
        id: io.id, purchase_order_id: io.purchaseOrderId, supplier_id: io.supplierId,
        warehouse_id: WAREHOUSE.id, dock_id: io.dockId, status: "SCHEDULED",
        scheduled_at: addMinutes(now, io.scheduledInMinutes),
        vehicle_plate: io.vehiclePlate, vehicle_kind: io.vehicleKind,
        driver_name: io.driverName, driver_doc: io.driverDoc, carrier: io.carrier,
        expected_volumes: io.expectedVolumes, expected_weight_kg: round3(expectedWeight),
        received_volumes: 0, created_at: addDays(now, -2),
      });
      for (const [idx, it] of po.items.entries()) {
        const p = PRODUCTS.find((x) => x.id === it.productId)!;
        await insert("inbound_order_items", {
          id: `${io.id}-L${String(idx + 1).padStart(2, "0")}`,
          inbound_order_id: io.id, line_no: idx + 1, product_id: it.productId,
          lot_code: it.lot, expires_at: it.expiresInDays ? addDays(now, it.expiresInDays) : null,
          expected_qty: it.quantity, checked_qty: 0, accepted_qty: 0, rejected_qty: 0,
          unit: p.unit, status: "PENDING",
        });
      }
    }
    await setSequence("OR", INBOUND_ORDERS.length);

    // -------------------------------------------- notas fiscais simuladas
    let documents = 0;
    for (const io of INBOUND_ORDERS) {
      await createInboundInvoice({
        inboundOrderId: io.id,
        supplierId: io.supplierId,
        warehouseId: WAREHOUSE.id,
        id: io.invoiceId,
        issuedAt: addDays(now, -1),
        actor,
      });
      documents++;
    }
    await setSequence("NFS", INBOUND_ORDERS.length);

    // ------------------------------------------------------ pedidos de venda
    await setSequence("PED", SEQUENCE_SEEDS.PED);
    await setSequence("ROM", SEQUENCE_SEEDS.ROM);
    for (const so of SALES_ORDERS) {
      await createOrder({
        customerId: so.customerId,
        warehouseId: WAREHOUSE.id,
        priority: so.priority,
        dueAt: addMinutes(now, so.dueInHours * 60),
        carrier: so.carrier,
        items: so.items,
        actor,
        issuedAt: addMinutes(now, -120),
      });
    }

    // ------------------------------------------------------------- cenario
    await insert("simulation_scenarios", {
      id: SCENARIO_ID, name: SCENARIO_NAME,
      description:
        "Operacao completa de ponta a ponta: estoque inicial, dois recebimentos com NF simulada, "
        + "paletizacao, enderecamento, tres pedidos de venda, picking por coletora, packing, "
        + "conferencia, romaneio, carregamento e expedicao.",
      status: "READY", seeded_at: now, reset_count: 0,
    });
    await logEvent("SETUP", `Cenario ${SCENARIO_ID} carregado`, "SCENARIO", SCENARIO_ID);

    await audit({
      actor, actorKind: "SYSTEM", action: "SEED", entity: "simulation_scenario",
      entityId: SCENARIO_ID, origin: SEED_ORIGIN,
      after: {
        locations: locationCount, products: PRODUCTS.length, pallets,
        initialUnits, inbound: INBOUND_ORDERS.length, orders: SALES_ORDERS.length,
      },
      detail: `Cenario ${SCENARIO_ID} carregado com ${locationCount} enderecos e ${initialUnits} unidades em estoque inicial`,
      occurredAt: now,
    });

    return {
      scenarioId: SCENARIO_ID,
      locations: locationCount,
      products: PRODUCTS.length,
      pallets,
      initialUnits,
      inboundOrders: INBOUND_ORDERS.length,
      salesOrders: SALES_ORDERS.length,
      documents,
    };
  });
}

/**
 * REINICIAR SIMULACAO.
 * Restaura estoque, pedidos, recebimentos, paletes, volumes, estados,
 * movimentacoes e auditoria ao estado inicial do cenario.
 */
export async function resetSimulation(actor = "SISTEMA"): Promise<SeedResult & { resetCount: number }> {
  const previous = await one<any>(`SELECT reset_count FROM simulation_scenarios WHERE id = ?`, SCENARIO_ID);
  const count = (previous?.reset_count ?? 0) + 1;
  const result = await seed(actor);
  const at = nowIso();
  await run(
    `UPDATE simulation_scenarios SET reset_count = ?, last_reset_at = ? WHERE id = ?`,
    count, at, SCENARIO_ID,
  );
  await audit({
    actor, actorKind: "SYSTEM", action: "RESET", entity: "simulation_scenario",
    entityId: SCENARIO_ID, after: { resetCount: count },
    detail: `Simulacao reiniciada (reset #${count})`, occurredAt: at,
  });
  await logEvent("RESET", `Simulacao reiniciada (reset #${count})`, "SCENARIO", SCENARIO_ID);
  return { ...result, resetCount: count };
}

/** Garante que o banco esteja carregado antes de qualquer leitura de tela. */
export async function ensureSeeded(): Promise<void> {
  if (!await isSeeded()) await seed("SISTEMA");
}

export async function getScenario() {
  return await one<any>(`SELECT * FROM simulation_scenarios WHERE id = ?`, SCENARIO_ID);
}

export async function logEvent(stage: string, label: string, refKind?: string, refId?: string, operatorId?: string) {
  const at = nowIso();
  const n = (await scalar<number>(`SELECT COUNT(*) FROM simulation_events`) ?? 0) + 1;
  await insert("simulation_events", {
    id: `SEV-${String(n).padStart(5, "0")}`, scenario_id: SCENARIO_ID,
    stage, label, ref_kind: refKind ?? null, ref_id: refId ?? null,
    operator_id: operatorId ?? null, occurred_at: at,
  });
}

export async function listEvents(limit = 60) {
  return await all<any>(
    `SELECT * FROM simulation_events WHERE scenario_id = ?
      ORDER BY occurred_at DESC, id DESC LIMIT ?`,
    SCENARIO_ID, limit,
  );
}

/** Painel do cenario: o que ja aconteceu e o que falta executar. */
export async function scenarioProgress() {
  const steps = [
    {
      key: "stock", label: "Estoque inicial carregado",
      done: (await scalar<number>(`SELECT COUNT(*) FROM inventory WHERE qty_on_hand > 0`) ?? 0) > 0,
      detail: `${await scalar<number>(`SELECT COUNT(DISTINCT product_id) FROM inventory WHERE qty_on_hand > 0`) ?? 0} SKUs em estoque`,
      href: "/inventory",
    },
    {
      key: "inbound", label: "Recebimento executado",
      done: (await scalar<number>(`SELECT COUNT(*) FROM inbound_orders WHERE status = 'COMPLETED'`) ?? 0) > 0,
      detail: `${await scalar<number>(`SELECT COUNT(*) FROM inbound_orders WHERE status = 'COMPLETED'`) ?? 0} de ${await scalar<number>(`SELECT COUNT(*) FROM inbound_orders`) ?? 0} concluidos`,
      href: "/receiving",
    },
    {
      key: "weighing", label: "Pesagem registrada",
      done: (await scalar<number>(`SELECT COUNT(*) FROM weighings`) ?? 0) > 0,
      detail: `${await scalar<number>(`SELECT COUNT(*) FROM weighings`) ?? 0} pesagens`,
      href: "/receiving/weighing",
    },
    {
      key: "check", label: "Conferencia de entrada",
      done: (await scalar<number>(`SELECT COUNT(*) FROM receiving_checks WHERE status IN ('OK','DIVERGENCE')`) ?? 0) > 0,
      detail: `${await scalar<number>(`SELECT COUNT(*) FROM receiving_check_items WHERE status <> 'PENDING'`) ?? 0} linhas conferidas`,
      href: "/receiving",
    },
    {
      key: "putaway", label: "Armazenagem confirmada",
      done: (await scalar<number>(`SELECT COUNT(*) FROM storage_orders WHERE status = 'COMPLETED'`) ?? 0) > 0,
      detail: `${await scalar<number>(`SELECT COUNT(*) FROM storage_orders WHERE status = 'COMPLETED'`) ?? 0} paletes armazenados`,
      href: "/warehouse/storage",
    },
    {
      key: "reserve", label: "Reserva de estoque",
      done: (await scalar<number>(`SELECT COUNT(*) FROM stock_reservations`) ?? 0) > 0,
      detail: `${await scalar<number>(`SELECT COUNT(*) FROM stock_reservations WHERE status = 'ACTIVE'`) ?? 0} reservas ativas`,
      href: "/shipping/orders",
    },
    {
      key: "picking", label: "Picking por coletora",
      done: (await scalar<number>(`SELECT COUNT(*) FROM picking_orders WHERE status IN ('COMPLETED','DIVERGENCE')`) ?? 0) > 0,
      detail: `${await scalar<number>(`SELECT COALESCE(SUM(done_lines),0) FROM picking_orders`) ?? 0} linhas separadas`,
      href: "/picking",
    },
    {
      key: "packing", label: "Packing e volumes",
      done: (await scalar<number>(`SELECT COUNT(*) FROM volumes`) ?? 0) > 0,
      detail: `${await scalar<number>(`SELECT COUNT(*) FROM volumes WHERE status <> 'CANCELLED'`) ?? 0} volumes`,
      href: "/packing",
    },
    {
      key: "shipcheck", label: "Conferencia de expedicao",
      done: (await scalar<number>(`SELECT COUNT(*) FROM shipping_checks WHERE status = 'OK'`) ?? 0) > 0,
      detail: `${await scalar<number>(`SELECT COUNT(*) FROM volumes WHERE status IN ('CHECKED','LOADED','SHIPPED')`) ?? 0} volumes conferidos`,
      href: "/shipping",
    },
    {
      key: "manifest", label: "Romaneio de carga",
      done: (await scalar<number>(`SELECT COUNT(*) FROM shipping_manifests`) ?? 0) > 0,
      detail: `${await scalar<number>(`SELECT COUNT(*) FROM shipping_manifests`) ?? 0} romaneios`,
      href: "/shipping/manifests",
    },
    {
      key: "loading", label: "Carregamento",
      done: (await scalar<number>(`SELECT COUNT(*) FROM loading_operations WHERE status = 'COMPLETED'`) ?? 0) > 0,
      detail: `${await scalar<number>(`SELECT COALESCE(SUM(loaded_volumes),0) FROM loading_operations`) ?? 0} volumes carregados`,
      href: "/shipping/loading",
    },
    {
      key: "shipped", label: "Expedicao concluida",
      done: (await scalar<number>(`SELECT COUNT(*) FROM sales_orders WHERE status = 'SHIPPED'`) ?? 0) > 0,
      detail: `${await scalar<number>(`SELECT COUNT(*) FROM sales_orders WHERE status = 'SHIPPED'`) ?? 0} pedidos expedidos`,
      href: "/shipping",
    },
  ];
  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, pct: (done / steps.length) * 100 };
}
