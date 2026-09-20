import { all, one, run, insert, scalar, tx } from "@/lib/db";
import { nextId, PREFIX } from "@/lib/ids";
import { nowIso, round3 } from "@/lib/format";
import { audit } from "./audit";
import { setOrderStatus } from "./orders";

export class PackingError extends Error {
  readonly code: string;
  constructor(message: string, code = "PACKING_ERROR") {
    super(message);
    this.name = "PackingError";
    this.code = code;
  }
}

/** Cria a ordem de embalagem a partir do que foi efetivamente coletado. */
export async function generatePacking(orderId: string, actor: string): Promise<string> {
  return await tx(async () => {
    const at = nowIso();
    // Uma ordem de embalagem PENDING em que nada foi embalado ainda pode ter
    // vindo da preparacao da demonstracao — suas linhas sairam da picklist,
    // nao da coleta. Reivindica a ordem (o numero impresso continua valendo)
    // e refaz as linhas a partir do que foi coletado de fato.
    const existing = await one<any>(
      `SELECT * FROM packing_orders WHERE sales_order_id = ? AND status IN ('PENDING','IN_PROGRESS')`,
      orderId,
    );
    const intocada = existing
      ? ((await scalar<number>(
          `SELECT COUNT(*) FROM packing_items WHERE packing_order_id = ? AND packed_qty > 0`,
          existing.id,
        )) ?? 0) === 0
      : false;
    if (existing && !intocada) return existing.id;

    const picked = await all<any>(
      `SELECT si.id AS item_id, si.product_id, si.picked_qty, si.packed_qty, p.sku
         FROM sales_order_items si JOIN products p ON p.id = si.product_id
        WHERE si.sales_order_id = ? AND si.picked_qty > 0 ORDER BY si.line_no`,
      orderId,
    );
    if (picked.length === 0) {
      // Sem coleta nao ha o que embalar. Se a ordem planejada ja existe, ela
      // fica de pe com as linhas previstas — e o documento pre-impresso.
      if (existing) return existing.id;
      throw new PackingError(
        "Nada foi coletado neste pedido. Execute o picking antes do packing.",
        "NOTHING_PICKED",
      );
    }

    const id = existing?.id ?? await nextId(PREFIX.PACKING_ORDER);
    if (existing) {
      await run(`DELETE FROM packing_items WHERE packing_order_id = ?`, id);
    } else {
      await insert("packing_orders", {
        id, sales_order_id: orderId, status: "PENDING", station: "EMB-01",
        total_volumes: 0, total_weight_kg: 0, created_at: at,
      });
    }
    for (const it of picked) {
      // UMA linha de embalagem POR LOTE efetivamente coletado.
      //
      // O FEFO divide uma linha entre lotes sempre que o saldo do primeiro
      // nao cobre a quantidade. Registrar apenas o "lote predominante"
      // atribuiria todas as unidades a um lote so: a etiqueta do volume
      // mentiria sobre a origem e a expedicao acabaria pedindo do staging
      // um lote ja esgotado.
      const porLote = await all<any>(
        `SELECT lot_id, SUM(picked_qty) AS qty FROM picking_items
          WHERE sales_order_item_id = ? AND picked_qty > 0
          GROUP BY lot_id ORDER BY MIN(sequence)`,
        it.item_id,
      );
      const linhas = porLote.length > 0
        ? porLote
        : [{ lot_id: null, qty: it.picked_qty }];
      for (const l of linhas) {
        await insert("packing_items", {
          id: `${id}-${it.product_id}-${l.lot_id ?? "NL"}`,
          packing_order_id: id, sales_order_item_id: it.item_id,
          product_id: it.product_id, lot_id: l.lot_id,
          expected_qty: round3(l.qty), packed_qty: 0, status: "PENDING",
        });
      }
    }
    await audit({
      actor, action: "PACK", entity: "packing_order", entityId: id,
      after: { order: orderId, lines: picked.length },
      detail: `Ordem de embalagem ${id} criada para ${orderId}`,
    });
    return id;
  });
}

export async function getPacking(id: string) {
  const packing = await one<any>(
    `SELECT pa.*, so.status AS order_status, c.name AS customer_name, o.name AS operator_name
       FROM packing_orders pa
       JOIN sales_orders so ON so.id = pa.sales_order_id
       JOIN customers c ON c.id = so.customer_id
       LEFT JOIN operators o ON o.id = pa.operator_id
      WHERE pa.id = ?`,
    id,
  );
  if (!packing) return null;
  const items = await all<any>(
    `SELECT pi.*, p.sku, p.description, p.unit, p.unit_gross_kg, lt.code AS lot_code, lt.expires_at
       FROM packing_items pi
       JOIN products p ON p.id = pi.product_id
       LEFT JOIN lots lt ON lt.id = pi.lot_id
      WHERE pi.packing_order_id = ?`,
    id,
  );
  const volumes = await listVolumes(packing.sales_order_id);
  return { packing, items, volumes };
}

export async function listPacking(filter: { status?: string; search?: string } = {}) {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.status) { where.push("pa.status = ?"); params.push(filter.status); }
  if (filter.search) {
    where.push("(pa.id LIKE ? OR pa.sales_order_id LIKE ? OR c.name LIKE ?)");
    const q = `%${filter.search}%`;
    params.push(q, q, q);
  }
  return await all<any>(
    `SELECT pa.*, c.name AS customer_name, so.priority, so.due_at, o.name AS operator_name,
            (SELECT COUNT(*) FROM volumes v WHERE v.packing_order_id = pa.id AND v.status <> 'CANCELLED') AS volume_count
       FROM packing_orders pa
       JOIN sales_orders so ON so.id = pa.sales_order_id
       JOIN customers c ON c.id = so.customer_id
       LEFT JOIN operators o ON o.id = pa.operator_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY
        CASE pa.status WHEN 'IN_PROGRESS' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END, pa.created_at`,
    ...params,
  );
}

/**
 * Volumes de SAIDA. As caixas de entrada tambem moram em `volumes`, mas
 * pertencem a uma ordem de recebimento e nao a um pedido — listar as duas
 * juntas na tela de embalagem produziria linhas sem cliente e sem pedido.
 */
export async function listVolumes(orderId?: string) {
  const where = orderId
    ? `WHERE v.sales_order_id = ? AND v.status <> 'CANCELLED'`
    : `WHERE v.inbound_order_id IS NULL AND v.status <> 'CANCELLED'`;
  const params = orderId ? [orderId] : [];
  return await all<any>(
    `SELECT v.*, c.name AS customer_name,
            (SELECT COUNT(*) FROM volume_items vi WHERE vi.volume_id = v.id) AS line_count,
            (SELECT COALESCE(SUM(quantity),0) FROM volume_items vi WHERE vi.volume_id = v.id) AS total_qty
       FROM volumes v
       LEFT JOIN sales_orders so ON so.id = v.sales_order_id
       LEFT JOIN customers c ON c.id = so.customer_id
      ${where} ORDER BY v.sales_order_id, v.sequence`,
    ...params,
  );
}

export async function getVolume(id: string) {
  const volume = await one<any>(
    // A etiqueta de expedicao precisa dizer a QUAL rota, veiculo e parada a
    // caixa pertence. Esses dados ja existem no romaneio; o join os traz ate
    // aqui para que a etiqueta continue sendo derivada do banco, nunca
    // preenchida por fora.
    `SELECT v.*, so.id AS order_id, c.name AS customer_name, c.city AS customer_city,
            c.state AS customer_state, c.address AS customer_address, c.zip AS customer_zip,
            so.carrier, so.due_at,
            m.id AS manifest_id, m.route, m.vehicle_plate, m.vehicle_kind,
            m.driver_name, mo.stop_sequence,
            (SELECT COUNT(*) FROM volumes vv
              WHERE vv.sales_order_id = v.sales_order_id
                AND vv.status <> 'CANCELLED') AS order_volumes,
            -- Caixa de ENTRADA: nao tem pedido nem rota, tem fornecedor e
            -- nota de entrada. Os dois conjuntos de colunas convivem porque
            -- um volume e sempre de um lado so.
            io.carrier AS inbound_carrier, io.purchase_order_id, io.invoice_id,
            f.name AS supplier_name, nf.number AS invoice_number,
            (SELECT COUNT(*) FROM volumes vv
              WHERE vv.inbound_order_id = v.inbound_order_id
                AND vv.status <> 'CANCELLED') AS inbound_volumes
       FROM volumes v
       LEFT JOIN sales_orders so ON so.id = v.sales_order_id
       LEFT JOIN customers c ON c.id = so.customer_id
       LEFT JOIN manifest_orders mo ON mo.sales_order_id = v.sales_order_id
       LEFT JOIN shipping_manifests m ON m.id = mo.manifest_id
       LEFT JOIN inbound_orders io ON io.id = v.inbound_order_id
       LEFT JOIN suppliers f ON f.id = io.supplier_id
       LEFT JOIN invoices nf ON nf.id = io.invoice_id
      WHERE v.id = ?`,
    id,
  );
  if (!volume) return null;
  if (volume.inbound_order_id) volume.carrier = volume.inbound_carrier;
  const items = await all<any>(
    `SELECT vi.*, p.sku, p.description, p.unit, lt.code AS lot_code, lt.expires_at
       FROM volume_items vi
       JOIN products p ON p.id = vi.product_id
       LEFT JOIN lots lt ON lt.id = vi.lot_id
      WHERE vi.volume_id = ?`,
    id,
  );
  return { volume, items };
}

export async function startPacking(packingId: string, operatorId: string) {
  return await tx(async () => {
    const at = nowIso();
    const pa = await one<any>(`SELECT * FROM packing_orders WHERE id = ?`, packingId);
    if (!pa) throw new PackingError("Ordem de embalagem inexistente", "NOT_FOUND");
    if (pa.status === "PENDING") {
      await run(
        `UPDATE packing_orders SET status = 'IN_PROGRESS', operator_id = ?, started_at = ? WHERE id = ?`,
        operatorId, at, packingId,
      );
      await audit({
        actor: operatorId, action: "PACK", entity: "packing_order", entityId: packingId,
        before: { status: pa.status }, after: { status: "IN_PROGRESS" },
        detail: `Embalagem ${packingId} iniciada`,
      });
    }
    return await one<any>(`SELECT * FROM packing_orders WHERE id = ?`, packingId);
  });
}

export async function createVolume(params: {
  packingId: string; operatorId: string;
  containerKind?: string; length?: number; width?: number; height?: number; tareKg?: number;
}): Promise<string> {
  return await tx(async () => {
    const at = nowIso();
    const pa = await one<any>(`SELECT * FROM packing_orders WHERE id = ?`, params.packingId);
    if (!pa) throw new PackingError("Ordem de embalagem inexistente", "NOT_FOUND");
    // Se a preparacao da demonstracao ja planejou volumes para este pedido,
    // REIVINDICA o proximo em vez de cunhar um ID novo. E o que faz a caixa
    // fisica — cuja etiqueta foi impressa antes — ser a mesma linha do banco.
    // Sem volume planejado, o comportamento e o de sempre: cunha um novo.
    const planejado = await one<any>(
      `SELECT * FROM volumes
        WHERE sales_order_id = ? AND status = 'PLANNED'
        ORDER BY sequence LIMIT 1`,
      pa.sales_order_id,
    );

    if (planejado) {
      // O conteudo planejado era uma PREVISAO — o que vale e o que o
      // operador realmente puser na caixa. Esvazia antes de abrir para que
      // `addToVolume` nao some por cima da previsao e dobre a quantidade.
      await run(`DELETE FROM volume_items WHERE volume_id = ?`, planejado.id);
      await run(
        `UPDATE volumes SET status = 'OPEN', packing_order_id = ?, created_by = ?,
                net_weight_kg = 0, gross_weight_kg = ? WHERE id = ?`,
        params.packingId, params.operatorId, planejado.tare_kg, planejado.id,
      );
      await audit({
        actor: params.operatorId, action: "PACK", entity: "volume", entityId: planejado.id,
        after: { order: pa.sales_order_id, sequence: planejado.sequence, planejado: true },
        detail: `Volume ${planejado.id} aberto para ${pa.sales_order_id} (etiqueta pre-impressa)`,
      });
      return planejado.id;
    }

    const seq = (await scalar<number>(
      `SELECT COUNT(*) FROM volumes WHERE sales_order_id = ?`, pa.sales_order_id,
    ) ?? 0) + 1;
    const id = await nextId(PREFIX.VOLUME);
    await insert("volumes", {
      id, sales_order_id: pa.sales_order_id, packing_order_id: params.packingId,
      sequence: seq, container_kind: params.containerKind ?? "CAIXA",
      length_cm: params.length ?? 40, width_cm: params.width ?? 30, height_cm: params.height ?? 30,
      tare_kg: params.tareKg ?? 0.4, net_weight_kg: 0, gross_weight_kg: params.tareKg ?? 0.4,
      status: "OPEN", created_at: at, created_by: params.operatorId,
    });
    await audit({
      actor: params.operatorId, action: "PACK", entity: "volume", entityId: id,
      after: { order: pa.sales_order_id, sequence: seq },
      detail: `Volume ${id} criado para ${pa.sales_order_id}`,
    });
    return id;
  });
}

/** Adiciona quantidade de um item ao volume, limitado ao que foi coletado. */
export async function addToVolume(params: {
  volumeId: string; productId: string; quantity: number; operatorId: string;
}) {
  return await tx(async () => {
    const at = nowIso();
    const vol = await one<any>(`SELECT * FROM volumes WHERE id = ?`, params.volumeId);
    if (!vol) throw new PackingError("Volume inexistente", "NO_VOLUME");
    if (vol.status !== "OPEN") throw new PackingError(`Volume ${params.volumeId} ja esta fechado`, "VOLUME_CLOSED");

    // Um mesmo produto pode ter sido coletado de MAIS DE UM LOTE (e o que o
    // FEFO faz quando o saldo de um lote nao cobre a linha). Cada linha de
    // packing_items representa um lote coletado, entao a quantidade pedida e
    // distribuida entre elas, na ordem da coleta, ate completar. Atribuir
    // tudo ao primeiro lote quebraria a rastreabilidade e deixaria a
    // expedicao pedindo de um lote ja esgotado no staging.
    const linhas = await all<any>(
      `SELECT * FROM packing_items
        WHERE packing_order_id = ? AND product_id = ? AND expected_qty > packed_qty
        ORDER BY id`,
      vol.packing_order_id, params.productId,
    );
    if (linhas.length === 0) {
      const existe = await one<any>(
        `SELECT 1 AS ok FROM packing_items WHERE packing_order_id = ? AND product_id = ?`,
        vol.packing_order_id, params.productId,
      );
      if (!existe) throw new PackingError("Produto nao faz parte desta embalagem", "NOT_IN_PACKING");
      throw new PackingError("Quantidade excede o coletado. Restante para embalar: 0", "OVER_PACK");
    }

    const qty = round3(params.quantity);
    if (qty <= 0) throw new PackingError("Quantidade invalida", "BAD_QTY");
    const remaining = round3(
      linhas.reduce((acc: number, l: any) => acc + (l.expected_qty - l.packed_qty), 0),
    );
    if (qty > remaining + 0.0001) {
      throw new PackingError(
        `Quantidade excede o coletado. Restante para embalar: ${remaining}`,
        "OVER_PACK",
      );
    }

    let falta = qty;
    for (const pi of linhas) {
      if (falta <= 0.0001) break;
      const disponivel = round3(pi.expected_qty - pi.packed_qty);
      const usar = round3(Math.min(disponivel, falta));
      if (usar <= 0) continue;
      falta = round3(falta - usar);

      const existing = await one<any>(
        `SELECT * FROM volume_items WHERE volume_id = ? AND product_id = ? AND lot_id IS ?`,
        params.volumeId, params.productId, pi.lot_id,
      );
      if (existing) {
        await run(`UPDATE volume_items SET quantity = quantity + ? WHERE id = ?`, usar, existing.id);
      } else {
        await insert("volume_items", {
          // O lote entra na chave: o mesmo produto pode ocupar duas linhas do
          // volume quando vem de lotes diferentes.
          id: `${params.volumeId}-${params.productId}-${pi.lot_id ?? "NL"}`,
          volume_id: params.volumeId, product_id: params.productId,
          lot_id: pi.lot_id, quantity: usar,
        });
      }

      await run(
        `UPDATE packing_items SET packed_qty = packed_qty + ?,
                status = CASE WHEN packed_qty + ? >= expected_qty THEN 'COMPLETED' ELSE 'IN_PROGRESS' END
          WHERE id = ?`,
        usar, usar, pi.id,
      );
      await run(
        `UPDATE sales_order_items SET packed_qty = packed_qty + ? WHERE id = ?`,
        usar, pi.sales_order_item_id,
      );
    }

    await recalcVolumeWeight(params.volumeId);

    await audit({
      actor: params.operatorId, action: "PACK", entity: "volume", entityId: params.volumeId,
      after: { product: params.productId, qty },
      detail: `${qty} de ${params.productId} embalado em ${params.volumeId}`,
    });
    return await getVolume(params.volumeId);
  });
}

export async function removeFromVolume(params: {
  volumeId: string; productId: string; operatorId: string;
}) {
  return await tx(async () => {
    // O produto pode ocupar varias linhas do volume, uma por lote.
    const itens = await all<any>(
      `SELECT * FROM volume_items WHERE volume_id = ? AND product_id = ?`,
      params.volumeId, params.productId,
    );
    if (itens.length === 0) return;
    const vol = await one<any>(`SELECT * FROM volumes WHERE id = ?`, params.volumeId);
    if (vol.status !== "OPEN") throw new PackingError("Volume fechado", "VOLUME_CLOSED");

    const total = round3(itens.reduce((acc: number, i: any) => acc + i.quantity, 0));
    for (const vi of itens) {
      const pi = await one<any>(
        `SELECT * FROM packing_items
          WHERE packing_order_id = ? AND product_id = ? AND lot_id IS ?`,
        vol.packing_order_id, params.productId, vi.lot_id,
      );
      await run(`DELETE FROM volume_items WHERE id = ?`, vi.id);
      if (pi) {
        await run(
          `UPDATE packing_items SET packed_qty = packed_qty - ?, status = 'IN_PROGRESS' WHERE id = ?`,
          vi.quantity, pi.id,
        );
        await run(
          `UPDATE sales_order_items SET packed_qty = packed_qty - ? WHERE id = ?`,
          vi.quantity, pi.sales_order_item_id,
        );
      }
    }
    const vi = { quantity: total };
    await recalcVolumeWeight(params.volumeId);
    await audit({
      actor: params.operatorId, action: "PACK", entity: "volume", entityId: params.volumeId,
      after: { removed: params.productId, qty: vi.quantity },
      detail: `Item removido do volume ${params.volumeId}`,
    });
  });
}

async function recalcVolumeWeight(volumeId: string) {
  const net = await scalar<number>(
    `SELECT COALESCE(SUM(vi.quantity * p.unit_gross_kg), 0)
       FROM volume_items vi JOIN products p ON p.id = vi.product_id
      WHERE vi.volume_id = ?`,
    volumeId,
  ) ?? 0;
  const vol = await one<any>(`SELECT tare_kg FROM volumes WHERE id = ?`, volumeId);
  await run(
    `UPDATE volumes SET net_weight_kg = ?, gross_weight_kg = ? WHERE id = ?`,
    round3(net), round3(net + (vol?.tare_kg ?? 0)), volumeId,
  );
}

export async function closeVolume(volumeId: string, operatorId: string) {
  return await tx(async () => {
    const vol = await one<any>(`SELECT * FROM volumes WHERE id = ?`, volumeId);
    if (!vol) throw new PackingError("Volume inexistente", "NO_VOLUME");
    const lines = await scalar<number>(`SELECT COUNT(*) FROM volume_items WHERE volume_id = ?`, volumeId) ?? 0;
    if (lines === 0) throw new PackingError("Volume vazio nao pode ser fechado", "EMPTY_VOLUME");
    await run(`UPDATE volumes SET status = 'CLOSED' WHERE id = ?`, volumeId);
    await audit({
      actor: operatorId, action: "PACK", entity: "volume", entityId: volumeId,
      before: { status: vol.status }, after: { status: "CLOSED", lines },
      detail: `Volume ${volumeId} fechado com ${lines} item(ns)`,
    });
  });
}

/** Conclui a embalagem: exige que tudo o que foi coletado esteja em volume. */
export async function completePacking(packingId: string, actor: string) {
  return await tx(async () => {
    const at = nowIso();
    const pa = await one<any>(`SELECT * FROM packing_orders WHERE id = ?`, packingId);
    if (!pa) throw new PackingError("Ordem de embalagem inexistente", "NOT_FOUND");

    const pending = await all<any>(
      `SELECT pi.*, p.sku FROM packing_items pi JOIN products p ON p.id = pi.product_id
        WHERE pi.packing_order_id = ? AND pi.packed_qty < pi.expected_qty`,
      packingId,
    );
    if (pending.length > 0) {
      throw new PackingError(
        `Ha itens nao embalados: ${pending.map((p) => `${p.sku} (${round3(p.expected_qty - p.packed_qty)})`).join(", ")}`,
        "PENDING_ITEMS",
      );
    }
    const open = await all<any>(
      `SELECT id FROM volumes WHERE packing_order_id = ? AND status = 'OPEN'`, packingId,
    );
    for (const v of open) await closeVolume(v.id, actor);

    // Caixa planejada que ninguem embalou nao pode seguir para a expedicao
    // como se existisse. Cancela — a etiqueta impressa sobrando fica sem
    // par, que e exatamente o que aconteceu no chao de fabrica.
    await run(
      `UPDATE volumes SET status = 'CANCELLED'
        WHERE sales_order_id = ? AND status = 'PLANNED'`,
      pa.sales_order_id,
    );

    const stats = await one<any>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(gross_weight_kg),0) AS w
         FROM volumes WHERE packing_order_id = ? AND status <> 'CANCELLED'`,
      packingId,
    );
    if ((stats?.n ?? 0) === 0) throw new PackingError("Nenhum volume criado", "NO_VOLUMES");

    await run(
      `UPDATE packing_orders SET status = 'COMPLETED', completed_at = ?,
              total_volumes = ?, total_weight_kg = ? WHERE id = ?`,
      at, stats.n, round3(stats.w), packingId,
    );
    await run(
      `UPDATE sales_orders SET total_volumes = ?, total_weight_kg = ? WHERE id = ?`,
      stats.n, round3(stats.w), pa.sales_order_id,
    );

    const order = await one<any>(`SELECT status FROM sales_orders WHERE id = ?`, pa.sales_order_id);
    if (order?.status === "PICKING") await setOrderStatus(pa.sales_order_id, "CHECKING", actor);

    await audit({
      actor, action: "PACK", entity: "packing_order", entityId: packingId,
      after: { status: "COMPLETED", volumes: stats.n, weight: stats.w },
      detail: `Embalagem ${packingId} concluida com ${stats.n} volume(s)`,
    });
    return { volumes: stats.n, weightKg: round3(stats.w) };
  });
}

export async function packingListData(orderId: string) {
  const order = await one<any>(
    `SELECT so.*, c.name AS customer_name, c.cnpj AS customer_cnpj, c.address, c.city, c.state, c.zip
       FROM sales_orders so JOIN customers c ON c.id = so.customer_id WHERE so.id = ?`,
    orderId,
  );
  if (!order) return null;
  const volumes = await Promise.all((await all<any>(
    `SELECT * FROM volumes WHERE sales_order_id = ? AND status <> 'CANCELLED' ORDER BY sequence`,
    orderId,
  )).map(async (v) => ({
    ...v,
    items: await all<any>(
      `SELECT vi.*, p.sku, p.description, p.unit, lt.code AS lot_code, lt.expires_at
         FROM volume_items vi
         JOIN products p ON p.id = vi.product_id
         LEFT JOIN lots lt ON lt.id = vi.lot_id
        WHERE vi.volume_id = ?`,
      v.id,
    ),
  })));
  return { order, volumes };
}
