"use server";

import { revalidatePath } from "next/cache";
import * as counting from "@/domain/services/counting";
import { resolveIncident, setIncidentStatus, openIncident } from "@/domain/services/incidents";
import { setEquipmentStatus } from "@/domain/services/equipment";
import { resetSimulation, seed, logEvent } from "@/domain/services/simulation";
import { currentOperatorId } from "@/domain/context";
import { type ActionState, ok, fail, toError, str, num, optStr } from "./result";
import type { EquipmentStatus, IncidentKind, Severity } from "@/domain/states";

// ------------------------------------------------------------------ inventario
export async function createCountAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = await counting.createCount({
      kind: (optStr(form, "kind") ?? "CYCLIC") as any,
      zoneId: optStr(form, "zoneId"),
      operatorId: await currentOperatorId(),
      scope: optStr(form, "scope"),
    });
    revalidatePath("/inventory-count");
    revalidatePath("/mobile", "layout");
    return ok(`Inventario ${id} criado.`, { countId: id });
  } catch (e) { return toError(e); }
}

export async function startCountAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "countId");
  try {
    await counting.startCount(id, await currentOperatorId());
    revalidatePath(`/inventory-count/${id}`);
    revalidatePath("/inventory-count");
    return ok("Inventario iniciado.");
  } catch (e) { return toError(e); }
}

export async function countItemAction(_: ActionState, form: FormData): Promise<ActionState> {
  const countId = str(form, "countId");
  try {
    const r = await counting.countItem({
      countId, itemId: str(form, "itemId"),
      countedQty: num(form, "quantity"),
      operatorId: await currentOperatorId(),
    });
    revalidatePath(`/inventory-count/${countId}`);
    revalidatePath("/incidents");
    return r.divergence === 0
      ? ok(`Contagem registrada: ${r.counted}.`)
      : ok(`Divergencia de ${r.divergence > 0 ? "+" : ""}${r.divergence} registrada.`);
  } catch (e) { return toError(e); }
}

export async function closeCountAction(_: ActionState, form: FormData): Promise<ActionState> {
  const countId = str(form, "countId");
  try {
    const r = await counting.closeCount({
      countId, operatorId: await currentOperatorId(),
      applyAdjustments: form.get("applyAdjustments") === "on",
    });
    revalidatePath(`/inventory-count/${countId}`);
    revalidatePath("/inventory-count");
    revalidatePath("/inventory");
    revalidatePath("/dashboard");
    return ok(`Inventario encerrado — acuracidade ${r.accuracy.toFixed(2)}%, ${r.adjusted} ajuste(s).`);
  } catch (e) { return toError(e); }
}

// ------------------------------------------------------------------ ocorrencias
export async function resolveIncidentAction(_: ActionState, form: FormData): Promise<ActionState> {
  const resolution = str(form, "resolution");
  if (!resolution) return fail("Descreva o tratamento aplicado.");
  try {
    await resolveIncident(str(form, "incidentId"), resolution, await currentOperatorId());
    revalidatePath("/incidents");
    revalidatePath("/dashboard");
    return ok("Ocorrencia resolvida.");
  } catch (e) { return toError(e); }
}

export async function incidentStatusAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await setIncidentStatus(str(form, "incidentId"), str(form, "status"), await currentOperatorId());
    revalidatePath("/incidents");
    return ok("Status atualizado.");
  } catch (e) { return toError(e); }
}

export async function createIncidentAction(_: ActionState, form: FormData): Promise<ActionState> {
  const description = str(form, "description");
  if (!description) return fail("Descreva a ocorrencia.");
  try {
    const id = await openIncident({
      kind: str(form, "kind") as IncidentKind,
      severity: (optStr(form, "severity") ?? "MEDIA") as Severity,
      refKind: optStr(form, "refKind"),
      refId: optStr(form, "refId"),
      productId: optStr(form, "productId"),
      locationId: optStr(form, "locationId"),
      description,
      operatorId: await currentOperatorId(),
    });
    revalidatePath("/incidents");
    revalidatePath("/dashboard");
    return ok(`Ocorrencia ${id} aberta.`, { incidentId: id });
  } catch (e) { return toError(e); }
}

// ----------------------------------------------------------------- equipamento
export async function equipmentStatusAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await setEquipmentStatus({
      id: str(form, "equipmentId"),
      status: str(form, "status") as EquipmentStatus,
      note: optStr(form, "note"),
      actor: await currentOperatorId(),
    });
    revalidatePath("/equipment");
    revalidatePath("/dashboard");
    return ok("Status do equipamento atualizado.");
  } catch (e) { return toError(e); }
}

// ------------------------------------------------------------------ simulacao
export async function resetSimulationAction(_: ActionState, form: FormData): Promise<ActionState> {
  if (str(form, "confirm") !== "REINICIAR") {
    return fail('Digite REINICIAR para confirmar. A operacao apaga todo o progresso do cenario.');
  }
  try {
    const r = await resetSimulation(await currentOperatorId());
    revalidatePath("/", "layout");
    return ok(
      `Simulacao reiniciada (reset #${r.resetCount}). Estoque inicial de ${r.initialUnits} unidades restaurado em ${r.pallets} paletes.`,
    );
  } catch (e) { return toError(e); }
}

export async function markScenarioEventAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await logEvent(str(form, "stage") || "NOTA", str(form, "label"), undefined, undefined, await currentOperatorId());
    revalidatePath("/simulation");
    return ok("Marcacao registrada na linha do tempo do cenario.");
  } catch (e) { return toError(e); }
}
