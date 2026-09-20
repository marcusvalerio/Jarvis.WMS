"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field } from "@/components/ui/Primitives";
import {
  resetSimulationAction, markScenarioEventAction, prepareDemoDocumentsAction,
} from "@/app/actions/control";
import { IconReset, IconPrint } from "@/components/ui/Icons";

export function ResetSimulation({ demoPack }: { demoPack: boolean }) {
  const [open, setOpen] = useState(false);
  const [comPacote, setComPacote] = useState(demoPack);

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
      {/* Gerar documento nao e executar a operacao: o pacote recria as
          entidades planejadas (etiquetas, picklists, romaneios) sem
          receber, embalar, carregar ou expedir coisa alguma. */}
      <label className="flex items-start gap-2 mt-4 text-[12.5px] text-secondary leading-relaxed">
        <input
          type="checkbox" name="demoPack" value="1" className="mt-0.5"
          checked={comPacote} onChange={(e) => setComPacote(e.target.checked)}
        />
        <span>
          Preparar o pacote de documentos da demonstracao (28 etiquetas de caixa,
          6 picklists, 2 romaneios e demais folhas prontas para impressao, sem
          executar a operacao).
        </span>
      </label>
      {/* O checkbox desmarcado nao e enviado pelo navegador; este campo
          garante que "desmarcado" chegue como escolha explicita. */}
      {!comPacote && <input type="hidden" name="demoPack" value="0" />}
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

/**
 * Prepara o pacote de documentos sem reiniciar o cenario. E idempotente:
 * rodar de novo nao duplica nada, so completa o que faltar.
 */
export function PrepareDemoPack({ pronto }: { pronto: boolean }) {
  return (
    <ActionForm action={prepareDemoDocumentsAction}>
      <SubmitButton className="btn" pendingLabel="Preparando…">
        <IconPrint size={14} /> {pronto ? "Completar pacote de documentos" : "Preparar documentos da demonstracao"}
      </SubmitButton>
    </ActionForm>
  );
}
