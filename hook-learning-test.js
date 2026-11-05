// Regression: bobot hook dari data performa.
const assert = require("assert");
const HL = require("./clipme-hook-learn.js");

const results = [];
function test(name, fn) {
  try { fn(); results.push(true); console.log(`[OK  ] ${name}`); }
  catch (e) { results.push(false); console.error(`[FAIL] ${name}\n  -> ${e.message}`); process.exitCode = 1; }
}

const rec = (hookType, views, likes, comments = 0, shares = 0) => ({ hookType, views, likes, comments, shares });

test("engagement rate: views 0 tidak dihitung", () => {
  assert.strictEqual(HL.engagementRate(rec("A", 0, 10)), 0);
});

test("tipe dengan engagement tinggi dapat bobot > 1", () => {
  const data = [
    rec("story", 1000, 200), rec("story", 1000, 180), rec("story", 1000, 220),
    rec("question", 1000, 20), rec("question", 1000, 25), rec("question", 1000, 15)
  ];
  const { weights } = HL.learnWeights(data);
  assert.ok(weights.story > 1, `story=${weights.story}`);
  assert.ok(weights.question < 1, `question=${weights.question}`);
});

test("sampel kurang dari minimum tidak diberi bobot", () => {
  const data = [rec("rare", 1000, 500), rec("common", 1000, 10), rec("common", 1000, 12), rec("common", 1000, 11)];
  const { weights, samples } = HL.learnWeights(data);
  assert.strictEqual(samples.rare, 1);
  assert.strictEqual(weights.rare, 1);
});

test("bobot dibatasi 0.85..1.20", () => {
  const data = [
    rec("viral", 1000, 999), rec("viral", 1000, 999), rec("viral", 1000, 999),
    rec("flat", 1000, 1), rec("flat", 1000, 1), rec("flat", 1000, 1)
  ];
  const { weights } = HL.learnWeights(data);
  for (const w of Object.values(weights)) {
    assert.ok(w >= 0.85 && w <= 1.2, `bobot ${w} di luar batas`);
  }
});

test("applyWeights mengalikan dan menjaga 0..100", () => {
  assert.strictEqual(HL.applyWeights(80, "story", { story: 1.2 }), 96);
  assert.strictEqual(HL.applyWeights(95, "story", { story: 1.2 }), 100);
  assert.strictEqual(HL.applyWeights(80, "unknown", { story: 1.2 }), 80);
});

test("tanpa data mengembalikan total 0", () => {
  const r = HL.learnWeights([]);
  assert.strictEqual(r.total, 0);
  assert.deepStrictEqual(r.weights, {});
});

const failed = results.filter((ok) => !ok).length;
console.log(`\nHook learning test: ${results.length - failed}/${results.length} PASS`);
if (failed) process.exit(1);
