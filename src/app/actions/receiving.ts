"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as receiving from "@/domain/services/receiving";
import { createInboundInvoice } from "@/domain/services/invoices";
import { logEvent } from "@/domain/services/simulation";
import { currentOperatorId } from "@/domain/context";
import { one, all } from "@/lib/db";
import { type ActionState, ok, fail, toError, str, num, optStr } from "./result";

function refresh(inboundId?: string) {
  revalidatePath("/receiving");
  if (inboundId) revalidatePath(`/receiving/${inboundId}`);
  revalidatePath("/dashboard");
  revalidatePath("/operations");
  revalidatePath("/warehouse/storage");
  revalidatePath("/inventory");
}

export async function registerArrivalAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "inboundId");
  try {
    receiving.registerArrival({
      inboundId: id,
      dockId: optStr(form, "dockId"),
      vehiclePlate: optStr(form, "vehiclePlate"),
      driverName: optStr(form, "driverName"),
      driverDoc: optStr(form, "driverDoc"),
      operatorId: await currentOperatorId(),
    });
    logEvent("RECEIVING", `Veiculo chegou para ${id}`, "INBOUND_ORDER", id);
    refresh(id);
    return ok("Chegada registrada. Veiculo direcionado a doca.");
  } catch (e) { return toError(e); }
}

export async function startReceivingAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "inboundId");
  try {
    receiving.startReceiving(id, await currentOperatorId());
    logEvent("RECEIVING", `Descarga iniciada em ${id}`, "INBOUND_ORDER", id);
    refresh(id);
    return ok("Descarga iniciada.");
  } catch (e) { return toError(e); }
}

export async function weighAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = receiving.registerWeighing({
      refKind: (str(form, "refKind") || "INBOUND_ORDER") as any,
      refId: str(form, "refId"),
      grossKg: num(form, "grossKg"),
      tareKg: num(form, "tareKg"),
      expectedKg: form.get("expectedKg") ? num(form, "expectedKg") : null,
      equipmentId: optStr(form, "equipmentId"),
      operatorId: await currentOperatorId(),
      notes: optStr(form, "notes"),
    });
    logEvent("WEIGHING", `Pesagem ${id}`, str(form, "refKind"), str(form, "refId"));
    refresh(str(form, "refId"));
    revalidatePath("/receiving/weighing");
    revalidatePath(`/documents/weighing/${id}`);
    return ok(`Pesagem ${id} registrada.`, { weighingId: id });
  } catch (e) { return toError(e); }
}

export async function startCheckAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "inboundId");
  try {
    const checkId = receiving.startCheck(id, await currentOperatorId());
    logEvent("CHECKING", `Conferencia ${checkId} iniciada`, "INBOUND_ORDER", id);
    refresh(id);
    return ok("Conferencia iniciada.", { checkId });
  } catch (e) { return toError(e); }
}

export async function checkItemAction(_: ActionState, form: FormData): Promise<ActionState> {
  const inboundId = str(form, "inboundId");
  try {
    const r = receiving.checkItem({
      checkId: str(form, "checkId"),
      checkItemId: str(form, "checkItemId"),
      quantity: num(form, "quantity"),
      lotCode: optStr(form, "lotCode"),
      expiresAt: optStr(form, "expiresAt"),
      operatorId: await currentOperatorId(),
    });
    refresh(inboundId);
    return r.divergence === 0
      ? ok(`Linha conferida: ${r.checked} (conforme).`)
      : ok(
          `Linha conferida com divergencia de ${r.divergence > 0 ? "+" : ""}${r.divergence}. Ocorrencia ${r.incidentId} aberta.`,
          { divergence: r.divergence },
        );
  } catch (e) { return toError(e); }
}

export async function finishCheckAction(_: ActionState, form: FormData): Promise<ActionState> {
  const inboundId = str(form, "inboundId");
  try {
    const r = receiving.finishCheck(str(form, "checkId"), await currentOperatorId());
    logEvent("CHECKING", `Conferencia encerrada com ${r.divergences} divergencia(s)`, "INBOUND_ORDER", inboundId);
    refresh(inboundId);
    revalidatePath("/incidents");
    return ok(
      r.divergences > 0
        ? `Conferencia encerrada com ${r.divergences} divergencia(s). Trate as ocorrencias para liberar a armazenagem.`
        : "Conferencia aprovada sem divergencias.",
    );
  } catch (e) { return toError(e); }
}

export async function approveDivergenceAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "inboundId");
  const reason = str(form, "reason");
  if (!reason) return fail("Informe a justificativa do aceite.");
  try {
    receiving.approveWithDivergence(id, await currentOperatorId(), reason);
    refresh(id);
    return ok("Divergencia tratada. Recebimento aprovado.");
  } catch (e) { return toError(e); }
}

/** Monta um palete com as linhas conferidas selecionadas. */
export async function createPalletAction(_: ActionState, form: FormData): Promise<ActionState> {
  const inboundId = str(form, "inboundId");
  try {
    const lines: receiving.PalletLine[] = [];
    for (const key of form.keys()) {
      if (!key.startsWith("qty_")) continue;
      const productId = key.slice(4);
      const qty = num(form, key);
      if (qty <= 0) continue;
      lines.push({
        productId,
        quantity: qty,
        lotCode: optStr(form, `lot_${productId}`),
        expiresAt: optStr(form, `exp_${productId}`),
      });
    }
    if (lines.length === 0) return fail("Informe a quantidade de ao menos um produto para montar o palete.");

    const palletId = receiving.createPallet({
      lines,
      originKind: "RECEIVING",
      originRef: inboundId,
      operatorId: await currentOperatorId(),
      tareKg: form.get("tareKg") ? num(form, "tareKg") : 25,
    });
    logEvent("PALLETIZING", `Palete ${palletId} montado`, "INBOUND_ORDER", inboundId);
    refresh(inboundId);
    revalidatePath("/warehouse/pallets");
    return ok(`Palete ${palletId} montado e recebido no estoque.`, { palletId });
  } catch (e) { return toError(e); }
}

export async function generateStorageOrdersAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "inboundId");
  try {
    const created = receiving.generateStorageOrders(id, await currentOperatorId());
    refresh(id);
    return created.length === 0
      ? fail("Nao ha paletes aguardando armazenagem neste recebimento.")
      : ok(`${created.length} ordem(ns) de armazenagem gerada(s) com endereco sugerido.`);
  } catch (e) { return toError(e); }
}

export async function executeStorageAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const r = receiving.executeStorage({
      storageOrderId: str(form, "storageOrderId"),
      locationId: str(form, "locationId"),
      operatorId: await currentOperatorId(),
      overrideReason: optStr(form, "overrideReason"),
    });
    logEvent("STORAGE", `Palete ${r.palletId} armazenado em ${r.locationCode}`, "PALLET", r.palletId);
    refresh(str(form, "inboundId"));
    revalidatePath("/warehouse");
    return ok(`Palete ${r.palletId} armazenado em ${r.locationCode}.`);
  } catch (e) { return toError(e); }
}

export async function issueInvoiceAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = str(form, "inboundId");
  try {
    const io = one<any>(`SELECT * FROM inbound_orders WHERE id = ?`, id);
    if (!io) return fail("Recebimento inexistente.");
    if (io.invoice_id) return fail(`Este recebimento ja possui a nota ${io.invoice_id}.`);
    const invId = createInboundInvoice({
      inboundOrderId: id, supplierId: io.supplier_id,
      warehouseId: io.warehouse_id, actor: await currentOperatorId(),
    });
    refresh(id);
    revalidatePath("/documents");
    return ok(`Nota fiscal simulada ${invId} emitida.`, { invoiceId: invId });
  } catch (e) { return toError(e); }
}
