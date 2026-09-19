/**
 * Auditoria de acessibilidade das telas principais.
 * Verifica contraste, nomes acessiveis, rotulos de formulario, estrutura de
 * cabecalhos e marcos de navegacao.
 */
import { chromium } from "playwright";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3000";

const PAGES = [
  "/dashboard", "/operations", "/receiving", "/receiving/OR-000001",
  "/inventory", "/warehouse", "/shipping/orders", "/shipping/orders/PED-000125",
  "/picking", "/packing", "/documents", "/incidents", "/equipment",
  "/inventory-count", "/audit", "/simulation", "/settings",
  "/mobile", "/mobile/putaway", "/mobile/scan",
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

let total = 0;
const findings = [];

for (const route of PAGES) {
  await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 40000 });
  await page.addScriptTag({ path: axePath });
  const result = await page.evaluate(async () =>
    // @ts-ignore — axe injetado acima
    await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    }),
  );
  for (const v of result.violations) {
    total += v.nodes.length;
    findings.push({
      route, id: v.id, impact: v.impact, count: v.nodes.length,
      help: v.help, sample: v.nodes[0]?.html?.slice(0, 120),
    });
  }
}

await browser.close();

if (findings.length === 0) {
  console.log(`${PAGES.length} telas auditadas — nenhuma violacao WCAG 2.1 AA.`);
  process.exit(0);
}

console.log(`${total} ocorrencia(s) em ${PAGES.length} telas:\n`);
const byRule = new Map();
for (const f of findings) {
  const cur = byRule.get(f.id) ?? { ...f, routes: new Set(), total: 0 };
  cur.routes.add(f.route);
  cur.total += f.count;
  byRule.set(f.id, cur);
}
for (const r of [...byRule.values()].sort((a, b) => b.total - a.total)) {
  console.log(`· [${r.impact}] ${r.id} — ${r.help}`);
  console.log(`  ${r.total} no(s) em ${r.routes.size} tela(s): ${[...r.routes].slice(0, 4).join(", ")}`);
  console.log(`  ex.: ${r.sample}\n`);
}
process.exit(1);
