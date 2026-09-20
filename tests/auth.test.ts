/**
 * Autenticacao e identidade operacional.
 *
 * O que esta em jogo: antes, o operador vinha de um cookie em texto puro e
 * qualquer pessoa podia operar — e ser auditada — como outra. Estes testes
 * fixam o comportamento novo: a identidade vem da sessao, conferida no
 * servidor, e a auditoria registra a pessoa real.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

import { seed, resetSimulation } from "../src/domain/services/simulation.ts";
import {
  signIn, signOut, profileForToken, listProfiles, hashPassword, verifyPassword,
} from "../src/domain/auth.ts";
import { INITIAL_PASSWORD } from "../src/seed/credentials.ts";
import { USERS } from "../src/seed/scenario.ts";
import * as receiving from "../src/domain/services/receiving.ts";
import { auditFor } from "../src/domain/services/audit.ts";
import { all, one } from "../src/lib/db.ts";

before(async () => {
  assert.ok(process.env.WMS_TEST_DATABASE, "Use `npm test`.");
  await seed("TESTE");
});

// --------------------------------------------------------------- provisionamento
await test("A01 · os 11 integrantes existem com cargo, setor e operador", async () => {
  const perfis = await listProfiles();
  assert.equal(perfis.length, 11);

  for (const u of USERS) {
    const p = perfis.find((x) => x.email === u.email);
    assert.ok(p, `${u.email} deveria existir`);
    assert.equal(p!.name, u.name);
    assert.equal(p!.jobTitle, u.jobTitle);
    assert.equal(p!.sector, u.sector);
    assert.match(p!.operatorId, /^OPR-\d{4}$/, "todo usuario tem operador vinculado");
  }
  // Um operador por usuario, sem duplicatas.
  const ops = new Set(perfis.map((p) => p.operatorId));
  assert.equal(ops.size, 11);
});

await test("A02 · nenhuma senha em claro no banco", async () => {
  const rows = await all<any>(`SELECT id, password_hash FROM users`);
  assert.equal(rows.length, 11);
  for (const r of rows) {
    assert.ok(r.password_hash, `${r.id} sem credencial`);
    assert.match(r.password_hash, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
    assert.ok(
      !r.password_hash.includes(INITIAL_PASSWORD),
      "a senha nao pode aparecer no valor gravado",
    );
  }
});

await test("A03 · hash nao e reversivel e usa salt por usuario", async () => {
  const a = await hashPassword("segredo");
  const b = await hashPassword("segredo");
  assert.notEqual(a, b, "mesma senha deve gerar hashes distintos (salt)");
  assert.ok(await verifyPassword("segredo", a));
  assert.ok(await verifyPassword("segredo", b));
  assert.ok(!(await verifyPassword("Segredo", a)), "comparacao sensivel a maiusculas");
  assert.ok(!(await verifyPassword("", a)));
  assert.ok(!(await verifyPassword("segredo", null)));
  assert.ok(!(await verifyPassword("segredo", "lixo")));
});

// ------------------------------------------------------------------------ login
await test("A04 · login valido emite sessao e resolve o perfil", async () => {
  const token = await signIn("luiza@log122.com", INITIAL_PASSWORD);
  assert.ok(token, "login valido deve autenticar");
  const p = await profileForToken(token!);
  assert.equal(p?.name, "Luiza");
  assert.equal(p?.sector, "Recebimento");
  assert.match(p!.operatorId, /^OPR-\d{4}$/);
});

await test("A05 · login invalido e rejeitado", async () => {
  assert.equal(await signIn("luiza@log122.com", "senhaerrada"), null, "senha errada");
  assert.equal(await signIn("naoexiste@log122.com", INITIAL_PASSWORD), null, "e-mail inexistente");
  assert.equal(await signIn("luiza@log122.com", ""), null, "senha vazia");
  assert.equal(await signIn("", INITIAL_PASSWORD), null, "e-mail vazio");
});

await test("A06 · e-mail nao diferencia maiusculas, senha sim", async () => {
  assert.ok(await signIn("LUIZA@log122.com", INITIAL_PASSWORD));
  assert.ok(await signIn("  luiza@log122.com  ", INITIAL_PASSWORD), "espacos sao tolerados");
  assert.equal(await signIn("luiza@log122.com", INITIAL_PASSWORD.toUpperCase()), null);
});

await test("A07 · token invalido ou ausente nao resolve perfil", async () => {
  assert.equal(await profileForToken(undefined), null);
  assert.equal(await profileForToken(""), null);
  assert.equal(await profileForToken("token-inventado"), null);
});

await test("A08 · logout revoga a sessao no servidor", async () => {
  const token = (await signIn("max@log122.com", INITIAL_PASSWORD))!;
  assert.ok(await profileForToken(token));
  await signOut(token);
  assert.equal(await profileForToken(token), null, "token nao pode continuar valendo");
  const resto = await one<any>(`SELECT COUNT(*) n FROM user_sessions WHERE token = ?`, token);
  assert.equal(resto.n, 0, "a linha da sessao deve sumir — revogacao real");
});

await test("A09 · sessao expirada nao vale", async () => {
  const token = (await signIn("deiv@log122.com", INITIAL_PASSWORD))!;
  await all<any>(
    `UPDATE user_sessions SET expires_at = ? WHERE token = ?`,
    new Date(Date.now() - 1000).toISOString(), token,
  );
  assert.equal(await profileForToken(token), null);
});

await test("A10 · sessoes simultaneas sao independentes", async () => {
  const t1 = (await signIn("gabie@log122.com", INITIAL_PASSWORD))!;
  const t2 = (await signIn("joice@log122.com", INITIAL_PASSWORD))!;
  assert.notEqual(t1, t2);
  assert.equal((await profileForToken(t1))?.name, "Gabie");
  assert.equal((await profileForToken(t2))?.name, "Joice");
  await signOut(t1);
  assert.equal(await profileForToken(t1), null);
  assert.equal((await profileForToken(t2))?.name, "Joice", "sair nao derruba a outra pessoa");
});

// -------------------------------------------------------------- rastreabilidade
await test("A11 · a auditoria registra a pessoa que operou, nao um generico", async () => {
  const luiza = (await profileForToken((await signIn("luiza@log122.com", INITIAL_PASSWORD))!))!;
  const gabie = (await profileForToken((await signIn("gabie@log122.com", INITIAL_PASSWORD))!))!;
  assert.notEqual(luiza.operatorId, gabie.operatorId);

  // Luiza registra a chegada; Gabie registra a pesagem.
  await receiving.registerArrival({
    inboundId: "OR-000001", dockId: "DOCA-01", operatorId: luiza.operatorId,
  });
  await receiving.startReceiving("OR-000001", luiza.operatorId);
  const io = (await receiving.getInbound("OR-000001"))!;
  const pesagem = await receiving.registerWeighing({
    refKind: "INBOUND_ORDER", refId: "OR-000001",
    grossKg: 1180, tareKg: 50, expectedKg: io.order.expected_weight_kg,
    equipmentId: "EQP-0007", operatorId: gabie.operatorId,
  });

  const trilha = await auditFor("inbound_order", "OR-000001");
  const chegada = trilha.find((e: any) => /-> ARRIVING/.test(e.detail ?? ""));
  assert.ok(chegada, "a chegada deve estar na trilha");
  assert.equal(chegada.actor, luiza.operatorId, "a chegada e da Luiza");

  const daGabie = await auditFor("weighing", pesagem);
  assert.ok(
    daGabie.some((e: any) => e.actor === gabie.operatorId),
    "a pesagem e da Gabie",
  );
  assert.ok(
    !daGabie.some((e: any) => e.actor === luiza.operatorId),
    "a pesagem NAO pode aparecer no nome da Luiza",
  );
});

await test("A12 · operadores diferentes produzem registros distintos", async () => {
  const porAtor = await all<any>(
    `SELECT actor, COUNT(*) n FROM audit_logs WHERE actor LIKE 'OPR-%' GROUP BY actor`,
  );
  assert.ok(porAtor.length >= 2, "mais de um operador deve ter registros");
});

// ---------------------------------------------------------------------- reset
await test("A13 · reset restaura os perfis e mantem o login funcionando", async () => {
  await resetSimulation("TESTE");

  const perfis = await listProfiles();
  assert.equal(perfis.length, 11, "o reset recarrega a equipe");

  const token = await signIn("cristiane@log122.com", INITIAL_PASSWORD);
  assert.ok(token, "depois do reset ainda se entra com a senha inicial");
  assert.equal((await profileForToken(token!))?.sector, "Picking");
});

await test("A14 · reset nao derruba quem esta operando", async () => {
  const token = (await signIn("marcus@log122.com", INITIAL_PASSWORD))!;
  await resetSimulation("TESTE");
  assert.ok(
    await profileForToken(token),
    "reiniciar o cenario nao pode expulsar a equipe do sistema",
  );
});

await test("A15 · o cenario LOG122 sobrevive a autenticacao", async () => {
  await resetSimulation("TESTE");
  const prod = await all<any>(`SELECT id, description FROM products ORDER BY id`);
  assert.deepEqual(prod.map((p) => p.id), ["SKU-001", "SKU-002"]);
  assert.match(prod[0].description, /Shampoo Pantene/);
  assert.match(prod[1].description, /Condicionador Pantene/);

  const pedidos = await all<any>(`SELECT id FROM sales_orders ORDER BY id`);
  assert.equal(pedidos.length, 6, "seis entregas Guanabara");

  const estoque = await one<any>(
    `SELECT COALESCE(SUM(qty_on_hand),0) q FROM inventory WHERE product_id = 'SKU-001'`);
  assert.equal(estoque.q, 120, "estoque inicial intacto");

  const ordens = await all<any>(`SELECT id, expected_volumes FROM inbound_orders ORDER BY id`);
  assert.deepEqual(ordens.map((o) => o.expected_volumes), [6, 4], "10 caixas de entrada");
});
