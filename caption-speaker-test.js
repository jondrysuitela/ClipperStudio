// Regression: caption pecah saat speaker berganti + kata terakhir tidak menggantung.
const assert = require("assert");
const engine = require("./clipme-caption-engine.js");

const results = [];
function test(name, fn) {
  try { fn(); results.push(true); console.log(`[OK  ] ${name}`); }
  catch (e) { results.push(false); console.error(`[FAIL] ${name}\n  -> ${e.message}`); process.exitCode = 1; }
}

// 10 kata: 5 dari S0 lalu 5 dari S1, rapat tanpa jeda
function words() {
  const out = [];
  let t = 0;
  for (let i = 0; i < 10; i++) {
    out.push({ text: `kata${i}`, start: t, end: t + 0.4, speaker_id: i < 5 ? "S0" : "S1" });
    t += 0.45;
  }
  return out;
}

const cfg = { maxSegmentDuration: 4, maxWords: 7, maxLines: 2, maxLineLength: 40 };

test("caption tidak membentang lintas pembicara", () => {
  const e = engine(cfg);
  const out = e.processHeuristic(words(), "dynamic", "none", "S0");
  // Boleh terpecah karena durasi/jumlah kata, tapi TIDAK boleh campur speaker.
  for (const seg of out.segments) {
    const ids = new Set((seg.words || []).map((w) => w.speaker_id));
    assert.strictEqual(ids.size, 1, `segmen "${seg.text}" mencampur speaker: ${[...ids].join(",")}`);
    assert.strictEqual(seg.speaker_id, (seg.words[0] || {}).speaker_id);
  }
  const order = out.segments.map((s) => s.speaker_id);
  assert.ok(order.indexOf("S0") < order.indexOf("S1"), `urutan speaker salah: ${order.join(",")}`);
});

test("tanpa speaker_id tidak ada pemecahan baru", () => {
  const plain = words().map((w) => ({ ...w, speaker_id: "" }));
  const e = engine(cfg);
  const out = e.processHeuristic(plain, "dynamic", "none", "S0");
  assert.ok(out.segments.length > 0, "harus tetap menghasilkan caption");
  for (const seg of out.segments) assert.strictEqual(seg.speaker_id, "");
});

test("setiap segmen punya timing valid dan tidak overlap", () => {
  const e = engine(cfg);
  const out = e.processHeuristic(words(), "dynamic", "none", "S0");
  for (let i = 0; i < out.segments.length; i++) {
    const s = out.segments[i];
    assert.ok(s.end > s.start, "end harus > start");
    if (i) assert.ok(s.start >= out.segments[i - 1].end - 0.001, "tidak boleh overlap");
  }
});

const failed = results.filter((ok) => !ok).length;
console.log(`\nCaption speaker test: ${results.length - failed}/${results.length} PASS`);
if (failed) process.exit(1);
