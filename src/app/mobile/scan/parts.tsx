"use client";

import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { ScanField, RfButton, RfResult, RfPanel, RfRow } from "@/components/rf/Kit";
import { lookupAction } from "@/app/actions/rf";
import { fmtNumber, fmtDate } from "@/lib/format";

const HREF: Record<string, (id: string) => string> = {
  LOCATION: (id) => `/warehouse/${id}`,
  PALLET: (id) => `/warehouse/pallets/${id}`,
  PRODUCT: (id) => `/inventory/${id}`,
  SALES_ORDER: (id) => `/shipping/orders/${id}`,
  INBOUND_ORDER: (id) => `/receiving/${id}`,
  MANIFEST: (id) => `/shipping/manifests/${id}`,
  PICKING_ORDER: (id) => `/picking/${id}`,
  PACKING_ORDER: (id) => `/packing/${id}`,
  VOLUME: (id) => `/documents/volume-label/${id}`,
  LOADING: (id) => `/shipping/loading/${id}`,
};

export function LookupTerminal() {
  return (
    <ActionForm action={lookupAction} resetOnSuccess feedback={false} className="flex flex-col gap-4">
      {(state) => {
        const r = state.data?.resolved;
        return (
          <>
            <ScanField label="Aguardando leitura" placeholder="Bipe o codigo…" />
            <RfButton>Consultar</RfButton>
            <RfResult state={state} />

            {r?.found && (
              <RfPanel
                eyebrow={KIND_LABEL[r.kind] ?? r.kind}
                title={r.label}
                subtitle={r.sublabel}
                tone="accent"
              >
                <div className="flex flex-col">
                  {r.status && <RfRow label="Status" value={r.status} />}
                  {r.nextAction && <RfRow label="Situacao" value={r.nextAction} />}

                  {r.kind === "PRODUCT" && (
                    <>
                      <RfRow label="Saldo" value={fmtNumber(r.data?.onHand ?? 0)} big />
                      <RfRow label="Reservado" value={fmtNumber(r.data?.reserved ?? 0)} />
                      <RfRow label="Disponivel" value={fmtNumber(r.data?.available ?? 0)} />
                    </>
                  )}

                  {r.kind === "LOCATION" && (r.data?.contents ?? []).map((c: any) => (
                    <RfRow
                      key={c.id} label={c.sku}
                      value={`${fmtNumber(c.qty_on_hand)} · lote ${c.lot_code ?? "—"}`}
                    />
                  ))}

                  {r.kind === "PALLET" && (r.data?.items ?? []).map((i: any) => (
                    <RfRow
                      key={i.id} label={i.sku}
                      value={`${fmtNumber(i.quantity)} ${i.unit} · val. ${i.expires_at ? fmtDate(i.expires_at) : "—"}`}
                    />
                  ))}

                  {r.kind === "VOLUME" && (r.data?.items ?? []).map((i: any) => (
                    <RfRow key={i.id} label={i.sku} value={`${fmtNumber(i.quantity)} ${i.unit}`} />
                  ))}
                </div>

                {HREF[r.kind] && r.id && (
                  <Link href={HREF[r.kind](r.id)} className="btn w-full mt-4">
                    Abrir no sistema
                  </Link>
                )}
              </RfPanel>
            )}
          </>
        );
      }}
    </ActionForm>
  );
}

const KIND_LABEL: Record<string, string> = {
  LOCATION: "Endereco", PALLET: "Palete", PRODUCT: "Produto", VOLUME: "Volume",
  SALES_ORDER: "Pedido de venda", INBOUND_ORDER: "Recebimento", MANIFEST: "Romaneio",
  PICKING_ORDER: "Separacao", PACKING_ORDER: "Embalagem", OPERATOR: "Operador",
  EQUIPMENT: "Equipamento", LOADING: "Carregamento", INVOICE: "Nota fiscal",
  STORAGE_ORDER: "Ordem de armazenagem", PURCHASE_ORDER: "Pedido de compra",
};
