// Regression: envelope audio + bonus emphasis.
const assert = require("assert");
const AE = require("./clipme-audio-emphasis.js");

const results = [];
function test(name, fn) {
  try { fn(); results.push(true); console.log(`[OK  ] ${name}`); }
  catch (e) { results.push(false); console.error(`[FAIL] ${name}\n  -> ${e.message}`); process.exitCode = 1; }
}

// Bangun PCM: 1 detik pelan (amp 1000) + 1 detik keras (amp 12000)
function buildPcm() {
  const sr = 8000;
  const quiet = new Int16Array(sr).fill(1000);
  const loud = new Int16Array(sr).fill(12000);
  const all = new Int16Array(sr * 2);
  all.set(quiet, 0);
  all.set(loud, sr);
  return { pcm: Buffer.from(all.buffer), sr };
}

test("computeEnvelope menghasilkan 1 nilai per hop", () => {
  const { pcm, sr } = buildPcm();
  const env = AE.computeEnvelope(pcm, sr, 100);
  assert.strictEqual(env.length, 20, `dapat ${env.length}`);
});

test("bagian keras punya energi lebih tinggi", () => {
  const { pcm, sr } = buildPcm();
  const env = AE.computeEnvelope(pcm, sr, 100);
  const quiet = AE.rangeEnergy(env, 100, 0, 1).mean;
  const loud = AE.rangeEnergy(env, 100, 1, 2).mean;
  assert.ok(loud > quiet * 2, `quiet=${quiet} loud=${loud}`);
});

test("scoreSegment memberi bonus untuk ucapan keras", () => {
  const { pcm, sr } = buildPcm();
  const env = AE.computeEnvelope(pcm, sr, 100);
  const segments = [{ start: 0, end: 1 }, { start: 1, end: 2 }];
  const normal = AE.scoreSegment(env, 100, segments, 0, { baseline: AE.baselineOf(env) });
  const loud = AE.scoreSegment(env, 100, segments, 1, { baseline: AE.baselineOf(env) });
  assert.ok(loud.bonus > normal.bonus, `normal=${normal.bonus} loud=${loud.bonus}`);
  assert.ok(loud.bonus <= 10, "bonus harus dibatasi");
});

test("jeda sebelum segmen ikut dihitung", () => {
  const { pcm, sr } = buildPcm();
  const env = AE.computeEnvelope(pcm, sr, 100);
  const segments = [{ start: 0, end: 1 }, { start: 2, end: 3 }];
  const r = AE.scoreSegment(env, 100, segments, 1, { baseline: AE.baselineOf(env) });
  assert.ok(Math.abs(r.pauseBefore - 1) < 0.01, `pause ${r.pauseBefore}`);
  assert.ok(r.bonus >= 2, `bonus ${r.bonus}`);
});

test("input kosong tidak crash", () => {
  const r = AE.scoreSegment([], 100, [], 0, {});
  assert.strictEqual(r.bonus, 0);
  assert.deepStrictEqual(AE.computeEnvelope(Buffer.alloc(0), 8000, 100), []);
});

const failed = results.filter((ok) => !ok).length;
console.log(`\nAudio emphasis test: ${results.length - failed}/${results.length} PASS`);
if (failed) process.exit(1);
