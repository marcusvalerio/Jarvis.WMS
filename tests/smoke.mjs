/**
 * Verificacao de fumaca: percorre as telas do sistema e, em seguida, TODOS
 * os documentos que existem no cenario carregado — a lista vem da propria
 * central de documentos, entao o teste acompanha o estado real da operacao.
 */
import { chromium } from "playwright";
import { entrar } from "./login.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";

const SCREENS = [
  "/", "/dashboard", "/operations",
  "/receiving", "/receiving/OR-000001", "/receiving/OR-000002", "/receiving/weighing",
  "/purchasing", "/purchasing/PC-000001",
  "/inventory", "/inventory/SKU-001", "/inventory/SKU-002", "/inventory/movements",
  "/warehouse", "/warehouse/END-A010101", "/warehouse/storage", "/warehouse/pallets",
  "/shipping", "/shipping/orders", "/shipping/orders/PED-000125",
  "/shipping/manifests", "/shipping/loading",
  "/picking", "/packing",
  "/inventory-count", "/incidents", "/equipment",
  "/documents", "/audit", "/audit/trace?q=SKU-001", "/simulation", "/settings",
  "/mobile", "/mobile/scan", "/mobile/putaway", "/mobile/picking",
  "/mobile/loading", "/mobile/count", "/mobile/receiving",
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await entrar(page, BASE);   // todas as telas exigem sessao

const problems = [];
let current = "";
page.on("pageerror", (e) => problems.push(`${current} · pageerror: ${e.message.slice(0, 130)}`));
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`${current} · console: ${m.text().slice(0, 130)}`);
});

async function visit(route) {
  current = route;
  try {
    const res = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 40000 });
    const status = res?.status() ?? 0;
    if (status >= 400) { problems.push(`${route} · HTTP ${status}`); return false; }
    const body = await page.locator("body").innerText();
    if (/Application error|Unhandled Runtime Error/i.test(body.slice(0, 400))) {
      problems.push(`${route} · pagina de erro`);
      return false;
    }
    return true;
  } catch (e) {
    problems.push(`${route} · ${String(e).slice(0, 120)}`);
    return false;
  }
}

let ok = 0;
for (const route of SCREENS) if (await visit(route)) ok++;

// Um documento de cada tipo disponivel, descoberto na propria central.
await page.goto(`${BASE}/documents`, { waitUntil: "networkidle" });
const hrefs = await page.locator('a[href^="/documents/"]').evaluateAll((els) =>
  els.map((e) => e.getAttribute("href")).filter(Boolean),
);
const perType = new Map();
for (const href of hrefs) {
  const type = href.split("/")[2];
  if (type && !perType.has(type)) perType.set(type, href);
}
for (const route of perType.values()) if (await visit(route)) ok++;

const total = SCREENS.length + perType.size;
console.log(`${ok}/${total} rotas OK (${SCREENS.length} telas + ${perType.size} tipos de documento)`);
if (problems.length) console.log("\nPROBLEMAS:\n" + [...new Set(problems)].join("\n"));

await browser.close();
process.exit(problems.length ? 1 : 0);
