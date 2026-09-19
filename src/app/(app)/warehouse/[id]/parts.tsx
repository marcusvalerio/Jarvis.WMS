"use client";

import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field } from "@/components/ui/Primitives";
import { setLocationStatusAction } from "@/app/actions/warehouse";
import { LOCATION_STATUS_META } from "@/domain/states";
import { useState } from "react";

export function LocationStatusForm({ locationId, current }: { locationId: string; current: string }) {
  const [status, setStatus] = useState(current);
  return (
    <ActionForm action={setLocationStatusAction}>
      <input type="hidden" name="locationId" value={locationId} />
      <Field label="Status">
        <select name="status" className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
          {Object.entries(LOCATION_STATUS_META).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </select>
      </Field>
      {status === "BLOCKED" && (
        <Field label="Motivo do bloqueio" className="mt-3" required>
          <input name="reason" className="field" required placeholder="Ex.: avaria na estrutura" />
        </Field>
      )}
      <div className="mt-3"><SubmitButton className="btn">Aplicar</SubmitButton></div>
    </ActionForm>
  );
}
