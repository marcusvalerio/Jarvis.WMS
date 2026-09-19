"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { ScanField, RfButton, RfResult, RfPanel, RfRow, RfSteps } from "@/components/rf/Kit";
import { putawayScanPalletAction, putawayScanLocationAction } from "@/app/actions/rf";
import { fmtNumber, fmtDate } from "@/lib/format";

interface Ctx {
  palletId: string; storageOrderId: string;
  suggested?: string; items: any[];
}

/**
 * Fluxo de armazenagem na coletora:
 *   BIP PALETE → BIP ENDERECO → CONFIRMACAO
 * Cada passo e validado no servidor antes de tocar no estoque.
 */
export function PutawayTerminal() {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <RfPanel eyebrow="Operacao concluida" title="ARMAZENADO" subtitle={done} tone="accent" />
        <RfButton type="button" onClick={() => { setDone(null); setCtx(null); }}>
          Proximo palete
        </RfButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <RfSteps steps={["Bipar palete", "Bipar endereco", "Confirmado"]} current={ctx ? 1 : 0} />

      {!ctx ? (
        <ActionForm
          action={putawayScanPalletAction}
          resetOnSuccess
          feedback={false}
          onSuccess={(s) => setCtx(s.data as unknown as Ctx)}
          className="flex flex-col gap-4"
        >
          {(state) => (
            <>
              <ScanField label="Passo 1 · bipe o palete" placeholder="PLT-000001" />
              <RfButton>Identificar palete</RfButton>
              <RfResult state={state} />
            </>
          )}
        </ActionForm>
      ) : (
        <>
          <RfPanel eyebrow="Palete identificado" title={ctx.palletId} tone="accent">
            <div className="flex flex-col">
              {ctx.items.map((i: any) => (
                <RfRow
                  key={i.id ?? i.sku} label={i.sku}
                  value={`${fmtNumber(i.quantity)} ${i.unit} · lote ${i.lot_code ?? "—"}`}
                />
              ))}
            </div>
          </RfPanel>

          <RfPanel eyebrow="Leve o palete ate" title={ctx.suggested ?? "endereco a definir"} tone="accent" />

          <ActionForm
            action={putawayScanLocationAction}
            resetOnSuccess
            feedback={false}
            onSuccess={(s) => { if (s.data?.done) setDone(s.message ?? "Armazenagem confirmada."); }}
            className="flex flex-col gap-4"
          >
            {(state) => (
              <>
                <input type="hidden" name="storageOrderId" value={ctx.storageOrderId} />
                <ScanField label="Passo 2 · bipe o endereco" placeholder="A-02-03-01" />
                <RfButton>Confirmar armazenagem</RfButton>
                <RfResult state={state} />
              </>
            )}
          </ActionForm>

          <RfButton type="button" className="rf-secondary" onClick={() => setCtx(null)}>
            Cancelar e bipar outro palete
          </RfButton>
        </>
      )}
    </div>
  );
}
