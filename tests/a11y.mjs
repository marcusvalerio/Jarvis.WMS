/**
 * Auditoria de acessibilidade das telas principais, nos DOIS temas.
 * Verifica contraste, nomes acessiveis, rotulos de formulario, estrutura de
 * cabecalhos e marcos de navegacao. O tema e imposto pelo cookie wms_theme,
 * o mesmo que a aplicacao usa, para que o HTML ja chegue no tema auditado.
 */
import { chromium } from "playwright";
import { entrar } from "./login.mjs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");
const BASE = process.env.BASE ?? "http://localhost:3000";

const PAGES = [
  "/login",
  "/dashboard", "/operations", "/receiving", "/receiving/OR-000001",
  "/inventory", "/warehouse", "/shipping/orders", "/shipping/orders/PED-000125",
  "/picking", "/packing", "/documents", "/incidents", "/equipment",
  "/inventory-count", "/audit", "/simulation", "/settings",
  "/mobile", "/mobile/putaway", "/mobile/scan",
];

const THEMES = ["light", "dark"];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

let total = 0;
const findings = [];
const { hostname } = new URL(BASE);

for (const theme of THEMES) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await context.addCookies([
    { name: "wms_theme", value: theme, domain: hostname, path: "/" },
  ]);
  const page = await context.newPage();
  await entrar(page, BASE);   // todas as telas exigem sessao

  for (const route of PAGES) {
    await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 40000 });
    const applied = await page.getAttribute("html", "data-theme");
    if (applied !== theme) {
      findings.push({
        route, theme, id: "tema-nao-aplicado", impact: "critical", count: 1,
        help: `esperado data-theme="${theme}", encontrado "${applied}"`, sample: "<html>",
      });
      total += 1;
    }
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
        route, theme, id: v.id, impact: v.impact, count: v.nodes.length,
        help: v.help, sample: v.nodes[0]?.html?.slice(0, 120),
      });
    }
  }

  await context.close();
}

await browser.close();

const audited = PAGES.length * THEMES.length;

if (findings.length === 0) {
  console.log(`${PAGES.length} telas x ${THEMES.length} temas = ${audited} auditorias — nenhuma violacao WCAG 2.1 AA.`);
  process.exit(0);
}

console.log(`${total} ocorrencia(s) em ${audited} auditorias (${PAGES.length} telas x ${THEMES.length} temas):\n`);
const byRule = new Map();
for (const f of findings) {
  const key = `${f.theme}·${f.id}`;
  const cur = byRule.get(key) ?? { ...f, routes: new Set(), total: 0 };
  cur.routes.add(f.route);
  cur.total += f.count;
  byRule.set(key, cur);
}
for (const r of [...byRule.values()].sort((a, b) => b.total - a.total)) {
  console.log(`· [${r.impact}] [tema ${r.theme}] ${r.id} — ${r.help}`);
  console.log(`  ${r.total} no(s) em ${r.routes.size} tela(s): ${[...r.routes].slice(0, 4).join(", ")}`);
  console.log(`  ex.: ${r.sample}\n`);
}
process.exit(1);
