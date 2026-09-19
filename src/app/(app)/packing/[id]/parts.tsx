"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field } from "@/components/ui/Primitives";
import {
  startPackingAction, createVolumeAction, addToVolumeAction,
  removeFromVolumeAction, closeVolumeAction, completePackingAction,
} from "@/app/actions/outbound";
import { fmtNumber } from "@/lib/format";
import { IconPack, IconCheck, IconX } from "@/components/ui/Icons";

export function StartPacking({ packingId }: { packingId: string }) {
  return (
    <ActionForm action={startPackingAction}>
      <input type="hidden" name="packingId" value={packingId} />
      <SubmitButton>Iniciar embalagem</SubmitButton>
    </ActionForm>
  );
}

export function CreateVolume({ packingId }: { packingId: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        <IconPack size={14} /> Novo volume
      </button>
    );
  }
  return (
    <ActionForm action={createVolumeAction} className="card p-4 w-full" onSuccess={() => setOpen(false)}>
      <input type="hidden" name="packingId" value={packingId} />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Field label="Embalagem">
          <select name="containerKind" className="field" defaultValue="CAIXA">
            <option value="CAIXA">Caixa</option>
            <option value="PALETE">Palete</option>
            <option value="ENVELOPE">Envelope</option>
          </select>
        </Field>
        <Field label="Compr. (cm)"><input name="length" type="number" step="1" className="field tnum" defaultValue={40} /></Field>
        <Field label="Largura (cm)"><input name="width" type="number" step="1" className="field tnum" defaultValue={30} /></Field>
        <Field label="Altura (cm)"><input name="height" type="number" step="1" className="field tnum" defaultValue={30} /></Field>
        <Field label="Tara (kg)"><input name="tareKg" type="number" step="0.01" className="field tnum" defaultValue={0.4} /></Field>
      </div>
      <div className="flex gap-2 mt-4">
        <SubmitButton>Criar volume</SubmitButton>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </ActionForm>
  );
}

export function AddToVolume({
  packingId, volumeId, items,
}: {
  packingId: string; volumeId: string;
  items: { product_id: string; sku: string; remaining: number; unit: string }[];
}) {
  const [product, setProduct] = useState(items[0]?.product_id ?? "");

  if (items.length === 0) {
    return <p className="text-[12px] text-faint">Tudo o que foi separado ja esta embalado.</p>;
  }

  // O item selecionado some da lista assim que e totalmente embalado;
  // sem este ajuste a selecao ficaria apontando para um item inexistente.
  const selected = items.find((i) => i.product_id === product) ?? items[0];
  return (
    <ActionForm action={addToVolumeAction} resetOnSuccess>
      <input type="hidden" name="packingId" value={packingId} />
      <input type="hidden" name="volumeId" value={volumeId} />
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Produto" className="flex-1 min-w-[190px]">
          <select
            name="productId" className="field"
            value={selected.product_id} onChange={(e) => setProduct(e.target.value)}
          >
            {items.map((i) => (
              <option key={i.product_id} value={i.product_id}>
                {i.sku} — restam {fmtNumber(i.remaining)} {i.unit}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quantidade" className="w-[120px]">
          <input
            key={selected.product_id} name="quantity" type="number" step="0.001" min="0.001"
            max={selected.remaining} required className="field tnum text-center"
            defaultValue={selected.remaining}
          />
        </Field>
        <SubmitButton className="btn">Embalar</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function RemoveFromVolume({
  packingId, volumeId, productId,
}: { packingId: string; volumeId: string; productId: string }) {
  return (
    <ActionForm action={removeFromVolumeAction} feedback={false} className="inline">
      <input type="hidden" name="packingId" value={packingId} />
      <input type="hidden" name="volumeId" value={volumeId} />
      <input type="hidden" name="productId" value={productId} />
      <SubmitButton className="btn btn-sm btn-ghost" pendingLabel="…">
        <IconX size={12} />
      </SubmitButton>
    </ActionForm>
  );
}

export function CloseVolume({ packingId, volumeId }: { packingId: string; volumeId: string }) {
  return (
    <ActionForm action={closeVolumeAction} feedback={false} className="inline">
      <input type="hidden" name="packingId" value={packingId} />
      <input type="hidden" name="volumeId" value={volumeId} />
      <SubmitButton className="btn btn-sm"><IconCheck size={12} /> Fechar volume</SubmitButton>
    </ActionForm>
  );
}

export function CompletePacking({ packingId, disabled }: { packingId: string; disabled?: boolean }) {
  return (
    <ActionForm action={completePackingAction}>
      <input type="hidden" name="packingId" value={packingId} />
      <SubmitButton className="btn btn-primary" disabled={disabled}
        title={disabled ? "Embale todo o material separado antes de concluir" : undefined}>
        Concluir embalagem
      </SubmitButton>
    </ActionForm>
  );
}
