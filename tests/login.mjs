/**
 * Autentica um contexto do Playwright.
 *
 * Todas as telas passaram a exigir sessao, entao as suites de navegador
 * precisam entrar antes de qualquer navegacao. Faz o login pela propria
 * tela — nao injeta cookie — para que o caminho testado seja o real.
 */
export const USUARIO_PADRAO = process.env.WMS_TEST_EMAIL ?? "danilo@log122.com";
export const SENHA_PADRAO = process.env.WMS_TEST_PASSWORD ?? "Projetolog122";

export async function entrar(page, base, email = USUARIO_PADRAO, senha = SENHA_PADRAO) {
  await page.goto(`${base}/login`, { waitUntil: "networkidle", timeout: 60000 });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(senha);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }),
    page.locator('button[type="submit"]').click(),
  ]);
  await page.waitForLoadState("networkidle", { timeout: 60000 });
}
