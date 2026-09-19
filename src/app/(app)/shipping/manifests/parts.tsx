"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field } from "@/components/ui/Primitives";
import {
  createManifestAction, addOrderToManifestAction, removeOrderFromManifestAction,
  releaseManifestAction, startLoadingAction, shipManifestAction,
} from "@/app/actions/outbound";
import { IconDoc, IconX, IconTruckOut } from "@/components/ui/Icons";

export function CreateManifest({
  docks, defaults,
}: {
  docks: { id: string; name: string }[];
  defaults: { route: string; carrier: string; plate: string; kind: string; driver: string; doc: string; dock: string };
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        <IconDoc size={14} /> Novo romaneio
      </button>
    );
  }
  return (
    <ActionForm action={createManifestAction} className="card p-5 w-full" onSuccess={() => setOpen(false)}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Rota" required className="md:col-span-2">
          <input name="route" className="field" required defaultValue={defaults.route} />
        </Field>
        <Field label="Transportadora">
          <input name="carrier" className="field" defaultValue={defaults.carrier} />
        </Field>
        <Field label="Placa do veiculo" required>
          <input name="vehiclePlate" className="field code" required defaultValue={defaults.plate} />
        </Field>
        <Field label="Tipo de veiculo">
          <input name="vehicleKind" className="field" defaultValue={defaults.kind} />
        </Field>
        <Field label="Doca">
          <select name="dockId" className="field" defaultValue={defaults.dock}>
            <option value="">—</option>
            {docks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Motorista" required>
          <input name="driverName" className="field" required defaultValue={defaults.driver} />
        </Field>
        <Field label="Documento do motorista">
          <input name="driverDoc" className="field" defaultValue={defaults.doc} />
        </Field>
      </div>
      <div className="flex gap-2 mt-4">
        <SubmitButton>Criar romaneio</SubmitButton>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </ActionForm>
  );
}

export function AddOrder({
  manifestId, orders,
}: { manifestId: string; orders: { id: string; label: string }[] }) {
  if (orders.length === 0) {
    return <p className="text-[12.5px] text-faint">Nenhum pedido pronto para carregar no momento.</p>;
  }
  return (
    <ActionForm action={addOrderToManifestAction}>
      <input type="hidden" name="manifestId" value={manifestId} />
      <div className="flex items-end gap-2">
        <Field label="Pedido pronto para carregar" className="flex-1">
          <select name="orderId" className="field" required defaultValue="">
            <option value="" disabled>Selecionar…</option>
            {orders.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>
        <SubmitButton className="btn">Incluir no romaneio</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function RemoveOrder({ manifestId, orderId }: { manifestId: string; orderId: string }) {
  return (
    <ActionForm action={removeOrderFromManifestAction} feedback={false} className="inline">
      <input type="hidden" name="manifestId" value={manifestId} />
      <input type="hidden" name="orderId" value={orderId} />
      <SubmitButton className="btn btn-sm btn-ghost" pendingLabel="…"><IconX size={12} /></SubmitButton>
    </ActionForm>
  );
}

export function ReleaseManifest({ manifestId }: { manifestId: string }) {
  return (
    <ActionForm action={releaseManifestAction}>
      <input type="hidden" name="manifestId" value={manifestId} />
      <SubmitButton>Liberar romaneio e emitir documento de transporte</SubmitButton>
    </ActionForm>
  );
}

export function StartLoading({
  manifestId, docks, equipment, defaultDock,
}: {
  manifestId: string;
  docks: { id: string; name: string }[];
  equipment: { id: string; model: string }[];
  defaultDock?: string | null;
}) {
  return (
    <ActionForm action={startLoadingAction}>
      <input type="hidden" name="manifestId" value={manifestId} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Doca" className="w-[200px]">
          <select name="dockId" className="field" defaultValue={defaultDock ?? ""}>
            <option value="">—</option>
            {docks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Equipamento" className="w-[220px]">
          <select name="equipmentId" className="field" defaultValue="">
            <option value="">—</option>
            {equipment.map((e) => <option key={e.id} value={e.id}>{e.model}</option>)}
          </select>
        </Field>
        <SubmitButton><IconTruckOut size={14} /> Iniciar carregamento</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ShipManifest({ manifestId }: { manifestId: string }) {
  const [confirm, setConfirm] = useState(false);
  if (!confirm) {
    return (
      <button type="button" className="btn btn-primary btn-lg" onClick={() => setConfirm(true)}>
        <IconTruckOut size={15} /> Expedir carga
      </button>
    );
  }
  return (
    <ActionForm action={shipManifestAction} className="card p-4">
      <input type="hidden" name="manifestId" value={manifestId} />
      <p className="text-[13px] text-primary mb-1">Confirmar expedicao?</p>
      <p className="text-[12.5px] text-secondary mb-3.5 leading-relaxed">
        A expedicao baixa definitivamente o estoque dos volumes carregados, fecha os pedidos e
        registra a saida. A operacao nao pode ser desfeita — apenas o reset do cenario a reverte.
      </p>
      <div className="flex gap-2">
        <SubmitButton className="btn btn-primary">Confirmar expedicao</SubmitButton>
        <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>Voltar</button>
      </div>
    </ActionForm>
  );
}
