"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field, IdChip } from "@/components/ui/Primitives";
import { Badge } from "@/components/ui/Badge";
import { storeFromQueueAction } from "@/app/actions/warehouse";
import { fmtNumber, fmtDateTime } from "@/lib/format";
import { IconCheck } from "@/components/ui/Icons";

export function StorageQueueItem({
  order, locations,
}: {
  order: any;
  locations: { id: string; code: string; zone: string; free: boolean }[];
}) {
  const [selected, setSelected] = useState(order.suggested_location_id ?? "");
  const diverged = order.suggested_location_id && selected && selected !== order.suggested_location_id;

  return (
    <ActionForm action={storeFromQueueAction} className="card p-4">
      <input type="hidden" name="storageOrderId" value={order.id} />
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[150px]">
          <p className="label mb-1">Ordem</p>
          <IdChip id={order.id} />
          <p className="text-[11.5px] text-faint mt-1.5">{fmtDateTime(order.created_at)}</p>
        </div>

        <div className="min-w-[150px]">
          <p className="label mb-1">Palete</p>
          <IdChip id={order.pallet_id} href={`/warehouse/pallets/${order.pallet_id}`} />
          <p className="text-[12px] text-secondary mt-1.5">
            {order.sku ?? "—"} · <span className="tnum">{fmtNumber(order.qty)}</span> un
          </p>
        </div>

        <div>
          <p className="label mb-1">Sugestao do WMS</p>
          <p className="text-[19px] font-[family-name:var(--font-display)] font-semibold text-accent-fg leading-8">
            {order.suggested_code ?? "—"}
          </p>
        </div>

        <Field label="Endereco confirmado" className="w-[210px]" required>
          <select
            name="locationId" className="field" required
            value={selected} onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Selecionar…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} — {l.zone}{l.free ? "" : " (ocupado)"}
              </option>
            ))}
          </select>
        </Field>

        {diverged && (
          <Field label="Justificativa do desvio" className="flex-1 min-w-[190px]" required>
            <input name="overrideReason" className="field" required placeholder="Motivo do endereco alternativo" />
          </Field>
        )}

        <SubmitButton><IconCheck size={14} /> Confirmar</SubmitButton>
      </div>
    </ActionForm>
  );
}
