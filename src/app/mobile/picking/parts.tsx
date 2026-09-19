"use client";

import { ActionForm } from "@/components/ActionForm";
import { ScanField, RfButton, RfResult, RfPanel, RfRow, RfSteps } from "@/components/rf/Kit";
import { rfPickScanAction, rfPickConfirmAction, rfStartPickingAction } from "@/app/actions/rf";
import { fmtNumber, fmtDate } from "@/lib/format";
import { useEffect, useRef } from "react";

export function StartPickButton({ pickingId }: { pickingId: string }) {
  return (
    <ActionForm action={rfStartPickingAction} className="flex flex-col gap-4">
      {(state) => (
        <>
          <input type="hidden" name="pickingId" value={pickingId} />
          <RfPanel eyebrow="Pronta para iniciar" title="INICIAR SEPARACAO"
            subtitle="A coletora conduzira linha a linha pela rota do armazem." />
          <RfButton>Iniciar</RfButton>
          <RfResult state={state} />
        </>
      )}
    </ActionForm>
  );
}

/**
 * Terminal de separacao: a sequencia endereco → produto → quantidade e
 * imposta pelo servidor. A tela mostra apenas o passo corrente.
 */
export function PickTerminal({ pickingId, item }: { pickingId: string; item: any }) {
  const step: "SCAN_LOCATION" | "SCAN_PRODUCT" | "CONFIRM_QTY" =
    item.status === "PENDING" ? "SCAN_LOCATION"
    : item.status === "LOCATION_SCANNED" ? "SCAN_PRODUCT"
    : "CONFIRM_QTY";
  const stepIndex = step === "SCAN_LOCATION" ? 0 : step === "SCAN_PRODUCT" ? 1 : 2;

  return (
    <div className="flex flex-col gap-4">
      <RfSteps steps={["Endereco", "Produto", "Quantidade"]} current={stepIndex} />

      <RfPanel
        eyebrow={`Linha ${item.sequence} · ${item.zone_name}`}
        title={item.location_code}
        subtitle={item.description}
        tone={step === "SCAN_LOCATION" ? "accent" : "neutral"}
      >
        <div className="flex flex-col">
          <RfRow label="Produto" value={item.sku} />
          <RfRow label="Quantidade" value={`${fmtNumber(item.expected_qty)} ${item.unit}`} big />
          {item.lot_code && <RfRow label="Lote" value={item.lot_code} />}
          {item.expires_at && <RfRow label="Validade" value={fmtDate(item.expires_at)} />}
        </div>
      </RfPanel>

      {step === "SCAN_LOCATION" && (
        <ActionForm action={rfPickScanAction} resetOnSuccess feedback={false} key="loc" className="flex flex-col gap-4">
          {(state) => (
            <>
              <input type="hidden" name="pickingId" value={pickingId} />
              <input type="hidden" name="step" value="SCAN_LOCATION" />
              <ScanField label="Bipe o endereco" placeholder={item.location_code} />
              <RfButton>Validar endereco</RfButton>
              <RfResult state={state} />
            </>
          )}
        </ActionForm>
      )}

      {step === "SCAN_PRODUCT" && (
        <ActionForm action={rfPickScanAction} resetOnSuccess feedback={false} key="prod" className="flex flex-col gap-4">
          {(state) => (
            <>
              <input type="hidden" name="pickingId" value={pickingId} />
              <input type="hidden" name="step" value="SCAN_PRODUCT" />
              <ScanField label="Bipe o produto" placeholder={item.sku} />
              <RfButton>Validar produto</RfButton>
              <RfResult state={state} />
            </>
          )}
        </ActionForm>
      )}

      {step === "CONFIRM_QTY" && <QtyForm pickingId={pickingId} item={item} />}
    </div>
  );
}

function QtyForm({ pickingId, item }: { pickingId: string; item: any }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, [item.id]);

  return (
    <ActionForm action={rfPickConfirmAction} feedback={false} className="flex flex-col gap-4">
      {(state) => (
        <>
          <input type="hidden" name="pickingId" value={pickingId} />
          <label className="block">
            <span className="block text-[13px] tracking-[0.06em] uppercase text-secondary mb-2.5 font-[family-name:var(--font-editorial)]">
              Quantidade coletada
            </span>
            <input
              ref={ref} name="quantity" type="number" step="0.001" min="0" max={item.expected_qty}
              required defaultValue={item.expected_qty}
              className="w-full h-20 px-4 rounded-xl bg-bg border-2 border-accent outline-none text-center
                         text-[40px] font-semibold text-primary tnum font-[family-name:var(--font-display)]"
            />
          </label>
          <RfButton>Confirmar coleta</RfButton>
          <RfResult state={state} />
          <p className="text-[12px] text-faint text-center">
            Maximo permitido: {fmtNumber(item.expected_qty)} {item.unit}
          </p>
        </>
      )}
    </ActionForm>
  );
}
