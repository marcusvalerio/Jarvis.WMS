"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as orders from "@/domain/services/orders";
import * as picking from "@/domain/services/picking";
import * as packing from "@/domain/services/packing";
import * as shipping from "@/domain/services/shipping";
import { createOutboundInvoice } from "@/domain/services/invoices";
import { logEvent } from "@/domain/services/simulation";
import { currentOperatorId } from "@/domain/context";
import { type ActionState, ok, fail, toError, str, num, optStr } from "./result";

function refresh(orderId?: string) {
  revalidatePath("/shipping");
  revalidatePath("/shipping/orders");
  revalidatePath("/shipping/manifests");
  revalidatePath("/shipping/loading");
  revalidatePath("/picking");
  revalidatePath("/packing");
  revalidatePath("/inventory");
  revalidatePath("/dashboard");
  revalidatePath("/operations");
  if (orderId) revalidatePath(`/shipping/orders/${orderId}`);
}

// ------------------------------------------------------------------ pedidos
export async function releaseOrderAction(_: ActionState, form: FormData): Promise<ActionState> {
  const orderId = str(form, "orderId");
  try {
    const r = await orders.releaseOrder(orderId, await currentOperatorId());
    await logEvent("RESERVATION", `Pedido ${orderId} liberado para separacao`, "SALES_ORDER", orderId);
    refresh(orderId);
    if (!r.fullyReserved) {
      const faltas = r.lines.filter((l) => l.shortage > 0)
        .map((l) => `${l.sku} (faltam ${l.shortage})`).join(", ");
      return ok(
        `Reserva parcial: ${faltas}. O pedido so avanca quando houver estoque — receba a carga pendente e libere novamente.`,
      );
    }
    return ok("Pedido reservado integralmente. Gere a picklist para iniciar a separacao.");
  } catch (e) { return toError(e); }
}

export async function cancelOrderAction(_: ActionState, form: FormData): Promise<ActionState> {
  const orderId = str(form, "orderId");
  const reason = str(form, "reason");
  if (!reason) return fail("Informe o motivo do cancelamento.");
  try {
    await orders.cancelOrder(orderId, await currentOperatorId(), reason);
    refresh(orderId);
    return ok("Pedido cancelado e reservas liberadas.");
  } catch (e) { return toError(e); }
}

export async function createOrderAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const items: { productId: string; quantity: number }[] = [];
    for (const key of form.keys()) {
      if (!key.startsWith("qty_")) continue;
      const qty = num(form, key);
      if (qty > 0) items.push({ productId: key.slice(4), quantity: qty });
    }
    if (items.length === 0) return fail("Informe ao menos um item com quantidade.");
    const id = await orders.createOrder({
      customerId: str(form, "customerId"),
      warehouseId: str(form, "warehouseId") || "CD-01",
      priority: str(form, "priority") || "NORMAL",
      dueAt: new Date(str(form, "dueAt") || Date.now() + 864e5).toISOString(),
      carrier: optStr(form, "carrier"),
      notes: optStr(form, "notes"),
      items,
      actor: await currentOperatorId(),
    });
    refresh(id);
    return ok(`Pedido ${id} criado.`, { orderId: id });
  } catch (e) { return toError(e); }
}

// ------------------------------------------------------------------ picking
export async function generatePicklistAction(_: ActionState, form: FormData): Promise<ActionState> {
  const orderId = str(form, "orderId");
  try {
    const id = await picking.generatePicklist(orderId, await currentOperatorId());
    await logEvent("PICKING", `Picklist ${id} gerada`, "SALES_ORDER", orderId);
    refresh(orderId);
    return ok(`Picklist ${id} gerada na sequencia da rota do armazem.`, { pickingId: id });
  } catch (e) { return toError(e); }
}

export async function startPickingAction(_: ActionState, form: FormData): Promise<ActionState> {
  const pickingId = str(form, "pickingId");
  try {
    await picking.startPicking(pickingId, await currentOperatorId(), optStr(form, "equipmentId"));
    refresh();
    revalidatePath(`/picking/${pickingId}`);
    return ok("Separacao iniciada.");
  } catch (e) { return toError(e); }
}

export async function scanLocationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const pickingId = str(form, "pickingId");
  try {
    const r = await picking.scanLocation({
      pickingId, rawCode: str(form, "code"), operatorId: await currentOperatorId(),
    });
    revalidatePath(`/picking/${pickingId}`);
    return r.ok
      ? ok(r.message, { step: r.nextStep })
      : fail(r.message, { step: r.nextStep, code: r.code });
  } catch (e) { return toError(e); }
}

export async function scanProductAction(_: ActionState, form: FormData): Promise<ActionState> {
  const pickingId = str(form, "pickingId");
  try {
    const r = await picking.scanProduct({
      pickingId, rawCode: str(form, "code"), operatorId: await currentOperatorId(),
    });
    revalidatePath(`/picking/${pickingId}`);
    return r.ok
      ? ok(r.message, { step: r.nextStep })
      : fail(r.message, { step: r.nextStep, code: r.code });
  } catch (e) { return toError(e); }
}

export async function confirmPickAction(_: ActionState, form: FormData): Promise<ActionState> {
  const pickingId = str(form, "pickingId");
  try {
    const r = await picking.confirmPick({
      pickingId, quantity: num(form, "quantity"),
      operatorId: await currentOperatorId(), origin: "WEB",
    });
    refresh();
    revalidatePath(`/picking/${pickingId}`);
    return r.ok ? ok(r.message, { step: r.nextStep }) : fail(r.message, { code: r.code });
  } catch (e) { return toError(e); }
}

export async function skipPickAction(_: ActionState, form: FormData): Promise<ActionState> {
  const pickingId = str(form, "pickingId");
  const reason = str(form, "reason");
  if (!reason) return fail("Informe o motivo para pular a linha.");
  try {
    const r = await picking.skipItem({ pickingId, reason, operatorId: await currentOperatorId() });
    refresh();
    revalidatePath(`/picking/${pickingId}`);
    revalidatePath("/incidents");
    return ok(r.message);
  } catch (e) { return toError(e); }
}

// ------------------------------------------------------------------ packing
export async function generatePackingAction(_: ActionState, form: FormData): Promise<ActionState> {
  const orderId = str(form, "orderId");
  try {
    const id = await packing.generatePacking(orderId, await currentOperatorId());
    refresh(orderId);
    return ok(`Ordem de embalagem ${id} criada.`, { packingId: id });
  } catch (e) { return toError(e); }
}

export async function startPackingAction(_: ActionState, form: FormData): Promise<ActionState> {
  const packingId = str(form, "packingId");
  try {
    await packing.startPacking(packingId, await currentOperatorId());
    revalidatePath(`/packing/${packingId}`);
    refresh();
    return ok("Embalagem iniciada.");
  } catch (e) { return toError(e); }
}

export async function createVolumeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const packingId = str(form, "packingId");
  try {
    const id = await packing.createVolume({
      packingId, operatorId: await currentOperatorId(),
      containerKind: optStr(form, "containerKind"),
      length: form.get("length") ? num(form, "length") : undefined,
      width: form.get("width") ? num(form, "width") : undefined,
      height: form.get("height") ? num(form, "height") : undefined,
      tareKg: form.get("tareKg") ? num(form, "tareKg") : undefined,
    });
    revalidatePath(`/packing/${packingId}`);
    refresh();
    return ok(`Volume ${id} criado.`, { volumeId: id });
  } catch (e) { return toError(e); }
}

export async function addToVolumeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const packingId = str(form, "packingId");
  try {
    await packing.addToVolume({
      volumeId: str(form, "volumeId"),
      productId: str(form, "productId"),
      quantity: num(form, "quantity"),
      operatorId: await currentOperatorId(),
    });
    revalidatePath(`/packing/${packingId}`);
    refresh();
    return ok("Item embalado no volume.");
  } catch (e) { return toError(e); }
}

export async function removeFromVolumeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const packingId = str(form, "packingId");
  try {
    await packing.removeFromVolume({
      volumeId: str(form, "volumeId"),
      productId: str(form, "productId"),
      operatorId: await currentOperatorId(),
    });
    revalidatePath(`/packing/${packingId}`);
    refresh();
    return ok("Item removido do volume.");
  } catch (e) { return toError(e); }
}

export async function closeVolumeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const packingId = str(form, "packingId");
  try {
    await packing.closeVolume(str(form, "volumeId"), await currentOperatorId());
    revalidatePath(`/packing/${packingId}`);
    refresh();
    return ok("Volume fechado e etiqueta liberada.");
  } catch (e) { return toError(e); }
}

export async function completePackingAction(_: ActionState, form: FormData): Promise<ActionState> {
  const packingId = str(form, "packingId");
  try {
    const r = await packing.completePacking(packingId, await currentOperatorId());
    await logEvent("PACKING", `Embalagem ${packingId} concluida`, "PACKING_ORDER", packingId);
    revalidatePath(`/packing/${packingId}`);
    refresh();
    return ok(`Embalagem concluida: ${r.volumes} volume(s), ${r.weightKg} kg.`);
  } catch (e) { return toError(e); }
}

// ------------------------------------------------------------------ expedicao
export async function startShippingCheckAction(_: ActionState, form: FormData): Promise<ActionState> {
  const orderId = str(form, "orderId");
  try {
    const id = await shipping.startShippingCheck(orderId, await currentOperatorId());
    refresh(orderId);
    return ok("Conferencia de expedicao iniciada. Bipe todos os volumes.", { checkId: id });
  } catch (e) { return toError(e); }
}

export async function checkVolumeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const orderId = str(form, "orderId");
  try {
    const r = await shipping.checkVolume({
      checkId: str(form, "checkId"),
      volumeCode: str(form, "code"),
      operatorId: await currentOperatorId(),
    });
    refresh(orderId);
    return r.ok ? ok(r.message) : fail(r.message);
  } catch (e) { return toError(e); }
}

export async function finishShippingCheckAction(_: ActionState, form: FormData): Promise<ActionState> {
  const orderId = str(form, "orderId");
  try {
    const r = await shipping.finishShippingCheck(str(form, "checkId"), await currentOperatorId());
    await logEvent("SHIPPING_CHECK", `Conferencia de expedicao de ${orderId} encerrada`, "SALES_ORDER", orderId);
    refresh(orderId);
    return r.divergences > 0
      ? fail(`Conferencia encerrada com ${r.divergences} divergencia(s). O pedido nao avanca ate o tratamento.`)
      : ok("Conferencia aprovada. Pedido pronto para carregar.");
  } catch (e) { return toError(e); }
}

// ------------------------------------------------------------------ romaneio
export async function createManifestAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const id = await shipping.createManifest({
      warehouseId: str(form, "warehouseId") || "CD-01",
      route: str(form, "route"),
      carrier: optStr(form, "carrier"),
      vehiclePlate: optStr(form, "vehiclePlate"),
      vehicleKind: optStr(form, "vehicleKind"),
      driverName: optStr(form, "driverName"),
      driverDoc: optStr(form, "driverDoc"),
      dockId: optStr(form, "dockId"),
      actor: await currentOperatorId(),
    });
    refresh();
    return ok(`Romaneio ${id} criado.`, { manifestId: id });
  } catch (e) { return toError(e); }
}

export async function addOrderToManifestAction(_: ActionState, form: FormData): Promise<ActionState> {
  const manifestId = str(form, "manifestId");
  try {
    await shipping.addOrderToManifest({
      manifestId, orderId: str(form, "orderId"), actor: await currentOperatorId(),
    });
    revalidatePath(`/shipping/manifests/${manifestId}`);
    refresh();
    return ok("Pedido incluido no romaneio.");
  } catch (e) { return toError(e); }
}

export async function removeOrderFromManifestAction(_: ActionState, form: FormData): Promise<ActionState> {
  const manifestId = str(form, "manifestId");
  try {
    await shipping.removeOrderFromManifest(manifestId, str(form, "orderId"), await currentOperatorId());
    revalidatePath(`/shipping/manifests/${manifestId}`);
    refresh();
    return ok("Pedido removido do romaneio.");
  } catch (e) { return toError(e); }
}

export async function releaseManifestAction(_: ActionState, form: FormData): Promise<ActionState> {
  const manifestId = str(form, "manifestId");
  try {
    await shipping.releaseManifest(manifestId, await currentOperatorId());
    await shipping.createTransportDocument(manifestId, await currentOperatorId());
    revalidatePath(`/shipping/manifests/${manifestId}`);
    revalidatePath("/documents");
    refresh();
    return ok("Romaneio liberado e documento de transporte simulado emitido.");
  } catch (e) { return toError(e); }
}

// ------------------------------------------------------------------ carregamento
export async function startLoadingAction(_: ActionState, form: FormData): Promise<ActionState> {
  const manifestId = str(form, "manifestId");
  try {
    const id = await shipping.startLoading({
      manifestId, dockId: optStr(form, "dockId"),
      operatorId: await currentOperatorId(), equipmentId: optStr(form, "equipmentId"),
    });
    await logEvent("LOADING", `Carregamento ${id} iniciado`, "MANIFEST", manifestId);
    revalidatePath(`/shipping/manifests/${manifestId}`);
    revalidatePath(`/shipping/loading/${id}`);
    refresh();
    return ok(`Carregamento ${id} iniciado.`, { loadingId: id });
  } catch (e) { return toError(e); }
}

export async function scanLoadingVolumeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const loadingId = str(form, "loadingId");
  try {
    const r = await shipping.scanVolumeForLoading({
      loadingId, volumeCode: str(form, "code"), operatorId: await currentOperatorId(),
    });
    revalidatePath(`/shipping/loading/${loadingId}`);
    refresh();
    return r.ok ? ok(r.message, { loaded: r.loaded, expected: r.expected }) : fail(r.message);
  } catch (e) { return toError(e); }
}

export async function completeLoadingAction(_: ActionState, form: FormData): Promise<ActionState> {
  const loadingId = str(form, "loadingId");
  try {
    const r = await shipping.completeLoading({
      loadingId, seal: str(form, "seal"), operatorId: await currentOperatorId(),
      allowPartial: form.get("allowPartial") === "on",
    });
    revalidatePath(`/shipping/loading/${loadingId}`);
    refresh();
    return ok(
      r.missing > 0
        ? `Carregamento encerrado com ${r.missing} volume(s) faltante(s) — ocorrencia registrada.`
        : "Carregamento concluido e veiculo lacrado.",
    );
  } catch (e) { return toError(e); }
}

export async function shipManifestAction(_: ActionState, form: FormData): Promise<ActionState> {
  const manifestId = str(form, "manifestId");
  try {
    const r = await shipping.shipManifest(manifestId, await currentOperatorId());
    await logEvent("SHIPPING", `Romaneio ${manifestId} expedido`, "MANIFEST", manifestId);
    revalidatePath(`/shipping/manifests/${manifestId}`);
    revalidatePath("/documents");
    refresh();
    return ok(`Expedicao concluida: ${r.orders} pedido(s) despachado(s) e estoque baixado.`);
  } catch (e) { return toError(e); }
}

export async function issueOutboundInvoiceAction(_: ActionState, form: FormData): Promise<ActionState> {
  const orderId = str(form, "orderId");
  try {
    const id = await createOutboundInvoice({
      salesOrderId: orderId, warehouseId: "CD-01", actor: await currentOperatorId(),
    });
    refresh(orderId);
    revalidatePath("/documents");
    return ok(`Nota fiscal simulada de saida ${id} emitida.`, { invoiceId: id });
  } catch (e) { return toError(e); }
}
