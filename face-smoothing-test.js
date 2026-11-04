// Regression: perapian association cut-to-face (lompatan kamera & kedip).
const assert = require("assert");
const AS = require("./clipme-active-speaker.js");

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`[OK  ] ${name}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.error(`[FAIL] ${name}\n  -> ${error.message}`);
    process.exitCode = 1;
  }
}

const crop = (x, w = 608) => ({ x, y: 0, w, h: 1080 });
const assoc = (start, end, track, x) => ({
  start_ms: start, end_ms: end, speaker_id: "S0", track_id: track, crop: crop(x), face: { x, y: 0, w: 200, h: 200 }
});

test("segmen berurutan dengan track sama digabung", () => {
  const out = AS.smoothAssociations([assoc(0, 1000, 1, 100), assoc(1050, 2000, 1, 120)], {});
  assert.strictEqual(out.length, 1, "harus menyatu jadi satu association");
  assert.strictEqual(out[0].end_ms, 2000);
});

test("track berbeda tidak digabung", () => {
  const out = AS.smoothAssociations([assoc(0, 1000, 1, 100), assoc(1000, 2000, 2, 900)], {});
  assert.strictEqual(out.length, 2);
});

test("lompatan crop horizontal dibatasi saat ganti pembicara", () => {
  const out = AS.smoothAssociations([assoc(0, 1000, 1, 100), assoc(1000, 2000, 2, 900)], { maxShiftRatio: 0.12 });
  const dx = out[1].crop.x - out[0].crop.x;
  assert.ok(Math.abs(dx) <= Math.round(608 * 0.12) + 1, `dx ${dx} melebihi batas`);
});

test("durasi association sangat pendek diperpanjang ke minimum", () => {
  const out = AS.smoothAssociations([assoc(0, 120, 1, 100)], { minSpanMs: 500 });
  assert.ok(out[0].end_ms - out[0].start_ms >= 500, `span ${out[0].end_ms - out[0].start_ms}`);
});

test("durasi minimum tidak menabrak association berikutnya", () => {
  const out = AS.smoothAssociations([assoc(0, 120, 1, 100), assoc(300, 900, 2, 300)], { minSpanMs: 500 });
  assert.ok(out[0].end_ms <= 300, `end ${out[0].end_ms} menabrak start berikutnya`);
});

const failed = results.filter((r) => !r.ok).length;
console.log(`\nFace smoothing test: ${results.length - failed}/${results.length} PASS`);
if (failed) process.exit(1);
