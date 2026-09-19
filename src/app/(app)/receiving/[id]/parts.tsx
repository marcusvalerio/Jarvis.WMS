"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, ActionMessage } from "@/components/ActionForm";
import { Field, Card, CardHeader, SectionTitle, IdChip } from "@/components/ui/Primitives";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { CHECK_STATUS_META, PALLET_STATUS_META, TASK_STATUS_META } from "@/domain/states";
import { fmtNumber, fmtWeight, fmtDate } from "@/lib/format";
import {
  registerArrivalAction, startReceivingAction, weighAction, startCheckAction,
  checkItemAction, finishCheckAction, approveDivergenceAction, createPalletAction,
  generateStorageOrdersAction, executeStorageAction, issueInvoiceAction,
} from "@/app/actions/receiving";
import { IconCheck, IconScan } from "@/components/ui/Icons";

// --------------------------------------------------------------- 1. chegada
export function ArrivalForm({
  inboundId, docks, defaults,
}: {
  inboundId: string;
  docks: { id: string; name: string; status: string }[];
  defaults: { plate?: string; driver?: string; doc?: string; dock?: string };
}) {
  return (
    <ActionForm action={registerArrivalAction}>
      <input type="hidden" name="inboundId" value={inboundId} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label="Doca">
          <select name="dockId" className="field" defaultValue={defaults.dock ?? ""}>
            <option value="">Selecionar…</option>
            {docks.map((d) => (
              <option key={d.id} value={d.id} disabled={d.status === "BLOCKED"}>
                {d.name}{d.status === "OCCUPIED" ? " (ocupada)" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Placa do veiculo">
          <input name="vehiclePlate" className="field" defaultValue={defaults.plate ?? ""} />
        </Field>
        <Field label="Motorista">
          <input name="driverName" className="field" defaultValue={defaults.driver ?? ""} />
        </Field>
        <Field label="Documento">
          <input name="driverDoc" className="field" defaultValue={defaults.doc ?? ""} />
        </Field>
      </div>
      <div className="mt-4">
        <SubmitButton>Registrar chegada</SubmitButton>
      </div>
    </ActionForm>
  );
}

// --------------------------------------------------------------- 2. simples
export function SimpleAction({
  action, inboundId, label, className = "btn btn-primary", hint,
}: {
  action: any; inboundId: string; label: string; className?: string; hint?: string;
}) {
  return (
    <ActionForm action={action} className="inline-flex flex-col gap-2">
      <input type="hidden" name="inboundId" value={inboundId} />
      <SubmitButton className={className}>{label}</SubmitButton>
      {hint && <span className="text-[11.5px] text-faint">{hint}</span>}
    </ActionForm>
  );
}

export function StartReceiving({ inboundId }: { inboundId: string }) {
  return <SimpleAction action={startReceivingAction} inboundId={inboundId} label="Iniciar descarga" />;
}
export function StartCheck({ inboundId }: { inboundId: string }) {
  return <SimpleAction action={startCheckAction} inboundId={inboundId} label="Iniciar conferencia" />;
}
export function GenerateStorage({ inboundId }: { inboundId: string }) {
  return (
    <SimpleAction
      action={generateStorageOrdersAction} inboundId={inboundId}
      label="Gerar ordens de armazenagem"
      hint="O WMS sugere o endereco de cada palete."
    />
  );
}
export function IssueInvoice({ inboundId }: { inboundId: string }) {
  return (
    <SimpleAction
      action={issueInvoiceAction} inboundId={inboundId}
      label="Emitir NF simulada" className="btn"
    />
  );
}

// --------------------------------------------------------------- 3. pesagem
export function WeighingForm({
  refKind, refId, expectedKg, equipment,
}: {
  refKind: string; refId: string; expectedKg?: number | null;
  equipment: { id: string; model: string }[];
}) {
  const [gross, setGross] = useState("");
  const [tare, setTare] = useState("");
  const net = Number(gross || 0) - Number(tare || 0);

  return (
    <ActionForm action={weighAction} resetOnSuccess>
      <input type="hidden" name="refKind" value={refKind} />
      <input type="hidden" name="refId" value={refId} />
      {expectedKg != null && <input type="hidden" name="expectedKg" value={expectedKg} />}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <Field label="Peso bruto (kg)" required>
          <input
            name="grossKg" type="number" step="0.001" min="0" required className="field tnum"
            value={gross} onChange={(e) => setGross(e.target.value)} placeholder="0,000"
          />
        </Field>
        <Field label="Tara (kg)" required>
          <input
            name="tareKg" type="number" step="0.001" min="0" required className="field tnum"
            value={tare} onChange={(e) => setTare(e.target.value)} placeholder="0,000"
          />
        </Field>
        <div>
          <p className="label mb-1.5">Peso liquido</p>
          <p className={`text-[22px] font-[family-name:var(--font-display)] font-semibold tnum leading-[34px] ${net < 0 ? "text-error" : "text-accent"}`}>
            {net ? fmtNumber(net, 3) : "—"}
            <span className="text-[13px] text-secondary ml-1">kg</span>
          </p>
        </div>
        <Field label="Equipamento">
          <select name="equipmentId" className="field" defaultValue={equipment[0]?.id ?? ""}>
            <option value="">—</option>
            {equipment.map((e) => <option key={e.id} value={e.id}>{e.model}</option>)}
          </select>
        </Field>
        <SubmitButton>Registrar pesagem</SubmitButton>
      </div>
      {expectedKg != null && (
        <p className="text-[11.5px] text-faint mt-2.5">
          Peso previsto pela nota: <span className="tnum text-secondary">{fmtWeight(expectedKg)}</span>.
          Divergencia acima de 2% abre ocorrencia automaticamente.
        </p>
      )}
    </ActionForm>
  );
}

// --------------------------------------------------------------- 4. conferencia
export function CheckPanel({
  inboundId, checkId, items, closed,
}: {
  inboundId: string; checkId: string; closed: boolean;
  items: any[];
}) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((it) => (
        <CheckRow key={it.id} inboundId={inboundId} checkId={checkId} item={it} closed={closed} />
      ))}
      {!closed && (
        <ActionForm action={finishCheckAction} className="mt-2">
          <input type="hidden" name="inboundId" value={inboundId} />
          <input type="hidden" name="checkId" value={checkId} />
          <SubmitButton
            className="btn btn-primary"
            disabled={items.some((i) => i.status === "PENDING")}
            title={items.some((i) => i.status === "PENDING") ? "Confira todas as linhas antes de encerrar" : undefined}
          >
            Encerrar conferencia
          </SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

function CheckRow({
  inboundId, checkId, item, closed,
}: { inboundId: string; checkId: string; item: any; closed: boolean }) {
  const [qty, setQty] = useState(String(item.checked_qty || ""));
  const divergence = qty === "" ? null : Number(qty) - item.expected_qty;

  return (
    <ActionForm action={checkItemAction} className="card p-3.5">
      <input type="hidden" name="inboundId" value={inboundId} />
      <input type="hidden" name="checkId" value={checkId} />
      <input type="hidden" name="checkItemId" value={item.id} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[190px] flex-1">
          <p className="flex items-center gap-2">
            <span className="chip-id">{item.sku}</span>
            {item.status !== "PENDING" && (
              <Badge tone={item.status === "OK" ? "success" : "warning"} dot>
                {item.status === "OK" ? "Conforme" : "Divergencia"}
              </Badge>
            )}
          </p>
          <p className="text-[12.5px] text-secondary mt-1 truncate" title={item.description}>
            {item.description}
          </p>
        </div>

        <div className="text-center">
          <p className="label mb-1">Esperado</p>
          <p className="text-[19px] font-[family-name:var(--font-display)] font-semibold tnum text-secondary leading-8">
            {fmtNumber(item.expected_qty)}
          </p>
        </div>

        <Field label="Conferido" className="w-[110px]">
          <input
            name="quantity" type="number" step="0.001" min="0" required
            className="field tnum text-center" value={qty}
            onChange={(e) => setQty(e.target.value)} disabled={closed}
            placeholder={String(item.expected_qty)}
            aria-label={`Quantidade conferida de ${item.sku}, esperado ${item.expected_qty}`}
          />
        </Field>

        <div className="text-center w-[92px]">
          <p className="label mb-1">Divergencia</p>
          <p
            className={`text-[19px] font-[family-name:var(--font-display)] font-semibold tnum leading-8 ${
              divergence === null ? "text-faint" : divergence === 0 ? "text-success" : "text-warning"
            }`}
          >
            {divergence === null ? "—" : `${divergence > 0 ? "+" : ""}${fmtNumber(divergence)}`}
          </p>
        </div>

        <Field label="Lote" className="w-[120px]">
          <input name="lotCode" className="field" defaultValue={item.lot_code ?? ""} disabled={closed} />
        </Field>

        {!closed && <SubmitButton className="btn">Confirmar linha</SubmitButton>}
      </div>
    </ActionForm>
  );
}

export function ApproveDivergenceForm({ inboundId }: { inboundId: string }) {
  return (
    <ActionForm action={approveDivergenceAction}>
      <input type="hidden" name="inboundId" value={inboundId} />
      <Field label="Justificativa do aceite" required>
        <textarea
          name="reason" rows={2} required className="field"
          placeholder="Ex.: falta de 1 CX aceita, debito lancado ao fornecedor."
        />
      </Field>
      <div className="mt-3"><SubmitButton>Tratar divergencia e aprovar</SubmitButton></div>
    </ActionForm>
  );
}

// --------------------------------------------------------------- 5. paletizacao
export function PalletBuilder({
  inboundId, items,
}: { inboundId: string; items: any[] }) {
  const available = items.filter((i) => i.checked_qty > 0);
  if (available.length === 0) {
    return (
      <p className="text-[12.5px] text-secondary">
        Conclua a conferencia para liberar a paletizacao — so entra no estoque o que foi fisicamente conferido.
      </p>
    );
  }
  return (
    <ActionForm action={createPalletAction} resetOnSuccess>
      <input type="hidden" name="inboundId" value={inboundId} />
      <div className="flex flex-col gap-2">
        {available.map((it) => (
          <div key={it.id} className="flex flex-wrap items-end gap-3 p-3 rounded-md border border-border bg-bg">
            <div className="min-w-[180px] flex-1">
              <span className="chip-id">{it.sku}</span>
              <p className="text-[12px] text-secondary mt-1 truncate">{it.description}</p>
            </div>
            <p className="text-[12px] text-secondary">
              conferido <span className="tnum text-primary">{fmtNumber(it.checked_qty)}</span>
            </p>
            <Field label="Qtd no palete" className="w-[110px]">
              <input
                name={`qty_${it.product_id}`} type="number" step="0.001" min="0"
                max={it.checked_qty} className="field tnum text-center"
                defaultValue={it.checked_qty} aria-label={`Quantidade de ${it.sku} no palete`}
              />
            </Field>
            <Field label="Lote" className="w-[120px]">
              <input name={`lot_${it.product_id}`} className="field" defaultValue={it.lot_code ?? ""} />
            </Field>
            <Field label="Validade" className="w-[150px]">
              <input
                name={`exp_${it.product_id}`} type="date" className="field"
                defaultValue={it.expires_at ? String(it.expires_at).slice(0, 10) : ""}
              />
            </Field>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-3 mt-4">
        <Field label="Tara do palete (kg)" className="w-[150px]">
          <input name="tareKg" type="number" step="0.1" className="field tnum" defaultValue={25} />
        </Field>
        <SubmitButton>Montar palete e receber no estoque</SubmitButton>
      </div>
      <p className="text-[11.5px] text-faint mt-2.5">
        A montagem gera a etiqueta do palete e um movimento de entrada no endereco de recebimento.
      </p>
    </ActionForm>
  );
}

// --------------------------------------------------------------- 6. armazenagem
export function StorageExecutor({
  inboundId, order, locations,
}: {
  inboundId: string;
  order: any;
  locations: { id: string; code: string; zone: string }[];
}) {
  const [selected, setSelected] = useState<string>(order.suggested_location_id ?? "");
  const diverged = order.suggested_location_id && selected !== order.suggested_location_id;

  return (
    <ActionForm action={executeStorageAction} className="card p-4">
      <input type="hidden" name="inboundId" value={inboundId} />
      <input type="hidden" name="storageOrderId" value={order.id} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[160px]">
          <p className="label mb-1">Ordem</p>
          <IdChip id={order.id} />
          <p className="text-[12px] text-secondary mt-1.5">
            Palete <span className="code">{order.pallet_id}</span>
            {order.sku && <> · {order.sku} · <span className="tnum">{fmtNumber(order.qty)}</span></>}
          </p>
        </div>

        <div>
          <p className="label mb-1">Endereco sugerido</p>
          <p className="text-[17px] font-[family-name:var(--font-display)] font-semibold text-accent leading-8">
            {order.suggested_code ?? "—"}
          </p>
        </div>

        <Field label="Endereco confirmado" className="w-[190px]">
          <select
            name="locationId" className="field" value={selected}
            onChange={(e) => setSelected(e.target.value)} required
          >
            <option value="">Selecionar…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.code} — {l.zone}</option>
            ))}
          </select>
        </Field>

        {diverged && (
          <Field label="Justificativa do desvio" className="flex-1 min-w-[200px]" required>
            <input
              name="overrideReason" className="field" required
              placeholder="Motivo de nao usar o endereco sugerido"
            />
          </Field>
        )}

        <SubmitButton><IconCheck size={14} /> Confirmar armazenagem</SubmitButton>
      </div>

      {diverged && (
        <p className="text-[11.5px] text-warning mt-2.5">
          Endereco diferente do sugerido pelo WMS — a justificativa fica registrada na auditoria.
        </p>
      )}
    </ActionForm>
  );
}
