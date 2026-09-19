"use client";

import { useEffect, useRef, useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { ScanField, RfButton, RfResult, RfPanel, RfRow, RfSteps } from "@/components/rf/Kit";
import { rfCheckScanProductAction, rfCheckItemAction } from "@/app/actions/rf";
import { fmtNumber, fmtDate } from "@/lib/format";

/**
 * Conferencia de entrada na coletora: bipa-se o produto e conta-se a
 * quantidade fisica. A divergencia e calculada pelo servidor e abre
 * ocorrencia automaticamente.
 */
export function ReceivingTerminal({ checkId, item }: { checkId: string; item: any }) {
  const [step, setStep] = useState(0);
  useEffect(() => { setStep(0); }, [item.id]);

  return (
    <div className="flex flex-col gap-4">
      <RfSteps steps={["Produto", "Contagem"]} current={step} />

      <RfPanel eyebrow="Linha a conferir" title={item.sku} subtitle={item.description} tone="accent">
        <div className="flex flex-col">
          <RfRow label="Esperado" value={`${fmtNumber(item.expected_qty)}`} big />
          {item.lot_code && <RfRow label="Lote" value={item.lot_code} />}
          {item.expires_at && <RfRow label="Validade" value={fmtDate(item.expires_at)} />}
        </div>
      </RfPanel>

      {step === 0 && (
        <ActionForm
          action={rfCheckScanProductAction} resetOnSuccess feedback={false}
          onSuccess={() => setStep(1)} className="flex flex-col gap-4"
        >
          {(state) => (
            <>
              <input type="hidden" name="productId" value={item.product_id} />
              <ScanField label="Bipe o produto" placeholder={item.sku} />
              <RfButton>Validar produto</RfButton>
              <RfResult state={state} />
            </>
          )}
        </ActionForm>
      )}

      {step === 1 && <CheckQty checkId={checkId} item={item} />}
    </div>
  );
}

function CheckQty({ checkId, item }: { checkId: string; item: any }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <ActionForm action={rfCheckItemAction} feedback={false} className="flex flex-col gap-4">
      {(state) => (
        <>
          <input type="hidden" name="checkId" value={checkId} />
          <input type="hidden" name="checkItemId" value={item.id} />
          <label className="block">
            <span className="block text-[13px] tracking-[0.06em] uppercase text-secondary mb-2.5 font-[family-name:var(--font-editorial)]">
              Quantidade conferida
            </span>
            <input
              ref={ref} name="quantity" type="number" step="0.001" min="0" required
              defaultValue={item.expected_qty}
              className="w-full h-20 px-4 rounded-xl bg-bg border-2 border-accent outline-none text-center
                         text-[40px] font-semibold text-primary tnum font-[family-name:var(--font-display)]"
            />
          </label>
          <RfButton>Confirmar conferencia</RfButton>
          <RfResult state={state} />
          <p className="text-[12px] text-faint text-center leading-snug">
            Divergencia em relacao ao esperado abre ocorrencia automaticamente.
          </p>
        </>
      )}
    </ActionForm>
  );
}
