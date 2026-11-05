// Regression: dedupe rolling captions + cakupan.
const assert = require("assert");
const C = require("./clipme-caption-clean.js");

const results = [];
function test(name, fn) {
  try { fn(); results.push(true); console.log(`[OK  ] ${name}`); }
  catch (e) { results.push(false); console.error(`[FAIL] ${name}\n  -> ${e.message}`); process.exitCode = 1; }
}

test("segmen bergulir yang mengulang digabung", () => {
  const segs = [
    { start: 0, end: 2.0, text: "kita mulai dari nol" },
    { start: 1.4, end: 3.0, text: "kita mulai dari nol dan tumbuh" }
  ];
  const out = C.dedupeRollingSegments(segs);
  assert.strictEqual(out.length, 1, `dapat ${out.length}`);
  assert.match(out[0].text, /tumbuh/, "teks terpanjang dipertahankan");
  assert.strictEqual(out[0].start, 0);
  assert.strictEqual(out[0].end, 3);
});

test("segmen berbeda tetap terpisah", () => {
  const segs = [
    { start: 0, end: 2, text: "kita mulai dari nol" },
    { start: 2, end: 4, text: "lalu semuanya berubah" }
  ];
  assert.strictEqual(C.dedupeRollingSegments(segs).length, 2);
});

test("tumpang tindih tanpa kemiripan teks tidak digabung", () => {
  const segs = [
    { start: 0, end: 3, text: "angka penjualan naik dua kali" },
    { start: 1, end: 4, text: "besok kita berangkat pagi" }
  ];
  assert.strictEqual(C.dedupeRollingSegments(segs).length, 2);
});

test("coverage 0..1 sesuai porsi yang tertutup", () => {
  assert.ok(Math.abs(C.coverageOf([{ start: 0, end: 5 }], 0, 10) - 0.5) < 0.01);
  assert.strictEqual(C.coverageOf([], 0, 10), 0);
  assert.strictEqual(C.coverageOf([{ start: 0, end: 10 }], 0, 10), 1);
});

const failed = results.filter((ok) => !ok).length;
console.log(`\nCaption clean test: ${results.length - failed}/${results.length} PASS`);
if (failed) process.exit(1);
