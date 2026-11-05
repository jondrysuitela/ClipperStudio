// Regression: deteksi lubang transkrip + merge hasil STT gap-fill.
const assert = require("assert");
const G = require("./clipme-transcript-gaps.js");

const results = [];
function test(name, fn) {
  try { fn(); results.push(true); console.log(`[OK  ] ${name}`); }
  catch (e) { results.push(false); console.error(`[FAIL] ${name}\n  -> ${e.message}`); process.exitCode = 1; }
}

test("gaps: transkrip rapat tidak menghasilkan gap", () => {
  const segs = [{ start: 0, end: 10 }, { start: 10, end: 20 }];
  assert.deepStrictEqual(G.findGaps(segs, 0, 20, { minGap: 5 }), []);
});

test("gaps: lubang 8s di tengah terdeteksi", () => {
  const segs = [{ start: 0, end: 10 }, { start: 18, end: 30 }];
  const gaps = G.findGaps(segs, 0, 30, { minGap: 5 });
  assert.strictEqual(gaps.length, 1);
  assert.ok(Math.abs(gaps[0].start - 10) < 0.01 && Math.abs(gaps[0].end - 18) < 0.01);
});

test("gaps: lubang di awal dan akhir ikut terhitung", () => {
  const segs = [{ start: 10, end: 20 }];
  const gaps = G.findGaps(segs, 0, 30, { minGap: 5 });
  assert.strictEqual(gaps.length, 2);
  assert.strictEqual(gaps[0].start, 0);
  assert.strictEqual(gaps[1].end, 30);
});

test("gaps: dibatasi maxGaps dan maxGap", () => {
  const segs = [{ start: 10, end: 11 }, { start: 60, end: 61 }, { start: 120, end: 121 }];
  const gaps = G.findGaps(segs, 0, 200, { minGap: 5, maxGaps: 2, maxGap: 20 });
  assert.strictEqual(gaps.length, 2);
  for (const g of gaps) assert.ok(g.end - g.start <= 20.001, `gap ${g.end - g.start} melebihi maxGap`);
});

test("coverage: 50% terisi", () => {
  const ratio = G.coverageRatio([{ start: 0, end: 5 }], 0, 10);
  assert.ok(Math.abs(ratio - 0.5) < 0.01, `ratio ${ratio}`);
});

test("coverage: segmen di luar window diabaikan", () => {
  const ratio = G.coverageRatio([{ start: -10, end: 5 }], 0, 10);
  assert.ok(Math.abs(ratio - 0.5) < 0.01, `ratio ${ratio}`);
});

test("merge: menambahkan hasil STT gap dan urut", () => {
  const base = [{ start: 0, end: 5, text: "awal" }, { start: 20, end: 25, text: "akhir" }];
  const extra = [{ start: 6, end: 19, text: "tengah" }];
  const out = G.mergeSegments(base, extra);
  assert.strictEqual(out.length, 3);
  assert.deepStrictEqual(out.map((s) => s.text), ["awal", "tengah", "akhir"]);
});

test("merge: duplikat tumpang tindih dibuang", () => {
  const base = [{ start: 0, end: 5, text: "awal" }];
  const extra = [{ start: 0.2, end: 4.8, text: "awal" }];
  const out = G.mergeSegments(base, extra);
  assert.strictEqual(out.length, 1);
});

const failed = results.filter((ok) => !ok).length;
console.log(`\nTranscript gaps test: ${results.length - failed}/${results.length} PASS`);
if (failed) process.exit(1);
