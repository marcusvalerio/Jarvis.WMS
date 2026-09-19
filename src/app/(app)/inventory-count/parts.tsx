"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field } from "@/components/ui/Primitives";
import { createCountAction, startCountAction, countItemAction, closeCountAction } from "@/app/actions/control";
import { fmtNumber } from "@/lib/format";
import { IconCount } from "@/components/ui/Icons";

export function CreateCount({ zones }: { zones: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>
        <IconCount size={13} /> Novo inventario
      </button>
    );
  }
  return (
    <ActionForm action={createCountAction} className="card p-4 w-full" onSuccess={() => setOpen(false)}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Tipo">
          <select name="kind" className="field" defaultValue="CYCLIC">
            <option value="CYCLIC">Ciclico</option>
            <option value="GENERAL">Geral</option>
            <option value="SPOT">Pontual</option>
          </select>
        </Field>
        <Field label="Zona">
          <select name="zoneId" className="field" defaultValue="">
            <option value="">Todas as posicoes ocupadas</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </Field>
        <Field label="Descricao do escopo">
          <input name="scope" className="field" placeholder="Ex.: contagem semanal zona A" />
        </Field>
      </div>
      <div className="flex gap-2 mt-4">
        <SubmitButton>Criar inventario</SubmitButton>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </ActionForm>
  );
}

export function StartCount({ countId }: { countId: string }) {
  return (
    <ActionForm action={startCountAction}>
      <input type="hidden" name="countId" value={countId} />
      <SubmitButton>Iniciar contagem</SubmitButton>
    </ActionForm>
  );
}

export function CountRow({ countId, item, closed }: { countId: string; item: any; closed: boolean }) {
  const [qty, setQty] = useState(item.counted_qty === null ? "" : String(item.counted_qty));
  return (
    <ActionForm action={countItemAction} className="card p-3.5">
      <input type="hidden" name="countId" value={countId} />
      <input type="hidden" name="itemId" value={item.id} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[150px]">
          <p className="label mb-1">Endereco</p>
          <p className="text-[17px] font-[family-name:var(--font-display)] font-semibold">{item.location_code}</p>
        </div>
        <div className="min-w-[150px] flex-1">
          <p className="label mb-1">Produto</p>
          <p className="text-[13px] text-primary">
            <span className="chip-id">{item.sku ?? "—"}</span>
          </p>
          <p className="text-[11.5px] text-secondary mt-1 truncate">{item.description}</p>
        </div>
        <Field label="Contagem fisica" className="w-[130px]">
          <input
            name="quantity" type="number" step="0.001" min="0" required
            className="field tnum text-center" value={qty}
            onChange={(e) => setQty(e.target.value)} disabled={closed}
            aria-label={`Contagem de ${item.location_code}`}
          />
        </Field>
        {item.status !== "PENDING" && (
          <>
            <div className="text-center w-[90px]">
              <p className="label mb-1">Sistema</p>
              <p className="text-[17px] font-[family-name:var(--font-display)] font-semibold tnum text-secondary">
                {fmtNumber(item.system_qty)}
              </p>
            </div>
            <div className="text-center w-[90px]">
              <p className="label mb-1">Divergencia</p>
              <p className={`text-[17px] font-[family-name:var(--font-display)] font-semibold tnum ${
                item.divergence === 0 ? "text-success" : "text-warning"
              }`}>
                {item.divergence === 0 ? "0" : `${item.divergence > 0 ? "+" : ""}${fmtNumber(item.divergence)}`}
              </p>
            </div>
          </>
        )}
        {!closed && <SubmitButton className="btn">Registrar contagem</SubmitButton>}
      </div>
      {item.status === "PENDING" && (
        <p className="text-[11.5px] text-faint mt-2">
          Contagem cega — o saldo do sistema so aparece apos o registro.
        </p>
      )}
    </ActionForm>
  );
}

export function CloseCount({ countId, disabled }: { countId: string; disabled?: boolean }) {
  return (
    <ActionForm action={closeCountAction} className="card p-4">
      <input type="hidden" name="countId" value={countId} />
      <label className="flex items-start gap-2 text-[12.5px] text-secondary mb-3">
        <input type="checkbox" name="applyAdjustments" defaultChecked className="mt-0.5" />
        <span>
          Aplicar ajustes de estoque das divergencias encontradas. Cada ajuste gera um movimento
          de inventario rastreavel.
        </span>
      </label>
      <SubmitButton disabled={disabled}
        title={disabled ? "Conte todas as posicoes antes de encerrar" : undefined}>
        Encerrar inventario
      </SubmitButton>
    </ActionForm>
  );
}
