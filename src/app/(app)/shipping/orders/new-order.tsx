"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field } from "@/components/ui/Primitives";
import { createOrderAction } from "@/app/actions/outbound";
import { fmtNumber } from "@/lib/format";
import { IconDoc } from "@/components/ui/Icons";

export interface NewOrderProduct {
  id: string; sku: string; description: string; unit: string; available: number;
}

/** Criacao de pedido de venda com a disponibilidade visivel por linha. */
export function NewOrder({
  customers, products, warehouseId,
}: {
  customers: { id: string; name: string; city: string; state: string }[];
  products: NewOrderProduct[];
  warehouseId: string;
}) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Record<string, string>>({});

  if (!open) {
    return (
      <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>
        <IconDoc size={13} /> Novo pedido
      </button>
    );
  }

  const due = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 16);
  const total = Object.values(lines).reduce((s, v) => s + (Number(v) || 0), 0);

  return (
    <ActionForm
      action={createOrderAction}
      className="card p-5 w-full"
      onSuccess={() => { setOpen(false); setLines({}); }}
    >
      <input type="hidden" name="warehouseId" value={warehouseId} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <Field label="Cliente" required className="md:col-span-2">
          <select name="customerId" className="field" required defaultValue={customers[0]?.id}>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name} — {c.city}/{c.state}</option>
            ))}
          </select>
        </Field>
        <Field label="Prioridade">
          <select name="priority" className="field" defaultValue="NORMAL">
            <option value="URGENTE">Urgente</option>
            <option value="ALTA">Alta</option>
            <option value="NORMAL">Normal</option>
            <option value="BAIXA">Baixa</option>
          </select>
        </Field>
        <Field label="Prazo de entrega" required>
          <input name="dueAt" type="datetime-local" className="field" required defaultValue={due} />
        </Field>
        <Field label="Transportadora" className="md:col-span-2">
          <input name="carrier" className="field" defaultValue="Expresso Paulista" />
        </Field>
        <Field label="Observacoes" className="md:col-span-2">
          <input name="notes" className="field" placeholder="opcional" />
        </Field>
      </div>

      <p className="label mb-2">Itens do pedido</p>
      <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Tabela rolavel">
        <table className="table">
          <thead>
            <tr>
              <th>SKU</th><th>Produto</th><th className="num">Disponivel</th>
              <th style={{ width: 140 }}>Quantidade</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const value = lines[p.id] ?? "";
              const excede = Number(value) > p.available;
              return (
                <tr key={p.id}>
                  <td><span className="chip-id">{p.sku}</span></td>
                  <td className="max-w-[300px] truncate" title={p.description}>{p.description}</td>
                  <td className="num tnum">
                    <span className={p.available > 0 ? "text-success-fg" : "text-faint"}>
                      {fmtNumber(p.available)} {p.unit}
                    </span>
                  </td>
                  <td>
                    <input
                      name={`qty_${p.id}`} type="number" step="1" min="0"
                      className={`field tnum text-center ${excede ? "border-warning" : ""}`}
                      value={value}
                      onChange={(e) => setLines((cur) => ({ ...cur, [p.id]: e.target.value }))}
                      aria-label={`Quantidade de ${p.sku}`}
                      placeholder="0"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11.5px] text-faint mt-2.5">
        Quantidade acima do disponivel e permitida no pedido — a falta aparece na
        liberacao, que reserva apenas o que existe em estoque.
      </p>

      <div className="flex items-center gap-3 mt-4">
        <SubmitButton disabled={total <= 0}>Criar pedido</SubmitButton>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
        <span className="text-[12.5px] text-secondary ml-auto tnum">
          {fmtNumber(total)} unidade(s) em {Object.values(lines).filter((v) => Number(v) > 0).length} linha(s)
        </span>
      </div>
    </ActionForm>
  );
}
