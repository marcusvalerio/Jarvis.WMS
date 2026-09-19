"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Field } from "@/components/ui/Primitives";
import { weighAction } from "@/app/actions/receiving";
import { fmtNumber } from "@/lib/format";

interface Target { kind: string; id: string; label: string; expected: number }

export function WeighingStation({
  targets, equipment,
}: { targets: Target[]; equipment: { id: string; model: string }[] }) {
  const [targetId, setTargetId] = useState(targets[0]?.id ?? "");
  const [gross, setGross] = useState("");
  const [tare, setTare] = useState("");

  const target = targets.find((t) => t.id === targetId);
  const net = Number(gross || 0) - Number(tare || 0);
  const divergence = target?.expected ? net - target.expected : null;

  return (
    <ActionForm action={weighAction} resetOnSuccess>
      <input type="hidden" name="refKind" value={target?.kind ?? "INBOUND_ORDER"} />
      {target?.expected ? <input type="hidden" name="expectedKg" value={target.expected} /> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
        <Field label="Referencia" className="lg:col-span-2" required>
          <select
            name="refId" className="field" required
            value={targetId} onChange={(e) => { setTargetId(e.target.value); }}
          >
            {targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Field>

        <Field label="Peso bruto (kg)" required>
          <input
            name="grossKg" type="number" step="0.001" min="0" required
            className="field tnum text-center" value={gross}
            onChange={(e) => setGross(e.target.value)} placeholder="0,000"
          />
        </Field>

        <Field label="Tara (kg)" required>
          <input
            name="tareKg" type="number" step="0.001" min="0" required
            className="field tnum text-center" value={tare}
            onChange={(e) => setTare(e.target.value)} placeholder="0,000"
          />
        </Field>

        <div>
          <p className="label mb-1.5">Peso liquido</p>
          <p className={`text-[24px] font-[family-name:var(--font-display)] font-semibold tnum leading-[34px] ${
            net < 0 ? "text-error-fg" : net > 0 ? "text-accent-fg" : "text-faint"
          }`}>
            {net ? fmtNumber(net, 3) : "—"}
          </p>
        </div>

        <Field label="Equipamento">
          <select name="equipmentId" className="field" defaultValue={equipment[0]?.id ?? ""}>
            <option value="">—</option>
            {equipment.map((e) => <option key={e.id} value={e.id}>{e.model}</option>)}
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-4 mt-4">
        <SubmitButton>Registrar pesagem</SubmitButton>
        {target?.expected ? (
          <p className="text-[12.5px] text-secondary">
            Previsto <span className="tnum text-primary">{fmtNumber(target.expected, 3)} kg</span>
            {divergence !== null && net > 0 && (
              <>
                {" · divergencia "}
                <span className={`tnum ${Math.abs(divergence) > target.expected * 0.02 ? "text-warning-fg" : "text-success-fg"}`}>
                  {divergence > 0 ? "+" : ""}{fmtNumber(divergence, 3)} kg
                </span>
              </>
            )}
          </p>
        ) : null}
      </div>
      <p className="text-[11.5px] text-faint mt-2">
        Divergencia acima de 2% do previsto abre ocorrencia automaticamente.
      </p>
    </ActionForm>
  );
}
