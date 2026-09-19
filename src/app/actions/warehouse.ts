"use server";

import { revalidatePath } from "next/cache";
import { executeStorage } from "@/domain/services/receiving";
import { setLocationStatus } from "@/domain/services/warehouse";
import { movePallet, block, unblock } from "@/domain/services/inventory";
import { logEvent } from "@/domain/services/simulation";
import { currentOperatorId } from "@/domain/context";
import { type ActionState, ok, fail, toError, str, num, optStr } from "./result";

function refresh() {
  revalidatePath("/warehouse");
  revalidatePath("/warehouse/storage");
  revalidatePath("/warehouse/pallets");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/operations");
}

export async function storeFromQueueAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const r = await executeStorage({
      storageOrderId: str(form, "storageOrderId"),
      locationId: str(form, "locationId"),
      operatorId: await currentOperatorId(),
      overrideReason: optStr(form, "overrideReason"),
    });
    await logEvent("STORAGE", `Palete ${r.palletId} armazenado em ${r.locationCode}`, "PALLET", r.palletId);
    refresh();
    revalidatePath("/receiving");
    return ok(`Palete ${r.palletId} armazenado em ${r.locationCode}.`);
  } catch (e) { return toError(e); }
}

export async function transferPalletAction(_: ActionState, form: FormData): Promise<ActionState> {
  const palletId = str(form, "palletId");
  try {
    await movePallet({
      palletId,
      toLocationId: str(form, "locationId"),
      kind: "TRANSFER",
      refKind: "MANUAL",
      reason: str(form, "reason") || "Transferencia interna",
      operatorId: await currentOperatorId(),
    });
    await logEvent("MOVEMENT", `Palete ${palletId} transferido`, "PALLET", palletId);
    refresh();
    revalidatePath(`/warehouse/pallets/${palletId}`);
    return ok("Transferencia registrada.");
  } catch (e) { return toError(e); }
}

export async function setLocationStatusAction(_: ActionState, form: FormData): Promise<ActionState> {
  const locationId = str(form, "locationId");
  const status = str(form, "status");
  try {
    await setLocationStatus(locationId, status, optStr(form, "reason"), await currentOperatorId());
    refresh();
    revalidatePath(`/warehouse/${locationId}`);
    return ok(`Endereco atualizado para ${status}.`);
  } catch (e) { return toError(e); }
}

export async function blockStockAction(_: ActionState, form: FormData): Promise<ActionState> {
  const reason = str(form, "reason");
  if (!reason) return fail("Informe o motivo do bloqueio.");
  try {
    await block({
      inventoryId: str(form, "inventoryId"),
      quantity: num(form, "quantity"),
      reason,
      operatorId: await currentOperatorId(),
    });
    refresh();
    return ok("Quantidade bloqueada.");
  } catch (e) { return toError(e); }
}

export async function unblockStockAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await unblock({
      inventoryId: str(form, "inventoryId"),
      quantity: num(form, "quantity"),
      reason: str(form, "reason") || "Liberacao de bloqueio",
      operatorId: await currentOperatorId(),
    });
    refresh();
    return ok("Quantidade desbloqueada.");
  } catch (e) { return toError(e); }
}
