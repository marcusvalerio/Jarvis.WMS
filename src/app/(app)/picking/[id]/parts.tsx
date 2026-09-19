"use client";

import { useEffect, useRef, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field } from "@/components/ui/Primitives";
import {
  startPickingAction, scanLocationAction, scanProductAction,
  confirmPickAction, skipPickAction,
} from "@/app/actions/outbound";
import { fmtNumber } from "@/lib/format";
import { IconScan, IconCheck, IconAlert } from "@/components/ui/Icons";

export function StartPicking({
  pickingId, equipment,
}: { pickingId: string; equipment: { id: string; model: string }[] }) {
  return (
    <ActionForm action={startPickingAction}>
      <input type="hidden" name="pickingId" value={pickingId} />
      <div className="flex items-end gap-3">
        <Field label="Coletora" className="w-[220px]">
          <select name="equipmentId" className="field" defaultValue={equipment[0]?.id ?? ""}>
            <option value="">Sem equipamento</option>
            {equipment.map((e) => <option key={e.id} value={e.id}>{e.model}</option>)}
          </select>
        </Field>
        <SubmitButton>Iniciar separacao</SubmitButton>
      </div>
    </ActionForm>
  );
}

/**
 * Execucao guiada da linha corrente.
 * A sequencia e obrigatoria: endereco → produto → quantidade. O backend
 * recusa qualquer passo fora de ordem; aqui a tela apenas reflete o estado.
 */
export function PickExecutor({ pickingId, item }: { pickingId: string; item: any }) {
  const step: "SCAN_LOCATION" | "SCAN_PRODUCT" | "CONFIRM_QTY" =
    item.status === "PENDING" ? "SCAN_LOCATION"
    : item.status === "LOCATION_SCANNED" ? "SCAN_PRODUCT"
    : "CONFIRM_QTY";

  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, [step, item.id]);

  return (
    <div className="card-elevated p-5 border-l-2 border-l-accent">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <p className="eyebrow mb-1.5">Linha {item.sequence} · {item.zone_name}</p>
          <p className="text-[30px] leading-none font-[family-name:var(--font-display)] font-semibold">
            {item.location_code}
          </p>
          <p className="text-[13px] text-secondary mt-2">
            <span className="chip-id">{item.sku}</span>
            <span className="ml-2">{item.description}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="label mb-1">Quantidade a coletar</p>
          <p className="text-[34px] leading-none font-[family-name:var(--font-display)] font-semibold text-accent tnum">
            {fmtNumber(item.expected_qty)}
            <span className="text-[14px] text-secondary ml-1.5">{item.unit}</span>
          </p>
          {item.lot_code && <p className="text-[12px] text-faint mt-2">Lote {item.lot_code}</p>}
        </div>
      </div>

      <ol className="flex items-center gap-2 mb-5" aria-label="Etapas da linha">
        <Step n={1} label="Bipar endereco" done={step !== "SCAN_LOCATION"} active={step === "SCAN_LOCATION"} />
        <Step n={2} label="Bipar produto" done={step === "CONFIRM_QTY"} active={step === "SCAN_PRODUCT"} />
        <Step n={3} label="Confirmar quantidade" done={false} active={step === "CONFIRM_QTY"} />
      </ol>

      {step === "SCAN_LOCATION" && (
        <ActionForm action={scanLocationAction} resetOnSuccess key="loc">
          <input type="hidden" name="pickingId" value={pickingId} />
          <div className="flex items-end gap-2">
            <Field label={`Bipe o endereco ${item.location_code}`} className="flex-1">
              <ScanInput inputRef={ref} name="code" placeholder="A-02-03-01" />
            </Field>
            <SubmitButton>Validar endereco</SubmitButton>
          </div>
        </ActionForm>
      )}

      {step === "SCAN_PRODUCT" && (
        <ActionForm action={scanProductAction} resetOnSuccess key="prod">
          <input type="hidden" name="pickingId" value={pickingId} />
          <div className="flex items-end gap-2">
            <Field label={`Bipe o produto ${item.sku}`} className="flex-1">
              <ScanInput inputRef={ref} name="code" placeholder="SKU-001 ou EAN" />
            </Field>
            <SubmitButton>Validar produto</SubmitButton>
          </div>
        </ActionForm>
      )}

      {step === "CONFIRM_QTY" && (
        <ActionForm action={confirmPickAction} key="qty">
          <input type="hidden" name="pickingId" value={pickingId} />
          <div className="flex items-end gap-2">
            <Field label="Quantidade coletada" className="w-[180px]">
              <input
                ref={ref as any} name="quantity" type="number" step="0.001" min="0"
                max={item.expected_qty} required defaultValue={item.expected_qty}
                className="field tnum text-center text-[17px] h-11"
              />
            </Field>
            <SubmitButton className="btn btn-primary btn-lg"><IconCheck size={15} /> Confirmar coleta</SubmitButton>
          </div>
          <p className="text-[11.5px] text-faint mt-2">
            Quantidade acima de {fmtNumber(item.expected_qty)} e recusada pelo sistema.
          </p>
        </ActionForm>
      )}

      <details className="mt-5">
        <summary className="text-[12px] text-faint cursor-pointer hover:text-secondary">
          Produto nao localizado?
        </summary>
        <ActionForm action={skipPickAction} className="mt-3">
          <input type="hidden" name="pickingId" value={pickingId} />
          <div className="flex items-end gap-2">
            <Field label="Motivo" className="flex-1">
              <input name="reason" className="field" required placeholder="Ex.: endereco vazio, produto avariado" />
            </Field>
            <SubmitButton className="btn btn-danger"><IconAlert size={14} /> Pular linha</SubmitButton>
          </div>
          <p className="text-[11.5px] text-faint mt-2">
            Gera ocorrencia de produto nao localizado e marca a linha como divergente.
          </p>
        </ActionForm>
      </details>
    </div>
  );
}

function ScanInput({
  inputRef, name, placeholder,
}: { inputRef: React.RefObject<HTMLInputElement | null>; name: string; placeholder: string }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-accent pointer-events-none">
        <IconScan size={17} />
      </span>
      <input
        ref={inputRef} name={name} className="field pl-10 code h-11 text-[16px]"
        placeholder={placeholder} autoComplete="off" spellCheck={false} autoFocus required
      />
    </div>
  );
}

function Step({ n, label, done, active }: { n: number; label: string; done: boolean; active: boolean }) {
  return (
    <li className={`flex items-center gap-2 h-7 px-2.5 rounded-md border text-[12px] ${
      done ? "border-[#1F3A2C] bg-[#12201A] text-success"
      : active ? "border-accent/40 bg-accent/10 text-accent"
      : "border-border text-faint"
    }`}>
      <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[9.5px] tnum">
        {done ? "✓" : n}
      </span>
      {label}
    </li>
  );
}
