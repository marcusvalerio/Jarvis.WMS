"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field } from "@/components/ui/Primitives";
import { resolveIncidentAction, incidentStatusAction, createIncidentAction } from "@/app/actions/control";
import { INCIDENT_KIND, INCIDENT_KIND_LABEL, SEVERITY, SEVERITY_META } from "@/domain/states";
import { IconAlert } from "@/components/ui/Icons";

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

/** Abertura manual de ocorrencia — as automaticas vem das validacoes. */
export function NewIncident({
  products, locations,
}: {
  products: { id: string; sku: string }[];
  locations: { id: string; code: string }[];
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>
        <IconAlert size={13} /> Registrar ocorrencia
      </button>
    );
  }

  return (
    <ActionForm action={createIncidentAction} className="card p-5 w-full" onSuccess={() => setOpen(false)}>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Field label="Tipo" required className="md:col-span-2">
          <select name="kind" className="field" required defaultValue="DAMAGED_PRODUCT">
            {Object.keys(INCIDENT_KIND).map((k) => (
              <option key={k} value={k}>
                {INCIDENT_KIND_LABEL[k as keyof typeof INCIDENT_KIND]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Severidade">
          <select name="severity" className="field" defaultValue="MEDIA">
            {Object.keys(SEVERITY).map((sv) => (
              <option key={sv} value={sv}>{SEVERITY_META[sv as keyof typeof SEVERITY].label}</option>
            ))}
          </select>
        </Field>
        <Field label="Referencia">
          <input name="refId" className="field" placeholder="OR-000001, PED-000125…" />
        </Field>
        <Field label="Produto">
          <select name="productId" className="field" defaultValue="">
            <option value="">—</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.sku}</option>)}
          </select>
        </Field>
        <Field label="Endereco">
          <select name="locationId" className="field" defaultValue="">
            <option value="">—</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
          </select>
        </Field>
        <Field label="Descricao" required className="md:col-span-2">
          <input name="description" className="field" required placeholder="O que foi observado" />
        </Field>
      </div>
      <div className="flex gap-2 mt-4">
        <SubmitButton>Abrir ocorrencia</SubmitButton>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </ActionForm>
  );
}
