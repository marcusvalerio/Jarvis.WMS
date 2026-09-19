"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field } from "@/components/ui/Primitives";
import { resolveIncidentAction, incidentStatusAction } from "@/app/actions/control";

export function IncidentActions({ incidentId, status }: { incidentId: string; status: string }) {
  const [resolving, setResolving] = useState(false);

  if (resolving) {
    return (
      <ActionForm action={resolveIncidentAction} className="card-elevated p-3.5">
        <input type="hidden" name="incidentId" value={incidentId} />
        <Field label="Tratamento aplicado" required>
          <textarea
            name="resolution" rows={2} required autoFocus className="field"
            placeholder="Ex.: falta debitada ao fornecedor; estoque ajustado."
          />
        </Field>
        <div className="flex gap-2 mt-3">
          <SubmitButton className="btn btn-sm btn-primary">Resolver</SubmitButton>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setResolving(false)}>
            Cancelar
          </button>
        </div>
      </ActionForm>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 justify-end">
      {status === "OPEN" && (
        <ActionForm action={incidentStatusAction} feedback={false} className="inline">
          <input type="hidden" name="incidentId" value={incidentId} />
          <input type="hidden" name="status" value="IN_ANALYSIS" />
          <SubmitButton className="btn btn-sm">Colocar em analise</SubmitButton>
        </ActionForm>
      )}
      <button type="button" className="btn btn-sm btn-primary" onClick={() => setResolving(true)}>
        Registrar tratamento
      </button>
    </div>
  );
}
