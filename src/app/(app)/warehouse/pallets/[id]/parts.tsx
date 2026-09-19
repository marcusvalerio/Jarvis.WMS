"use client";

import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field } from "@/components/ui/Primitives";
import { transferPalletAction } from "@/app/actions/warehouse";

export function TransferForm({
  palletId, locations, current,
}: {
  palletId: string;
  locations: { id: string; code: string; zone: string }[];
  current: string | null;
}) {
  return (
    <ActionForm action={transferPalletAction}>
      <input type="hidden" name="palletId" value={palletId} />
      <Field label="Endereco de destino" required>
        <select name="locationId" className="field" required defaultValue="">
          <option value="">Selecionar…</option>
          {locations.filter((l) => l.id !== current).map((l) => (
            <option key={l.id} value={l.id}>{l.code} — {l.zone}</option>
          ))}
        </select>
      </Field>
      <Field label="Motivo" className="mt-3">
        <input name="reason" className="field" placeholder="Ex.: reorganizacao de corredor" />
      </Field>
      <div className="mt-3"><SubmitButton className="btn">Transferir palete</SubmitButton></div>
    </ActionForm>
  );
}
