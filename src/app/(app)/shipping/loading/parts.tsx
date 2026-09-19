"use client";

import { useRef, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field } from "@/components/ui/Primitives";
import { scanLoadingVolumeAction, completeLoadingAction } from "@/app/actions/outbound";
import { IconScan, IconCheck } from "@/components/ui/Icons";

export function LoadingScanner({ loadingId }: { loadingId: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <ActionForm action={scanLoadingVolumeAction} resetOnSuccess onSuccess={() => ref.current?.focus()}>
      <input type="hidden" name="loadingId" value={loadingId} />
      <div className="flex items-end gap-2">
        <Field label="Bipe o volume a carregar" className="flex-1">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-accent pointer-events-none">
              <IconScan size={17} />
            </span>
            <input
              ref={ref} name="code" className="field pl-10 code h-11 text-[16px]"
              placeholder="VOL-000001" autoFocus autoComplete="off" spellCheck={false} required
            />
          </div>
        </Field>
        <SubmitButton className="btn btn-primary btn-lg">Carregar</SubmitButton>
      </div>
      <p className="text-[11.5px] text-faint mt-2">
        O sistema recusa volume inexistente, de outro romaneio, nao conferido ou ja carregado.
      </p>
    </ActionForm>
  );
}

export function CompleteLoading({
  loadingId, missing,
}: { loadingId: string; missing: number }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        <IconCheck size={14} /> Encerrar carregamento
      </button>
    );
  }
  return (
    <ActionForm action={completeLoadingAction} className="card p-4">
      <input type="hidden" name="loadingId" value={loadingId} />
      <Field label="Numero do lacre" required>
        <input name="seal" className="field code" required autoFocus placeholder="LCR-88421" />
      </Field>
      {missing > 0 && (
        <label className="flex items-start gap-2 mt-3 text-[12.5px] text-warning">
          <input type="checkbox" name="allowPartial" className="mt-0.5" />
          <span>
            Encerrar mesmo com {missing} volume(s) faltante(s) — sera registrada uma ocorrencia
            de divergencia de expedicao.
          </span>
        </label>
      )}
      <div className="flex gap-2 mt-4">
        <SubmitButton>Lacrar e encerrar</SubmitButton>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Voltar</button>
      </div>
    </ActionForm>
  );
}
