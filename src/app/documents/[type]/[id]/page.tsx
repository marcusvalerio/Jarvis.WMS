import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { all, one } from "@/lib/db";
import { docType } from "@/domain/documents";
import { getPurchaseOrder, getOrder } from "@/domain/services/orders";
import { getInbound, getPallet, getWeighing, getStorageOrder } from "@/domain/services/receiving";
import { getInvoice } from "@/domain/services/invoices";
import { getPicking } from "@/domain/services/picking";
import { packingListData, getVolume } from "@/domain/services/packing";
import {
  getManifest, getShippingCheck, getLoading, getTransportDocument,
} from "@/domain/services/shipping";
import { locationDetail } from "@/domain/services/warehouse";
import { listMovements } from "@/domain/services/inventory";
import { PrintBar } from "@/components/doc/PrintBar";
import {
  PurchaseOrderDoc, InboundOrderDoc, InvoiceDoc, WeighingDoc,
  ReceivingChecklistDoc, StorageOrderDoc,
} from "@/components/doc/inbound";
import {
  SalesOrderDoc, PicklistDoc, PackingListDoc, ShippingCheckDoc,
  ManifestDoc, TransportDoc, LoadingChecklistDoc, ShippingReceiptDoc, MovementDoc,
} from "@/components/doc/outbound";
import { PalletLabel, LocationLabel, VolumeLabel, InboundVolumeLabel, ProductLabel } from "@/components/doc/labels";
import {
  LabelSheet, LABELS_PER_SHEET, VolumeCell, InboundVolumeCell, PalletCell, ProductCell, LocationCell,
} from "@/components/doc/label-sheet";
import {
  volumeLabelSet, inboundVolumeLabelSet, palletLabelSet, productLabelSet, locationLabelSet,
} from "@/domain/services/labels";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: { params: Promise<{ type: string; id: string }> },
): Promise<Metadata> {
  const { type, id } = await params;
  const t = docType(type);
  return { title: `${t?.label ?? "Documento"} ${id}` };
}

/** Renderiza o documento a partir da entidade correspondente no banco. */
export default async function DocumentPage({
  params,
}: { params: Promise<{ type: string; id: string }> }) {
  const { type, id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const def = docType(type);
  if (!def) notFound();

  const node = await renderDocument(type, id);
  if (!node) notFound();

  return (
    <>
      <PrintBar
        title={`${def.label} · ${id}`}
        meta={
          def.format === "ETIQUETA"
            ? "Etiqueta 100 × 150 mm"
            : type.endsWith("-sheet")
              ? `Folha A4 · ${LABELS_PER_SHEET} etiquetas por folha · imprimir em escala 100%`
              : "Folha A4"
        }
        backHref={backFor(type, id)}
      />
      {node}
    </>
  );
}

function backFor(type: string, id: string): string {
  switch (type) {
    case "inbound-order": case "receiving-checklist": return `/receiving/${id}`;
    case "purchase-order": return `/purchasing/${id}`;
    case "pallet-label": case "movement": return `/warehouse/pallets/${id}`;
    case "location-label": return `/warehouse/${id}`;
    case "product-label": return `/inventory/${id}`;
    case "sales-order": case "packing-list": case "shipping-receipt": return `/shipping/orders/${id}`;
    case "picklist": return `/picking/${id}`;
    case "manifest": return `/shipping/manifests/${id}`;
    case "loading-checklist": return `/shipping/loading/${id}`;
    default: return "/documents";
  }
}

export async function renderDocument(type: string, id: string) {
  switch (type) {
    // ------------------------------------------------------------ entrada
    case "purchase-order": {
      const d = await getPurchaseOrder(id);
      return d ? <PurchaseOrderDoc po={d.po} items={d.items} /> : null;
    }
    case "inbound-order": {
      const d = await getInbound(id);
      return d ? <InboundOrderDoc order={d.order} items={d.items} invoice={d.invoice} /> : null;
    }
    case "invoice": {
      const d = await getInvoice(id);
      return d ? <InvoiceDoc invoice={d.invoice} items={d.items} issuer={d.issuer} recipient={d.recipient} /> : null;
    }
    case "weighing": {
      const w = await getWeighing(id);
      return w ? <WeighingDoc weighing={w} /> : null;
    }
    case "receiving-checklist": {
      const d = await getInbound(id);
      return d ? (
        <ReceivingChecklistDoc
          order={d.order} items={d.items} check={d.check}
          checkItems={d.checkItems} weighings={d.weighings} pallets={d.pallets}
        />
      ) : null;
    }
    case "product-label": {
      const product = await one<any>(`SELECT * FROM products WHERE id = ? OR sku = ?`, id, id);
      if (!product) return null;
      const barcodes = await all<any>(
        `SELECT * FROM product_barcodes WHERE product_id = ? ORDER BY is_primary DESC`, product.id,
      );
      return <ProductLabel product={product} barcodes={barcodes} />;
    }

    // -------------------------------------------------------- armazenagem
    case "storage-order": {
      const so = await getStorageOrder(id);
      if (!so) return null;
      const p = await getPallet(so.pallet_id);
      return <StorageOrderDoc order={so} pallet={p?.pallet} items={p?.items ?? []} />;
    }
    case "pallet-label": {
      const d = await getPallet(id);
      return d ? <PalletLabel pallet={d.pallet} items={d.items} /> : null;
    }
    case "location-label": {
      const d = await locationDetail(id);
      return d ? <LocationLabel location={d.location} /> : null;
    }
    case "movement": {
      const moves = await listMovements({ palletId: id, limit: 200 });
      return moves.length
        ? <MovementDoc movements={moves} title={`Movimentos do palete ${id}`} refId={id} />
        : null;
    }

    // --------------------------------------------------------------- saida
    case "sales-order": {
      const d = await getOrder(id);
      return d ? <SalesOrderDoc order={d.order} items={d.items} /> : null;
    }
    case "picklist": {
      const d = await getPicking(id);
      return d ? <PicklistDoc picking={d.picking} items={d.items} /> : null;
    }
    case "packing-list": {
      const d = await packingListData(id);
      return d ? <PackingListDoc order={d.order} volumes={d.volumes} /> : null;
    }
    // Caixa de entrada e caixa de saida sao a mesma tabela, mas nao o mesmo
    // documento: uma aponta para o fornecedor, a outra para o cliente e a
    // rota. O volume decide, nao a URL — pedir a etiqueta errada devolve a
    // certa em vez de um documento com metade dos campos vazios.
    case "volume-label": case "inbound-volume-label": {
      const d = await getVolume(id);
      if (!d) return null;
      return d.volume.inbound_order_id
        ? <InboundVolumeLabel volume={d.volume} items={d.items} />
        : <VolumeLabel volume={d.volume} items={d.items} />;
    }
    case "shipping-check": {
      const d = await getShippingCheck(id);
      return d ? <ShippingCheckDoc check={d.check} items={d.items} volumes={d.volumes} /> : null;
    }
    case "manifest": {
      const d = await getManifest(id);
      return d ? <ManifestDoc manifest={d.manifest} orders={d.orders} /> : null;
    }
    case "transport": {
      const d = await getTransportDocument(id);
      return d?.doc ? <TransportDoc doc={d.doc} manifest={d.manifest} orders={d.orders ?? []} /> : null;
    }
    case "loading-checklist": {
      const d = await getLoading(id);
      return d ? <LoadingChecklistDoc loading={d.loading} expected={d.expected} /> : null;
    }
    case "shipping-receipt": {
      const d = await getOrder(id);
      if (!d) return null;
      const manifest = d.manifest ?? null;
      return (
        <ShippingReceiptDoc
          order={d.order} volumes={d.volumes} manifest={manifest} shipment={d.shipment}
        />
      );
    }
    // ------------------------------------------- folhas A4 de etiquetas
    // O conjunto inteiro e UM documento: a folha distribui as etiquetas em
    // 2 x 3 e quebra a pagina a cada seis. Cada etiqueta continua sendo a
    // visao de uma entidade real, com o Code 128 do proprio identificador.
    case "volume-label-sheet": {
      const set = await volumeLabelSet();
      if (set.length === 0) return null;
      return (
        <LabelSheet
          items={set}
          title="Etiquetas de volume (expedicao)"
          keyOf={(v) => v.volume.id}
          render={(v) => <VolumeCell volume={v.volume} items={v.items} />}
        />
      );
    }
    case "inbound-volume-label-sheet": {
      const set = await inboundVolumeLabelSet();
      if (set.length === 0) return null;
      return (
        <LabelSheet
          items={set}
          title="Etiquetas de caixa recebida"
          keyOf={(v) => v.volume.id}
          render={(v) => <InboundVolumeCell volume={v.volume} items={v.items} />}
        />
      );
    }
    case "pallet-label-sheet": {
      const set = await palletLabelSet();
      if (set.length === 0) return null;
      return (
        <LabelSheet
          items={set}
          title="Etiquetas de palete"
          keyOf={(p) => p.pallet.id}
          render={(p) => <PalletCell pallet={p.pallet} items={p.items} />}
        />
      );
    }
    case "product-label-sheet": {
      const set = await productLabelSet();
      if (set.length === 0) return null;
      return (
        <LabelSheet
          items={set}
          title="Etiquetas de produto"
          keyOf={(p) => p.product.id}
          render={(p) => <ProductCell product={p.product} barcodes={p.barcodes} />}
        />
      );
    }
    case "location-label-sheet": {
      const set = await locationLabelSet();
      if (set.length === 0) return null;
      return (
        <LabelSheet
          items={set}
          title="Etiquetas de localizacao"
          keyOf={(l) => l.location.id}
          render={(l) => <LocationCell location={l.location} />}
        />
      );
    }

    default:
      return null;
  }
}
