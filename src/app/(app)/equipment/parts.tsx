"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field } from "@/components/ui/Primitives";
import { equipmentStatusAction } from "@/app/actions/control";
import { EQUIPMENT_STATUS_META } from "@/domain/states";

export function EquipmentStatusForm({ equipmentId, current }: { equipmentId: string; current: string }) {
  const [status, setStatus] = useState(current);
  const needsNote = status === "MAINTENANCE" || status === "UNAVAILABLE";

  return (
    <ActionForm action={equipmentStatusAction}>
      <input type="hidden" name="equipmentId" value={equipmentId} />
      <div className="flex items-end gap-2">
        <Field label="Status" className="flex-1">
          <select name="status" className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(EQUIPMENT_STATUS_META).map(([k, m]) => (
              <option key={k} value={k}>{m.label}</option>
            ))}
          </select>
        </Field>
        <SubmitButton className="btn" disabled={status === current}>Aplicar</SubmitButton>
      </div>
      {needsNote && (
        <Field label="Motivo" className="mt-2.5">
          <input name="note" className="field" placeholder="Ex.: bateria substituida" />
        </Field>
      )}
    </ActionForm>
  );
}
