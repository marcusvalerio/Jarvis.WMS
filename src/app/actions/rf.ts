"use server";

import { revalidatePath } from "next/cache";
import { resolveScan, logScan } from "@/domain/services/scan";
import * as picking from "@/domain/services/picking";
import * as receiving from "@/domain/services/receiving";
import * as shipping from "@/domain/services/shipping";
import * as counting from "@/domain/services/counting";
import { currentOperatorId } from "@/domain/context";
import { logEvent } from "@/domain/services/simulation";
import { one } from "@/lib/db";
import { normalizeLocationInput } from "@/lib/ids";
import { type ActionState, ok, fail, toError, str, num } from "./result";

const DEVICE = "COLETORA-USB";

function refreshAll() {
  revalidatePath("/dashboard");
  revalidatePath("/operations");
  revalidatePath("/inventory");
  revalidatePath("/warehouse");
  revalidatePath("/warehouse/storage");
  revalidatePath("/picking");
  revalidatePath("/receiving");
  revalidatePath("/shipping");
  revalidatePath("/mobile", "layout");
}

// ------------------------------------------------------------- consulta livre
export async function lookupAction(_: ActionState, form: FormData): Promise<ActionState> {
  const code = str(form, "code");
  if (!code) return fail("Nenhum codigo lido.");
  const operatorId = await currentOperatorId();
  const resolved = resolveScan(code);
  logScan({
    raw: code, resolved, operation: "LOOKUP",
    result: resolved.found ? "OK" : "REJECTED",
    message: resolved.label, operatorId, deviceId: DEVICE,
  });
  revalidatePath("/mobile/scan");
  if (!resolved.found) {
    return fail(`CODIGO NAO RECONHECIDO: ${code}`, { resolved });
  }
  return ok(resolved.label, { resolved });
}

// --------------------------------------------------------------- armazenagem
/** Passo 1: bipar o palete. */
export async function putawayScanPalletAction(_: ActionState, form: FormData): Promise<ActionState> {
  const code = str(form, "code").toUpperCase();
  const operatorId = await currentOperatorId();
  const resolved = resolveScan(code);

  const reject = (msg: string) => {
    logScan({ raw: code, resolved, operation: "PUTAWAY_PALLET", result: "REJECTED", message: msg, operatorId, deviceId: DEVICE });
    return fail(msg);
  };

  if (resolved.kind !== "PALLET" || !resolved.found) return reject(`NAO E UM PALETE: ${code}`);

  const pallet = resolved.data?.pallet;
  if (pallet.status === "STORED") {
    return reject(`PALETE JA ARMAZENADO em ${pallet.location_code}`);
  }
  if (pallet.status !== "AWAITING_PUTAWAY") {
    return reject(`PALETE NAO ESTA AGUARDANDO ARMAZENAGEM (${pallet.status})`);
  }
  const order = receiving.storageOrderForPallet(pallet.id);
  if (!order) return reject(`SEM ORDEM DE ARMAZENAGEM para ${pallet.id}`);

  logScan({ raw: code, resolved, operation: "PUTAWAY_PALLET", contextRef: order.id, result: "OK", message: "Palete identificado", operatorId, deviceId: DEVICE });
  revalidatePath("/mobile/putaway");
  return ok(`Palete ${pallet.id} identificado.`, {
    palletId: pallet.id,
    storageOrderId: order.id,
    suggested: order.suggested_code,
    suggestedId: order.suggested_location_id,
    items: resolved.data?.items ?? [],
  });
}

/** Passo 2: bipar o endereco e confirmar a armazenagem. */
export async function putawayScanLocationAction(_: ActionState, form: FormData): Promise<ActionState> {
  const code = str(form, "code").toUpperCase();
  const storageOrderId = str(form, "storageOrderId");
  const operatorId = await currentOperatorId();
  const resolved = resolveScan(code);

  const reject = (msg: string) => {
    logScan({ raw: code, resolved, operation: "PUTAWAY_LOCATION", contextRef: storageOrderId, result: "REJECTED", message: msg, operatorId, deviceId: DEVICE });
    return fail(msg);
  };

  const locationId = normalizeLocationInput(code);
  if (!locationId || !resolved.found || resolved.kind !== "LOCATION") {
    return reject(`NAO E UM ENDERECO: ${code}`);
  }
  const order = receiving.getStorageOrder(storageOrderId);
  if (!order) return reject("ORDEM DE ARMAZENAGEM INEXISTENTE");

  if (order.suggested_location_id && order.suggested_location_id !== locationId) {
    return reject(`ENDERECO INCORRETO. Esperado ${order.suggested_code}, lido ${resolved.label}.`);
  }

  try {
    const r = receiving.executeStorage({
      storageOrderId, locationId, operatorId, origin: "RF",
    });
    logScan({ raw: code, resolved, operation: "PUTAWAY_LOCATION", contextRef: storageOrderId, result: "OK", message: `Armazenado em ${r.locationCode}`, operatorId, deviceId: DEVICE });
    logEvent("STORAGE", `Palete ${r.palletId} armazenado em ${r.locationCode} (coletora)`, "PALLET", r.palletId, operatorId);
    refreshAll();
    return ok(`ARMAZENADO. ${r.palletId} em ${r.locationCode}.`, { done: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha na armazenagem";
    return reject(msg.toUpperCase());
  }
}

// -------------------------------------------------------------------- picking
export async function rfPickScanAction(_: ActionState, form: FormData): Promise<ActionState> {
  const pickingId = str(form, "pickingId");
  const code = str(form, "code");
  const step = str(form, "step");
  const operatorId = await currentOperatorId();
  const resolved = resolveScan(code);

  try {
    const r = step === "SCAN_LOCATION"
      ? picking.scanLocation({ pickingId, rawCode: code, operatorId })
      : picking.scanProduct({ pickingId, rawCode: code, operatorId });

    logScan({
      raw: code, resolved, operation: step, contextRef: pickingId,
      result: r.ok ? "OK" : "REJECTED", message: r.message, operatorId, deviceId: DEVICE,
    });
    revalidatePath("/mobile/picking");
    return r.ok ? ok(r.message, { step: r.nextStep }) : fail(r.message, { step: r.nextStep });
  } catch (e) { return toError(e); }
}

export async function rfPickConfirmAction(_: ActionState, form: FormData): Promise<ActionState> {
  const pickingId = str(form, "pickingId");
  const operatorId = await currentOperatorId();
  try {
    const r = picking.confirmPick({
      pickingId, quantity: num(form, "quantity"), operatorId, origin: "RF",
    });
    refreshAll();
    return r.ok ? ok(r.message, { step: r.nextStep }) : fail(r.message);
  } catch (e) { return toError(e); }
}

export async function rfStartPickingAction(_: ActionState, form: FormData): Promise<ActionState> {
  const pickingId = str(form, "pickingId");
  try {
    picking.startPicking(pickingId, await currentOperatorId());
    revalidatePath("/mobile/picking");
    return ok("Separacao iniciada.");
  } catch (e) { return toError(e); }
}

// --------------------------------------------------------------- carregamento
export async function rfLoadingScanAction(_: ActionState, form: FormData): Promise<ActionState> {
  const loadingId = str(form, "loadingId");
  const code = str(form, "code");
  const operatorId = await currentOperatorId();
  const resolved = resolveScan(code);
  try {
    const r = shipping.scanVolumeForLoading({ loadingId, volumeCode: code, operatorId });
    logScan({
      raw: code, resolved, operation: "LOADING_SCAN", contextRef: loadingId,
      result: r.ok ? "OK" : "REJECTED", message: r.message, operatorId, deviceId: DEVICE,
    });
    refreshAll();
    revalidatePath("/mobile/loading");
    return r.ok ? ok(r.message, { loaded: r.loaded, expected: r.expected }) : fail(r.message);
  } catch (e) { return toError(e); }
}

// ----------------------------------------------------------------- inventario
export async function rfCountScanAction(_: ActionState, form: FormData): Promise<ActionState> {
  const countId = str(form, "countId");
  const itemId = str(form, "itemId");
  const code = str(form, "code").toUpperCase();
  const operatorId = await currentOperatorId();
  const resolved = resolveScan(code);

  const item = one<any>(
    `SELECT ci.*, l.code AS location_code, p.sku FROM inventory_count_items ci
       JOIN locations l ON l.id = ci.location_id
       LEFT JOIN products p ON p.id = ci.product_id
      WHERE ci.id = ?`,
    itemId,
  );
  if (!item) return fail("POSICAO DE INVENTARIO INEXISTENTE");

  const expected = str(form, "expect") === "PRODUCT" ? item.product_id : item.location_id;
  const normalized = str(form, "expect") === "PRODUCT" ? (resolved.id ?? code) : normalizeLocationInput(code);

  const reject = (msg: string) => {
    logScan({ raw: code, resolved, operation: "COUNT_SCAN", contextRef: countId, result: "REJECTED", message: msg, operatorId, deviceId: DEVICE });
    return fail(msg);
  };

  if (normalized !== expected) {
    return reject(
      str(form, "expect") === "PRODUCT"
        ? `PRODUTO INCORRETO. Esperado ${item.sku}.`
        : `ENDERECO INCORRETO. Esperado ${item.location_code}.`,
    );
  }
  logScan({ raw: code, resolved, operation: "COUNT_SCAN", contextRef: countId, result: "OK", message: "Confirmado", operatorId, deviceId: DEVICE });
  revalidatePath("/mobile/count");
  return ok(str(form, "expect") === "PRODUCT" ? "Produto confirmado." : "Endereco confirmado.");
}

export async function rfCountConfirmAction(_: ActionState, form: FormData): Promise<ActionState> {
  const countId = str(form, "countId");
  try {
    const r = counting.countItem({
      countId, itemId: str(form, "itemId"),
      countedQty: num(form, "quantity"),
      operatorId: await currentOperatorId(), origin: "RF",
    });
    refreshAll();
    revalidatePath("/inventory-count");
    revalidatePath("/mobile/count");
    return r.divergence === 0
      ? ok(`Contagem confirmada: ${r.counted}.`)
      : ok(`Contagem registrada com divergencia de ${r.divergence > 0 ? "+" : ""}${r.divergence}.`);
  } catch (e) { return toError(e); }
}

// ------------------------------------------------------------- recebimento RF
export async function rfCheckItemAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const r = receiving.checkItem({
      checkId: str(form, "checkId"),
      checkItemId: str(form, "checkItemId"),
      quantity: num(form, "quantity"),
      operatorId: await currentOperatorId(),
      origin: "RF",
    });
    refreshAll();
    revalidatePath("/mobile/receiving");
    return r.divergence === 0
      ? ok(`Linha conferida: ${r.checked}.`)
      : ok(`Divergencia de ${r.divergence > 0 ? "+" : ""}${r.divergence} registrada.`);
  } catch (e) { return toError(e); }
}

export async function rfCheckScanProductAction(_: ActionState, form: FormData): Promise<ActionState> {
  const code = str(form, "code");
  const expectedProduct = str(form, "productId");
  const operatorId = await currentOperatorId();
  const resolved = resolveScan(code);

  if (resolved.kind !== "PRODUCT" || !resolved.found) {
    logScan({ raw: code, resolved, operation: "RECEIVING_SCAN", result: "REJECTED", message: "Codigo nao e de produto", operatorId, deviceId: DEVICE });
    return fail(`CODIGO NAO CORRESPONDE A UM PRODUTO: ${code}`);
  }
  if (resolved.id !== expectedProduct) {
    const sku = one<any>(`SELECT sku FROM products WHERE id = ?`, expectedProduct)?.sku;
    logScan({ raw: code, resolved, operation: "RECEIVING_SCAN", result: "REJECTED", message: "Produto incorreto", operatorId, deviceId: DEVICE });
    return fail(`PRODUTO INCORRETO. Esperado ${sku}, lido ${resolved.label}.`);
  }
  logScan({ raw: code, resolved, operation: "RECEIVING_SCAN", result: "OK", message: "Produto confirmado", operatorId, deviceId: DEVICE });
  return ok(`Produto ${resolved.label} confirmado. Informe a quantidade contada.`);
}
