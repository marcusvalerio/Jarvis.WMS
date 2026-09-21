/**
 * FOLHAS DE ETIQUETAS A4 — 6 por folha, 2 colunas x 3 linhas.
 *
 * Uma etiqueta por folha A4 desperdicaria 18 folhas so nas caixas de saida.
 * Estas consultas montam o CONJUNTO de etiquetas de um tipo para que a
 * folha as distribua na grade e quebre a pagina a cada seis.
 *
 * As etiquetas continuam sendo derivadas das entidades reais: o que muda e
 * o arranjo no papel, nunca o conteudo nem o valor do codigo de barras —
 * que segue sendo exatamente o identificador da linha do banco.
 */
import { all } from "@/lib/db";

/** Etiquetas das caixas de SAIDA, na ordem de impressao (pedido, sequencia). */
export async function volumeLabelSet() {
  const volumes = await all<any>(
    `SELECT v.*, so.id AS order_id, so.carrier, so.due_at,
            c.name AS customer_name, c.trade_name AS customer_trade,
            c.city AS customer_city, c.state AS customer_state,
            c.address AS customer_address, c.zip AS customer_zip,
            m.id AS manifest_id, m.route, m.vehicle_plate, m.vehicle_kind,
            m.driver_name, mo.stop_sequence,
            (SELECT COUNT(*) FROM volumes vv
              WHERE vv.sales_order_id = v.sales_order_id
                AND vv.status <> 'CANCELLED') AS order_volumes
       FROM volumes v
       JOIN sales_orders so ON so.id = v.sales_order_id
       JOIN customers c ON c.id = so.customer_id
       LEFT JOIN manifest_orders mo ON mo.sales_order_id = v.sales_order_id
       LEFT JOIN shipping_manifests m ON m.id = mo.manifest_id
      WHERE v.status <> 'CANCELLED' AND v.inbound_order_id IS NULL
      ORDER BY v.sales_order_id, v.sequence`,
  );
  return await comConteudo(volumes);
}

/** Etiquetas das caixas de ENTRADA, na ordem de chegada. */
export async function inboundVolumeLabelSet() {
  const volumes = await all<any>(
    `SELECT v.*, io.carrier AS inbound_carrier, io.purchase_order_id, io.invoice_id,
            f.name AS supplier_name, nf.number AS invoice_number,
            (SELECT COUNT(*) FROM volumes vv
              WHERE vv.inbound_order_id = v.inbound_order_id
                AND vv.status <> 'CANCELLED') AS inbound_volumes
       FROM volumes v
       JOIN inbound_orders io ON io.id = v.inbound_order_id
       LEFT JOIN suppliers f ON f.id = io.supplier_id
       LEFT JOIN invoices nf ON nf.id = io.invoice_id
      WHERE v.status <> 'CANCELLED' AND v.inbound_order_id IS NOT NULL
      ORDER BY v.inbound_order_id, v.sequence`,
  );
  return await comConteudo(volumes);
}

/**
 * Anexa o conteudo de cada caixa em UMA consulta, em vez de uma por
 * volume: a folha de 18 etiquetas faria 18 idas ao banco.
 */
async function comConteudo(volumes: any[]) {
  if (volumes.length === 0) return [];
  const itens = await all<any>(
    `SELECT vi.*, p.sku, p.description, p.unit, lt.code AS lot_code, lt.expires_at
       FROM volume_items vi
       JOIN products p ON p.id = vi.product_id
       LEFT JOIN lots lt ON lt.id = vi.lot_id
      WHERE vi.volume_id IN (${volumes.map(() => "?").join(",")})
      ORDER BY vi.volume_id, p.sku`,
    ...volumes.map((v) => v.id),
  );
  return volumes.map((v) => ({
    volume: v,
    items: itens.filter((i) => i.volume_id === v.id),
  }));
}

/** Etiquetas de palete, com endereco, conteudo e caixas de origem. */
export async function palletLabelSet() {
  const pallets = await all<any>(
    `SELECT pl.*, l.code AS location_code, z.name AS zone_name,
            -- Caixas fisicas que deram origem ao palete. So existe para o
            -- palete montado a partir de um recebimento etiquetado; o
            -- palete de estoque inicial nao tem caixa nenhuma atras dele.
            (SELECT COUNT(*) FROM volumes v
              WHERE v.inbound_order_id = pl.origin_ref
                AND v.status <> 'CANCELLED') AS box_count
       FROM pallets pl
       LEFT JOIN locations l ON l.id = pl.location_id
       LEFT JOIN zones z ON z.id = l.zone_id
      ORDER BY pl.id`,
  );
  if (pallets.length === 0) return [];
  const itens = await all<any>(
    `SELECT pi.*, p.sku, p.description, p.unit, lt.code AS lot_code, lt.expires_at
       FROM pallet_items pi
       JOIN products p ON p.id = pi.product_id
       LEFT JOIN lots lt ON lt.id = pi.lot_id
      WHERE pi.pallet_id IN (${pallets.map(() => "?").join(",")})
      ORDER BY pi.pallet_id, p.sku`,
    ...pallets.map((p) => p.id),
  );
  return pallets.map((p) => ({
    pallet: p,
    items: itens.filter((i) => i.pallet_id === p.id),
  }));
}

/**
 * Etiquetas de localizacao usadas pelo pacote da demonstracao: os enderecos
 * que a armazenagem planejada (`storage_orders`) ja sugeriu para os dois
 * recebimentos. Nao e o mapa inteiro do armazem — e o subconjunto que a
 * apresentacao fisica de fato vai usar.
 */
export async function locationLabelSet() {
  const locations = await all<any>(
    `SELECT DISTINCT l.id, l.code, z.name AS zone_name, z.kind AS zone_kind
       FROM storage_orders so
       JOIN locations l ON l.id = so.suggested_location_id
       JOIN zones z ON z.id = l.zone_id
      WHERE so.suggested_location_id IS NOT NULL
      ORDER BY l.code`,
  );
  return locations.map((l) => ({ location: l }));
}

/** Etiquetas de produto, com os codigos de barras cadastrados. */
export async function productLabelSet() {
  const products = await all<any>(`SELECT * FROM products ORDER BY sku`);
  if (products.length === 0) return [];
  const barcodes = await all<any>(
    `SELECT * FROM product_barcodes
      WHERE product_id IN (${products.map(() => "?").join(",")})
      ORDER BY product_id, is_primary DESC`,
    ...products.map((p) => p.id),
  );
  return products.map((p) => ({
    product: p,
    barcodes: barcodes.filter((b) => b.product_id === p.id),
  }));
}
