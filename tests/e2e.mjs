/**
 * Percurso completo da operacao pela INTERFACE REAL, como na apresentacao:
 * recebimento → pesagem → conferencia → paletizacao → enderecamento →
 * reserva → picking por coletora → packing → conferencia → romaneio →
 * carregamento → expedicao.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });

const errors = [];
page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`[console] ${m.text()}`); });
page.on("response", (r) => { if (r.status() >= 500) errors.push(`[${r.status()}] ${r.url()}`); });

let step = 0;
const results = [];
function log(ok, label, extra = "") {
  step++;
  results.push({ ok, label, extra });
  console.log(`${ok ? "ok  " : "FAIL"} ${String(step).padStart(2, "0")} · ${label}${extra ? ` — ${extra}` : ""}`);
}
async function go(path) {
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 45000 });
}
/**
 * Clica e espera a server action REALMENTE concluir.
 * Toda acao publica um aviso no Toaster; esperar por ele e o unico sinal
 * confiavel de que a operacao terminou e a tela ja revalidou.
 */
async function act(selector, { expect: expectText, timeout = 25000, ui = false } = {}) {
  await page.locator(selector).first().click();
  if (ui) {
    // Botao que apenas revela um formulario — nao dispara server action.
    await page.waitForTimeout(260);
    return;
  }
  if (expectText) {
    await page.getByText(expectText, { exact: false }).first().waitFor({ timeout });
  } else {
    await page.locator("[data-toast]").first().waitFor({ timeout });
  }
  await page.waitForLoadState("networkidle", { timeout });
  await page.waitForTimeout(260);
}
async function has(text) {
  return (await page.getByText(text, { exact: false }).count()) > 0;
}
async function cellValue(rowText, nth) {
  const row = page.locator("tr", { hasText: rowText }).first();
  return (await row.locator("td").nth(nth).innerText()).trim();
}

try {
  // ------------------------------------------------------ 0. reset
  await go("/simulation");
  await page.getByRole("button", { name: /Reiniciar simulacao/i }).click();
  await page.locator('input[name="confirm"]').fill("REINICIAR");
  await act('button:has-text("Confirmar reinicio")', { expect: "Simulacao reiniciada" });
  log(true, "Cenario reiniciado pela interface");

  // ------------------------------------------------------ 1. recebimento
  for (const [orderId, lines] of [["OR-000001", 2], ["OR-000002", 1]]) {
    await go(`/receiving/${orderId}`);
    await act('button:has-text("Registrar chegada")', { expect: "Chegada registrada" });
    await act('button:has-text("Iniciar descarga")', { expect: "Descarga iniciada" });
    log(true, `${orderId}: chegada e descarga`);

    // pesagem
    await page.locator('input[name="grossKg"]').first().fill("1180");
    await page.locator('input[name="tareKg"]').first().fill("50");
    await act('button:has-text("Registrar pesagem")', { expect: "registrada" });
    const liquido = await page.getByText("1.130,000", { exact: false }).count();
    log(liquido > 0, `${orderId}: pesagem com liquido calculado (1180 − 50)`);

    await act('button:has-text("Iniciar conferencia")', { expect: "Conferencia iniciada" });

    // conferencia: primeira linha do OR-000001 com divergencia proposital
    let conferidas = 0;
    for (let i = 0; i < 8; i++) {
      // o formulario e substituido a cada confirmacao: sempre re-consultar
      const pending = page.locator('form:has(button:has-text("Confirmar linha"))')
        .filter({ has: page.locator('input[name="quantity"][value=""]') });
      if ((await pending.count()) === 0) break;
      const form = pending.first();
      const input = form.locator('input[name="quantity"]');
      const esperado = Number(await input.getAttribute("placeholder"));
      const divergente = orderId === "OR-000001" && conferidas === 0;
      await input.fill(String(divergente ? esperado - 1 : esperado));
      await form.locator('button:has-text("Confirmar linha")').click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(350);
      conferidas++;
    }
    log(conferidas === lines, `${orderId}: ${conferidas} de ${lines} linha(s) conferida(s)`);

    if (orderId === "OR-000001") {
      const abriu = await has("Ocorrencia");
      log(abriu, "Divergencia de conferencia gerou ocorrencia");
    }

    await act('button:has-text("Encerrar conferencia")');
    if (orderId === "OR-000001") {
      await page.locator('textarea[name="reason"]').fill("Falta de 1 CX aceita — debito ao fornecedor.");
      await act('button:has-text("Tratar divergencia e aprovar")', { expect: "Divergencia tratada" });
      log(true, "Divergencia tratada e recebimento aprovado");
    }

    // paletizacao
    await go(`/receiving/${orderId}`);
    await act('button:has-text("Montar palete e receber no estoque")', { expect: "montado e recebido" });
    log(true, `${orderId}: palete montado e recebido no estoque`);

    // armazenagem
    await go(`/receiving/${orderId}`);
    await act('button:has-text("Gerar ordens de armazenagem")', { expect: "armazenagem gerada" });
    await go(`/receiving/${orderId}`);
    let guard = 0;
    while ((await page.locator('button:has-text("Confirmar armazenagem")').count()) > 0 && guard++ < 6) {
      await act('button:has-text("Confirmar armazenagem")');
      await go(`/receiving/${orderId}`);
    }
    const done = await has("Recebimento concluido");
    log(done, `${orderId}: armazenagem confirmada e recebimento concluido`);
  }

  // ------------------------------------------------------ 2. estoque
  await go("/inventory");
  const sku005 = await cellValue("SKU-005", 4);
  log(sku005 === "40", "Estoque reflete a entrada do SKU-005", `saldo ${sku005}`);

  // ------------------------------------------------------ 3. reserva
  await go("/shipping/orders/PED-000125");
  await act('button:has-text("Liberar e reservar estoque")', { expect: "reservado integralmente" });
  log(true, "PED-000125 reservado integralmente (FEFO)");

  await act('button:has-text("Gerar picklist")', { expect: "Picklist" });
  log(true, "Picklist gerada na sequencia da rota");

  // ------------------------------------------------------ 4. picking na coletora
  await go("/mobile/picking");
  await page.locator("a", { hasText: "PCK-" }).first().click();
  await page.waitForLoadState("networkidle");
  await act('button:has-text("Iniciar")', { expect: "Bipe o endereco" });
  log(true, "Separacao iniciada na coletora");

  // teste critico: endereco incorreto e recusado
  await page.locator('input[name="code"]').first().fill("C-02-03-02");
  await act('button:has-text("Validar endereco")', { expect: "ENDERECO INCORRETO" });
  log(true, "Coletora RECUSOU endereco incorreto");

  // percorre todas as linhas corretamente
  let lines = 0;
  for (let i = 0; i < 12; i++) {
    const locField = page.locator('input[name="code"]');
    if ((await locField.count()) === 0 && (await page.locator('input[name="quantity"]').count()) === 0) break;

    if (await page.getByText("Bipe o endereco", { exact: false }).count()) {
      const expected = (await page.locator('input[name="code"]').getAttribute("placeholder")) ?? "";
      await page.locator('input[name="code"]').fill(expected);
      await act('button:has-text("Validar endereco")');
    }
    if (await page.getByText("Bipe o produto", { exact: false }).count()) {
      const sku = (await page.locator('input[name="code"]').getAttribute("placeholder")) ?? "";
      // produto errado e recusado
      if (lines === 0) {
        await page.locator('input[name="code"]').fill(sku === "SKU-002" ? "SKU-004" : "SKU-002");
        await act('button:has-text("Validar produto")', { expect: "PRODUTO INCORRETO" });
        log(true, "Coletora RECUSOU produto incorreto");
      }
      await page.locator('input[name="code"]').fill(sku);
      await act('button:has-text("Validar produto")');
    }
    if (await page.locator('input[name="quantity"]').count()) {
      await act('button:has-text("Confirmar coleta")');
      lines++;
    }
    await page.waitForTimeout(200);
  }
  const pickDone = await has("SEPARACAO FINALIZADA");
  log(pickDone, `Separacao concluida na coletora (${lines} linhas)`);

  // ------------------------------------------------------ 5. packing
  await go("/shipping/orders/PED-000125");
  await act('button:has-text("Abrir embalagem")', { expect: "PAK-" });
  await page.locator('a:has-text("Abrir embalagem")').first().click().catch(() => {});
  await go("/packing");
  await page.locator("a", { hasText: "PAK-" }).first().click();
  await page.waitForLoadState("networkidle");
  await act('button:has-text("Iniciar embalagem")', { expect: "Novo volume" });
  await act('button:has-text("Novo volume")', { ui: true });
  await act('button:has-text("Criar volume")', { expect: "VOL-" });
  log(true, "Volume criado na embalagem");

  let packed = 0;
  for (let i = 0; i < 8; i++) {
    if ((await page.locator('button:has-text("Embalar")').count()) === 0) break;
    await act('button:has-text("Embalar")');
    packed++;
    await page.waitForTimeout(250);
  }
  const tudoEmbalado = await has("ja esta embalado");
  log(tudoEmbalado, `Itens embalados no volume (${packed})`);

  await act('button:has-text("Concluir embalagem")', { expect: "Embalagem concluida" });
  log(true, "Embalagem concluida");

  // ------------------------------------------------------ 6. conferencia de expedicao
  await go("/shipping/orders/PED-000125");
  await act('button:has-text("Iniciar conferencia de expedicao")', { expect: "Bipe o volume" });

  const volumeIds = await page.locator("a[href^='/documents/volume-label/']").allInnerTexts();
  const vols = [...new Set(volumeIds.map((v) => v.trim()).filter((v) => /^VOL-\d+$/.test(v)))];
  for (const v of vols) {
    await page.locator('input[name="code"]').first().fill(v);
    await act('button:has-text("Conferir")');
  }
  log(vols.length > 0, `Volumes conferidos por bipagem (${vols.length})`);

  await act('button:has-text("Encerrar conferencia")', { expect: "pronto para carregar" });
  log(true, "Conferencia de expedicao aprovada");

  // ------------------------------------------------------ 7. romaneio
  await go("/shipping/manifests");
  await act('button:has-text("Novo romaneio")', { ui: true });
  await act('button:has-text("Criar romaneio")', { expect: "ROM-" });
  log(true, "Romaneio ROM-000018 criado");

  await go("/shipping/manifests/ROM-000018");
  await page.locator(String.raw`select[name="orderId"]`).selectOption({ index: 1 });
  await act('button:has-text("Incluir no romaneio")', { expect: "incluido no romaneio" });
  await act('button:has-text("Liberar romaneio")', { expect: "documento de transporte" });
  log(true, "Romaneio liberado e documento de transporte emitido");

  // ------------------------------------------------------ 8. carregamento
  await act('button:has-text("Iniciar carregamento")', { expect: "CAR-" });
  await go("/mobile/loading");
  for (const v of vols) {
    await page.locator('input[name="code"]').first().fill(v);
    await act('button:has-text("Carregar volume")');
  }
  const cargaCompleta = await has("CARGA COMPLETA");
  log(cargaCompleta, `Volumes carregados pela coletora (${vols.length})`);

  await go("/shipping/loading");
  await page.locator("a", { hasText: "CAR-" }).first().click();
  await page.waitForLoadState("networkidle");
  await act('button:has-text("Encerrar carregamento")', { ui: true });
  await page.locator('input[name="seal"]').fill("LCR-88421");
  await act('button:has-text("Lacrar e encerrar")', { expect: "lacrado" });
  log(true, "Carregamento encerrado com lacre LCR-88421");

  // ------------------------------------------------------ 9. expedicao
  await go("/shipping/manifests/ROM-000018");
  await act('button:has-text("Expedir carga")', { ui: true });
  await act('button:has-text("Confirmar expedicao")', { expect: "Expedicao concluida" });
  log(true, "Carga expedida e estoque baixado");

  // ------------------------------------------------------ 10. resultado
  await go("/inventory");
  const s1 = await cellValue("SKU-001", 4);
  const s3 = await cellValue("SKU-003", 4);
  const s5 = await cellValue("SKU-005", 4);
  const esperado = s1 === "44" && s3 === "70" && s5 === "30";
  log(esperado, "Saldos finais conferem com o roteiro", `SKU-001=${s1} SKU-003=${s3} SKU-005=${s5}`);

  await go("/audit/trace?q=PED-000125");
  const etapas = ["Reserva", "Picking", "Packing", "Conferencia", "Romaneio", "Carregamento", "Expedicao"];
  let faltando = [];
  for (const e of etapas) if (!(await has(e))) faltando.push(e);
  log(faltando.length === 0, "Rastreabilidade cobre a cadeia completa", faltando.join(", "));

  await go("/dashboard");
  const otif = await page.locator("article", { hasText: "OTIF" }).first().innerText();
  log(!otif.includes("sem dados"), "Dashboard calcula OTIF a partir da operacao", otif.replace(/\n/g, " "));

} catch (err) {
  log(false, "ERRO NO PERCURSO", String(err).slice(0, 400));
}

console.log("\n" + "=".repeat(60));
const fails = results.filter((r) => !r.ok);
console.log(`${results.length - fails.length}/${results.length} etapas concluidas`);
if (fails.length) console.log("FALHAS:\n" + fails.map((f) => ` · ${f.label} ${f.extra}`).join("\n"));
if (errors.length) console.log("\nERROS DE PAGINA:\n" + [...new Set(errors)].slice(0, 12).join("\n"));

await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
