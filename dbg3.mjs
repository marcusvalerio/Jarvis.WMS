import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
await p.goto("http://localhost:3000/shipping/manifests/ROM-000018", { waitUntil: "networkidle" });
const sel = p.locator('select[name="orderId"]');
console.log("selects:", await sel.count());
if (await sel.count()) console.log("opcoes:", await sel.locator("option").allInnerTexts());
console.log("texto:", (await p.locator("main").innerText()).slice(0, 900));
await b.close();
