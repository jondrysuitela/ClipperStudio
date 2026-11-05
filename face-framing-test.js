// Regression: framing cut-to-face (zoom + headroom).
const assert = require("assert");
const fs = require("fs");
const AS = require("./clipme-active-speaker.js");

const results = [];
function test(name, fn) {
  try { fn(); results.push(true); console.log(`[OK  ] ${name}`); }
  catch (e) { results.push(false); console.error(`[FAIL] ${name}\n  -> ${e.message}`); process.exitCode = 1; }
}

function timeline({ faces = [{ x: 800, y: 200, w: 300, h: 300, confidence: 0.9, track_id: 1 }] } = {}) {
  return {
    frames: [{ t_ms: 0, faces }, { t_ms: 500, faces }],
    source_width: 1920,
    source_height: 1080
  };
}
const speaker = { segments: [{ speaker_id: "S0", start_ms: 0, end_ms: 1000 }] };

test("zoom=1 memakai tinggi penuh (perilaku lama)", () => {
  const out = AS.buildAssociations(timeline(), speaker, { sourceWidth: 1920, sourceHeight: 1080, targetAspect: 9 / 16 });
  assert.strictEqual(out[0].crop.h, 1080);
});

test("zoom=1.25 memperkecil tinggi crop", () => {
  const out = AS.buildAssociations(timeline(), speaker, { sourceWidth: 1920, sourceHeight: 1080, targetAspect: 9 / 16, zoom: 1.25 });
  assert.ok(out[0].crop.h < 1080, `h=${out[0].crop.h}`);
  assert.ok(Math.abs(out[0].crop.h - 1080 / 1.25) <= 2, `h=${out[0].crop.h}`);
});

test("aspect target tetap terjaga saat zoom", () => {
  const out = AS.buildAssociations(timeline(), speaker, { sourceWidth: 1920, sourceHeight: 1080, targetAspect: 9 / 16, zoom: 1.3 });
  const { w, h } = out[0].crop;
  assert.ok(Math.abs(w / h - 9 / 16) < 0.01, `${w}x${h}`);
});

test("crop tidak keluar dari frame sumber", () => {
  const out = AS.buildAssociations(timeline({ faces: [{ x: 0, y: 0, w: 200, h: 200, confidence: 0.9, track_id: 2 }] }), speaker, {
    sourceWidth: 1920, sourceHeight: 1080, targetAspect: 9 / 16, zoom: 1.4
  });
  const { x, y, w, h } = out[0].crop;
  assert.ok(x >= 0 && y >= 0 && x + w <= 1920.5 && y + h <= 1080.5, `crop ${x},${y} ${w}x${h}`);
});

test("server memakai zoom default 1.15 (framing lebih ketat)", () => {
  const src = fs.readFileSync("server.js", "utf8");
  const hits = src.split("CLIPFORGE_FACE_ZOOM || 1.15").length - 1;
  assert.strictEqual(hits, 2, `default zoom harus di dua call site, dapat ${hits}`);
});

test("headroom menempatkan wajah di bagian atas crop", () => {
  const face = { x: 800, y: 300, w: 300, h: 300, confidence: 0.9, track_id: 3 };
  const out = AS.buildAssociations(timeline({ faces: [face] }), speaker, {
    sourceWidth: 1920, sourceHeight: 1080, targetAspect: 9 / 16, zoom: 1.3, headroom: 0.38
  });
  const crop = out[0].crop;
  const faceCenter = face.y + face.h / 2;
  const relative = (faceCenter - crop.y) / crop.h;
  assert.ok(relative > 0.2 && relative < 0.5, `posisi wajah ${relative.toFixed(2)} tidak di upper area`);
});

const failed = results.filter((ok) => !ok).length;
console.log(`\nFace framing test: ${results.length - failed}/${results.length} PASS`);
if (failed) process.exit(1);
