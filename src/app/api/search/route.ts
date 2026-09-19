import { NextResponse } from "next/server";
import { all } from "@/lib/db";
import { resolveScan } from "@/domain/services/scan";
import { ensureSeeded } from "@/domain/services/simulation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Hit {
  kind: string; kindLabel: string; id: string;
  title: string; subtitle: string; href: string; status?: string;
}

const HREF: Record<string, (id: string) => string> = {
  LOCATION: (id) => `/warehouse/${id}`,
  PALLET: (id) => `/warehouse/pallets/${id}`,
  PRODUCT: (id) => `/inventory/${id}`,
  VOLUME: (id) => `/documents/volume-label/${id}`,
  SALES_ORDER: (id) => `/shipping/orders/${id}`,
  INBOUND_ORDER: (id) => `/receiving/${id}`,
  PURCHASE_ORDER: (id) => `/purchasing/${id}`,
  MANIFEST: (id) => `/shipping/manifests/${id}`,
  STORAGE_ORDER: () => `/warehouse/storage`,
  PICKING_ORDER: (id) => `/picking/${id}`,
  PACKING_ORDER: (id) => `/packing/${id}`,
  LOADING: (id) => `/shipping/loading/${id}`,
  INVOICE: (id) => `/documents/invoice/${id}`,
  OPERATOR: () => `/settings`,
  EQUIPMENT: () => `/equipment`,
};

const KIND_LABEL: Record<string, string> = {
  LOCATION: "Endereco", PALLET: "Palete", PRODUCT: "Produto", VOLUME: "Volume",
  SALES_ORDER: "Pedido", INBOUND_ORDER: "Recebimento", PURCHASE_ORDER: "Compra",
  MANIFEST: "Romaneio", STORAGE_ORDER: "Armazenagem", PICKING_ORDER: "Picking",
  PACKING_ORDER: "Packing", LOADING: "Carregamento", INVOICE: "Nota", OPERATOR: "Operador",
  EQUIPMENT: "Equipamento",
};

export async function GET(request: Request) {
  ensureSeeded();
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ hits: [] });

  const hits: Hit[] = [];
  const seen = new Set<string>();
  const push = (h: Hit) => {
    const key = `${h.kind}:${h.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(h);
  };

  // 1. Leitura exata (coletora): resolve direto para a entidade.
  const scan = resolveScan(q);
  if (scan.found && scan.id) {
    push({
      kind: scan.kind, kindLabel: KIND_LABEL[scan.kind] ?? scan.kind, id: scan.id,
      title: scan.label, subtitle: scan.sublabel ?? scan.nextAction ?? "",
      href: HREF[scan.kind]?.(scan.id) ?? "/dashboard", status: scan.status,
    });
  }

  // 2. Busca textual nas entidades operacionais.
  const like = `%${q}%`;

  for (const r of all<any>(
    `SELECT id, sku, description FROM products
      WHERE sku LIKE ? OR description LIKE ? OR category LIKE ? LIMIT 5`, like, like, like)) {
    push({ kind: "PRODUCT", kindLabel: "Produto", id: r.id, title: r.sku, subtitle: r.description, href: `/inventory/${r.id}` });
  }
  for (const r of all<any>(
    `SELECT so.id, so.status, c.name FROM sales_orders so JOIN customers c ON c.id = so.customer_id
      WHERE so.id LIKE ? OR c.name LIKE ? LIMIT 5`, like, like)) {
    push({ kind: "SALES_ORDER", kindLabel: "Pedido", id: r.id, title: r.id, subtitle: r.name, href: `/shipping/orders/${r.id}`, status: r.status });
  }
  for (const r of all<any>(
    `SELECT io.id, io.status, s.name FROM inbound_orders io JOIN suppliers s ON s.id = io.supplier_id
      WHERE io.id LIKE ? OR s.name LIKE ? OR io.vehicle_plate LIKE ? LIMIT 5`, like, like, like)) {
    push({ kind: "INBOUND_ORDER", kindLabel: "Recebimento", id: r.id, title: r.id, subtitle: r.name, href: `/receiving/${r.id}`, status: r.status });
  }
  for (const r of all<any>(
    `SELECT l.id, l.code, z.name FROM locations l JOIN zones z ON z.id = l.zone_id
      WHERE l.code LIKE ? OR l.id LIKE ? LIMIT 5`, like, like)) {
    push({ kind: "LOCATION", kindLabel: "Endereco", id: r.id, title: r.code, subtitle: r.name, href: `/warehouse/${r.id}` });
  }
  for (const r of all<any>(
    `SELECT id, status, origin_ref FROM pallets WHERE id LIKE ? LIMIT 4`, like)) {
    push({ kind: "PALLET", kindLabel: "Palete", id: r.id, title: r.id, subtitle: `origem ${r.origin_ref ?? "—"}`, href: `/warehouse/pallets/${r.id}`, status: r.status });
  }
  for (const r of all<any>(
    `SELECT id, status, sales_order_id FROM volumes WHERE id LIKE ? LIMIT 4`, like)) {
    push({ kind: "VOLUME", kindLabel: "Volume", id: r.id, title: r.id, subtitle: r.sales_order_id ?? "", href: `/documents/volume-label/${r.id}`, status: r.status });
  }
  for (const r of all<any>(
    `SELECT id, route, status FROM shipping_manifests WHERE id LIKE ? OR route LIKE ? LIMIT 4`, like, like)) {
    push({ kind: "MANIFEST", kindLabel: "Romaneio", id: r.id, title: r.id, subtitle: r.route, href: `/shipping/manifests/${r.id}`, status: r.status });
  }

  return NextResponse.json({ hits: hits.slice(0, 12) });
}
