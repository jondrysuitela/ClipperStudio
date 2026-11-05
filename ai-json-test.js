// Regression: parsing output model (fence, prosa, JSON terpotong).
const assert = require("assert");
const { normalizeJsonOutput, repairTruncatedJson } = require("./ai/providers/base.js");

const results = [];
function test(name, fn) {
  try { fn(); results.push(true); console.log(`[OK  ] ${name}`); }
  catch (e) { results.push(false); console.error(`[FAIL] ${name}\n  -> ${e.message}`); process.exitCode = 1; }
}

test("fenced json diparse", () => {
  assert.deepStrictEqual(normalizeJsonOutput("```json\n{\"a\":1}\n```"), { a: 1 });
});

test("prosa sebelum JSON diabaikan", () => {
  assert.deepStrictEqual(normalizeJsonOutput("Ini hasilnya: {\"a\":2} semoga membantu"), { a: 2 });
});

test("JSON terpotong diperbaiki", () => {
  const trunc = '{"segments":[{"start":0,"end":1,"text":"halo"},{"start":1,"end":2,"text":"sem';
  const out = normalizeJsonOutput(trunc);
  assert.ok(out, "harus menghasilkan objek");
  assert.strictEqual(out.segments.length, 2);
  assert.strictEqual(out.segments[1].text, "sem");
});

test("string terpotong ditutup tanpa merusak isi", () => {
  const out = repairTruncatedJson('{"a":"kata');
  assert.strictEqual(out, '{"a":"kata"}');
});

test("JSON valid tidak diubah", () => {
  assert.strictEqual(repairTruncatedJson('{"a":1}'), null);
});

test("sampah total tetap null (tidak menebak)", () => {
  assert.strictEqual(normalizeJsonOutput("maaf saya tidak bisa"), null);
});

const failed = results.filter((ok) => !ok).length;
console.log(`\nAI json test: ${results.length - failed}/${results.length} PASS`);
if (failed) process.exit(1);
