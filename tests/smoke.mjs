/** Verificacao de fumaca: toda rota responde e nenhuma acusa erro no console. */
import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const routes = [
  "/", "/dashboard", "/operations",
  "/receiving", "/receiving/OR-000001", "/receiving/OR-000002", "/receiving/weighing",
  "/purchasing", "/purchasing/PC-000001", "/purchasing/PC-000002",
  "/inventory", "/inventory/SKU-001", "/inventory/SKU-005", "/inventory/movements",
  "/warehouse", "/warehouse/END-A010101", "/warehouse/storage",
  "/warehouse/pallets", "/warehouse/pallets/PLT-000001",
  "/shipping", "/shipping/orders", "/shipping/orders/PED-000125",
  "/shipping/orders/PED-000126", "/shipping/manifests", "/shipping/manifests/ROM-000018",
  "/shipping/loading", "/shipping/loading/CAR-000001",
  "/picking", "/picking/PCK-000001", "/packing", "/packing/PAK-000001",
  "/inventory-count", "/incidents", "/equipment",
  "/documents", "/audit", "/audit/trace?q=PLT-000001", "/simulation", "/settings",
  "/mobile", "/mobile/scan", "/mobile/putaway", "/mobile/picking",
  "/mobile/loading", "/mobile/count", "/mobile/receiving",
  "/documents/purchase-order/PC-000001", "/documents/inbound-order/OR-000001",
  "/documents/invoice/NFS-000001", "/documents/weighing/PES-000001",
  "/documents/receiving-checklist/OR-000001", "/documents/product-label/SKU-001",
  "/documents/storage-order/ARM-000001", "/documents/pallet-label/PLT-000009",
  "/documents/location-label/END-A010101", "/documents/movement/PLT-000001",
  "/documents/sales-order/PED-000125", "/documents/picklist/PCK-000001",
  "/documents/packing-list/PED-000125", "/documents/volume-label/VOL-000001",
  "/documents/shipping-check/CEX-000001", "/documents/manifest/ROM-000018",
  "/documents/transport/DTS-000001", "/documents/loading-checklist/CAR-000001",
  "/documents/shipping-receipt/PED-000125",
];

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
const problems = [];
let current = "";
p.on("pageerror", (e) => problems.push(`${current} · pageerror: ${e.message.slice(0, 130)}`));
p.on("console", (m) => { if (m.type() === "error") problems.push(`${current} · console: ${m.text().slice(0, 130)}`); });

let okCount = 0;
for (const route of routes) {
  current = route;
  try {
    const res = await p.goto(BASE + route, { waitUntil: "networkidle", timeout: 40000 });
    const status = res?.status() ?? 0;
    if (status >= 400) { problems.push(`${route} · HTTP ${status}`); continue; }
    const body = await p.locator("body").innerText();
    if (/Application error|Unhandled Runtime Error|500/i.test(body.slice(0, 400))) {
      problems.push(`${route} · pagina de erro`);
      continue;
    }
    okCount++;
  } catch (e) {
    problems.push(`${route} · ${String(e).slice(0, 120)}`);
  }
}
console.log(`${okCount}/${routes.length} rotas OK`);
if (problems.length) console.log("\nPROBLEMAS:\n" + [...new Set(problems)].join("\n"));
await b.close();
process.exit(problems.length ? 1 : 0);
