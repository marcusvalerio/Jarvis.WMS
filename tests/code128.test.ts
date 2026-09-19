import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeValues,
  encodeWidths,
  toSvg,
  isEncodable,
  Code128Error,
} from "../src/lib/barcode/code128.ts";

test("estrutura do simbolo: start B, dados, checksum, stop", () => {
  const v = encodeValues("A");
  // 'A' = 65 -> valor 33
  assert.deepEqual(v, [104, 33, (104 + 33 * 1) % 103, 106]);
});

test("checksum conhecido para PLT-000001", () => {
  const v = encodeValues("PLT-000001");
  const data = [..."PLT-000001"].map((c) => c.charCodeAt(0) - 32);
  let sum = 104;
  data.forEach((d, i) => (sum += d * (i + 1)));
  assert.equal(v[v.length - 2], sum % 103);
  assert.equal(v[0], 104);
  assert.equal(v[v.length - 1], 106);
});

test("cada caractere ocupa 11 modulos e o stop 13", () => {
  const w = encodeWidths("END-A020301");
  const total = w.reduce((a, b) => a + b, 0);
  const chars = "END-A020301".length;
  // start + dados + check = (chars + 2) * 11 ; stop = 13
  assert.equal(total, (chars + 2) * 11 + 13);
});

test("simbolo comeca e termina com barra", () => {
  const w = encodeWidths("VOL-000001");
  assert.equal(w.length % 2, 1, "numero impar de elementos -> termina em barra");
});

test("rejeita caracteres fora do Code 128 B", () => {
  assert.equal(isEncodable("PED-000125"), true);
  assert.equal(isEncodable("PAÇOCA"), false);
  assert.throws(() => encodeValues("PAÇOCA"), Code128Error);
  assert.throws(() => encodeValues(""), Code128Error);
});

test("svg contem barras e o texto legivel", () => {
  const svg = toSvg("ROM-000018");
  assert.match(svg, /^<svg /);
  assert.ok(svg.includes("ROM-000018"));
  assert.ok((svg.match(/<rect/g) ?? []).length > 10);
});
