// Regression: bonus audio ikut mempengaruhi pemilihan hook.
const assert = require("assert");
const HE = require("./clipme-hook-engine.js");

const results = [];
function test(name, fn) {
  try { fn(); results.push(true); console.log(`[OK  ] ${name}`); }
  catch (e) { results.push(false); console.error(`[FAIL] ${name}\n  -> ${e.message}`); process.exitCode = 1; }
}

// Dua kalimat setara; yang kedua diberi penekanan audio.
const sentences = [
  "Saya memulai bisnis ini dari nol di kota kecil.",
  "Tiga tahun kemudian saya kehilangan semuanya dalam satu malam."
];

test("tanpa audio, pilihan stabil (deterministik)", () => {
  const a = HE.selectHook(sentences, "id", {});
  const b = HE.selectHook(sentences, "id", {});
  assert.strictEqual(a.recommendedHook, b.recommendedHook);
});

test("bonus audio untuk kalimat kedua menaikkan skornya", () => {
  const base = HE.scoreHook(sentences[1], "id", {});
  const boosted = HE.scoreHook(sentences[1], "id", { audioBonus: 6 });
  assert.strictEqual(boosted.score - base.score, 6, `${base.score} -> ${boosted.score}`);
  assert.strictEqual(boosted.evidence.audio, 6);
});

test("audioBonus dibatasi 0..10", () => {
  const over = HE.scoreHook(sentences[0], "id", { audioBonus: 999 });
  assert.strictEqual(over.evidence.audio, 10);
  const negative = HE.scoreHook(sentences[0], "id", { audioBonus: -5 });
  assert.strictEqual(negative.evidence.audio, 0);
});

test("selectHook menerima array audioBonus tanpa crash", () => {
  const r = HE.selectHook(sentences, "id", { audioBonus: [0, 8] });
  assert.ok(r && typeof r.recommendedHook === "string" && r.recommendedHook.length > 0);
});

const failed = results.filter((ok) => !ok).length;
console.log(`\nHook audio test: ${results.length - failed}/${results.length} PASS`);
if (failed) process.exit(1);
