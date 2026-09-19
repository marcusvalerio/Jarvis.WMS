"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field } from "@/components/ui/Primitives";
import { resetSimulationAction, markScenarioEventAction } from "@/app/actions/control";
import { IconReset } from "@/components/ui/Icons";

export function ResetSimulation() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>
        <IconReset size={14} /> Reiniciar simulacao
      </button>
    );
  }

  return (
    <ActionForm action={resetSimulationAction} className="card p-5 border-error-line">
      <p className="text-[14px] font-semibold text-error-fg mb-2">Reiniciar a simulacao</p>
      <p className="text-[12.5px] text-secondary leading-relaxed mb-4 max-w-xl">
        Esta acao restaura o cenario ao estado inicial: estoque, recebimentos, pedidos, paletes,
        volumes, movimentacoes, ocorrencias e auditoria da simulacao voltam ao ponto de partida.
        Os identificadores sao deterministicos, entao os documentos ja impressos continuam validos
        e a apresentacao pode ser executada novamente do inicio.
      </p>
      <Field label='Digite REINICIAR para confirmar' required>
        <input
          name="confirm" className="field code" required autoFocus
          placeholder="REINICIAR" autoComplete="off" spellCheck={false}
        />
      </Field>
      <div className="flex gap-2 mt-4">
        <SubmitButton className="btn btn-danger" pendingLabel="Reiniciando…">
          Confirmar reinicio
        </SubmitButton>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </ActionForm>
  );
}

export function MarkEvent() {
  return (
    <ActionForm action={markScenarioEventAction} resetOnSuccess>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Etapa" className="w-[150px]">
          <input name="stage" className="field" defaultValue="APRESENTACAO" />
        </Field>
        <Field label="Marcacao na linha do tempo" className="flex-1 min-w-[200px]" required>
          <input name="label" className="field" required placeholder="Ex.: inicio da demonstracao" />
        </Field>
        <SubmitButton className="btn">Registrar marcacao</SubmitButton>
      </div>
    </ActionForm>
  );
}
