"use client";

import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field } from "@/components/ui/Primitives";
import {
  releaseOrderAction, generatePicklistAction, generatePackingAction,
  startShippingCheckAction, checkVolumeAction, finishShippingCheckAction,
  cancelOrderAction, issueOutboundInvoiceAction,
} from "@/app/actions/outbound";
import { useRef, useState } from "react";
import { IconScan } from "@/components/ui/Icons";

function OneField({ action, orderId, label, className = "btn btn-primary", hint }: any) {
  return (
    <ActionForm action={action} className="inline-flex flex-col gap-1.5">
      <input type="hidden" name="orderId" value={orderId} />
      <SubmitButton className={className}>{label}</SubmitButton>
      {hint && <span className="text-[11.5px] text-faint">{hint}</span>}
    </ActionForm>
  );
}

export const ReleaseOrder = ({ orderId }: { orderId: string }) => (
  <OneField action={releaseOrderAction} orderId={orderId}
    label="Liberar e reservar estoque" hint="Reserva FEFO, limitada ao disponivel." />
);
export const GeneratePicklist = ({ orderId }: { orderId: string }) => (
  <OneField action={generatePicklistAction} orderId={orderId}
    label="Gerar picklist" hint="Sequenciada pela rota do armazem." />
);
export const GeneratePacking = ({ orderId }: { orderId: string }) => (
  <OneField action={generatePackingAction} orderId={orderId} label="Abrir embalagem" />
);
export const StartShippingCheck = ({ orderId }: { orderId: string }) => (
  <OneField action={startShippingCheckAction} orderId={orderId} label="Iniciar conferencia de expedicao" />
);
export const IssueOutboundInvoice = ({ orderId }: { orderId: string }) => (
  <OneField action={issueOutboundInvoiceAction} orderId={orderId}
    label="Emitir NF simulada de saida" className="btn" />
);

/** Campo de bipagem de volume na conferencia de expedicao. */
export function VolumeScanForm({ orderId, checkId }: { orderId: string; checkId: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <ActionForm
      action={checkVolumeAction}
      resetOnSuccess
      onSuccess={() => ref.current?.focus()}
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="checkId" value={checkId} />
      <div className="flex items-end gap-2">
        <Field label="Bipe o volume" className="flex-1">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-accent pointer-events-none">
              <IconScan size={15} />
            </span>
            <input
              ref={ref} name="code" className="field pl-8 code" autoFocus autoComplete="off"
              placeholder="VOL-000001" spellCheck={false}
            />
          </div>
        </Field>
        <SubmitButton className="btn">Conferir</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function FinishShippingCheck({
  orderId, checkId, disabled,
}: { orderId: string; checkId: string; disabled?: boolean }) {
  return (
    <ActionForm action={finishShippingCheckAction}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="checkId" value={checkId} />
      <SubmitButton className="btn btn-primary" disabled={disabled}
        title={disabled ? "Bipe todos os volumes antes de encerrar" : undefined}>
        Encerrar conferencia
      </SubmitButton>
    </ActionForm>
  );
}

export function CancelOrder({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-sm btn-danger" onClick={() => setOpen(true)}>
        Cancelar pedido
      </button>
    );
  }
  return (
    <ActionForm action={cancelOrderAction} className="card p-3.5 w-full">
      <input type="hidden" name="orderId" value={orderId} />
      <Field label="Motivo do cancelamento" required>
        <input name="reason" className="field" required autoFocus placeholder="Ex.: solicitacao do cliente" />
      </Field>
      <div className="flex gap-2 mt-3">
        <SubmitButton className="btn btn-danger">Confirmar cancelamento</SubmitButton>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Voltar</button>
      </div>
      <p className="text-[11.5px] text-faint mt-2">As reservas de estoque serao liberadas.</p>
    </ActionForm>
  );
}
