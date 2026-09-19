"use client";

import { useEffect, useRef, useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { ScanField, RfButton, RfResult, RfPanel, RfRow, RfSteps } from "@/components/rf/Kit";
import { rfCountScanAction, rfCountConfirmAction } from "@/app/actions/rf";

/**
 * Contagem cega: o operador so ve endereco e produto esperados; o saldo do
 * sistema permanece oculto ate a confirmacao, evitando inducao na contagem.
 */
export function CountTerminal({ countId, item }: { countId: string; item: any }) {
  const [step, setStep] = useState(0);

  useEffect(() => { setStep(0); }, [item.id]);

  return (
    <div className="flex flex-col gap-4">
      <RfSteps steps={["Endereco", "Produto", "Contagem"]} current={step} />

      <RfPanel
        eyebrow="Posicao a contar"
        title={item.location_code}
        subtitle={item.sku ? `${item.sku} — ${item.description ?? ""}` : "Posicao sem produto definido"}
        tone="accent"
      />

      {step === 0 && (
        <ActionForm
          action={rfCountScanAction} resetOnSuccess feedback={false} key="loc"
          onSuccess={() => setStep(1)} className="flex flex-col gap-4"
        >
          {(state) => (
            <>
              <input type="hidden" name="countId" value={countId} />
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="expect" value="LOCATION" />
              <ScanField label="Bipe o endereco" placeholder={item.location_code} />
              <RfButton>Validar endereco</RfButton>
              <RfResult state={state} />
            </>
          )}
        </ActionForm>
      )}

      {step === 1 && (
        <ActionForm
          action={rfCountScanAction} resetOnSuccess feedback={false} key="prod"
          onSuccess={() => setStep(2)} className="flex flex-col gap-4"
        >
          {(state) => (
            <>
              <input type="hidden" name="countId" value={countId} />
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="expect" value="PRODUCT" />
              <ScanField label="Bipe o produto" placeholder={item.sku ?? "SKU"} />
              <RfButton>Validar produto</RfButton>
              <RfResult state={state} />
            </>
          )}
        </ActionForm>
      )}

      {step === 2 && <CountQty countId={countId} item={item} />}
    </div>
  );
}

function CountQty({ countId, item }: { countId: string; item: any }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <ActionForm action={rfCountConfirmAction} feedback={false} className="flex flex-col gap-4">
      {(state) => (
        <>
          <input type="hidden" name="countId" value={countId} />
          <input type="hidden" name="itemId" value={item.id} />
          <label className="block">
            <span className="block text-[13px] tracking-[0.06em] uppercase text-secondary mb-2.5 font-[family-name:var(--font-editorial)]">
              Quantidade contada
            </span>
            <input
              ref={ref} name="quantity" type="number" step="0.001" min="0" required
              placeholder="0"
              className="w-full h-20 px-4 rounded-xl bg-bg border-2 border-accent outline-none text-center
                         text-[40px] font-semibold text-primary tnum font-[family-name:var(--font-display)]
                         placeholder:text-faint"
            />
          </label>
          <RfButton>Confirmar contagem</RfButton>
          <RfResult state={state} />
          <p className="text-[12px] text-faint text-center leading-snug">
            Contagem cega — o saldo do sistema so e comparado apos a confirmacao.
          </p>
        </>
      )}
    </ActionForm>
  );
}
