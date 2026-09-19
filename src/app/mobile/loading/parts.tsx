"use client";

import { ActionForm } from "@/components/ActionForm";
import { ScanField, RfButton, RfResult } from "@/components/rf/Kit";
import { rfLoadingScanAction } from "@/app/actions/rf";

export function LoadingTerminal({ loadingId, pending }: { loadingId: string; pending: number }) {
  return (
    <ActionForm action={rfLoadingScanAction} resetOnSuccess feedback={false} className="flex flex-col gap-4">
      {(state) => (
        <>
          <input type="hidden" name="loadingId" value={loadingId} />
          <ScanField label={`Bipe o volume (${pending} restantes)`} placeholder="VOL-000001" />
          <RfButton>Carregar volume</RfButton>
          <RfResult state={state} />
          <p className="text-[12px] text-faint text-center leading-snug">
            O sistema recusa volume inexistente, de outro romaneio, nao conferido ou ja carregado.
          </p>
        </>
      )}
    </ActionForm>
  );
}
