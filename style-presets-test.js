// Regression: preset gaya tervalidasi (tidak bisa menyuntik nilai aneh).
const assert = require("assert");
const P = require("./clipme-style-presets.js");

const results = [];
function test(name, fn) {
  try { fn(); results.push(true); console.log(`[OK  ] ${name}`); }
  catch (e) { results.push(false); console.error(`[FAIL] ${name}\n  -> ${e.message}`); process.exitCode = 1; }
}

test("setelan default valid", () => {
  const s = P.normalizeSettings(null);
  assert.ok(P.CAPTION_STYLES.includes(s.captionStyle));
  assert.ok(P.RATIOS.includes(s.ratio));
  assert.ok(s.captionSize >= 14 && s.captionSize <= 40);
});

test("ukuran & posisi di-clamp ke rentang aman", () => {
  const s = P.normalizeSettings({ captionSize: 999, captionPosition: -5 });
  assert.strictEqual(s.captionSize, 40);
  assert.strictEqual(s.captionPosition, 30);
});

test("caption style dan rasio tak dikenal ditolak", () => {
  const s = P.normalizeSettings({ captionStyle: "drop-table", ratio: "../../etc/passwd" });
  assert.strictEqual(s.captionStyle, P.DEFAULTS.captionStyle);
  assert.strictEqual(s.ratio, P.DEFAULTS.ratio);
});

test("warna hanya hex 6 digit", () => {
  assert.strictEqual(P.normalizeSettings({ captionColor: "#ff00aa" }).captionColor, "#FF00AA");
  assert.strictEqual(P.normalizeSettings({ captionColor: "red;background:url(x)" }).captionColor, P.DEFAULTS.captionColor);
});

test("font dipotong dan tidak kosong", () => {
  assert.strictEqual(P.normalizeSettings({ fontFamily: "  Georgia  " }).fontFamily, "Georgia");
  assert.strictEqual(P.normalizeSettings({ fontFamily: "   " }).fontFamily, P.DEFAULTS.fontFamily);
});

test("boolean dipaksa boolean", () => {
  const s = P.normalizeSettings({ speakerCut: "yes", faceTrack: 0 });
  assert.strictEqual(s.speakerCut, true);
  assert.strictEqual(s.faceTrack, false);
});

test("preset bawaan lengkap dan tervalidasi", () => {
  const list = P.mergePresets([]);
  assert.ok(list.length >= 3);
  for (const preset of list) {
    assert.ok(preset.id && preset.name);
    assert.ok(P.CAPTION_STYLES.includes(preset.settings.captionStyle));
    assert.ok(P.RATIOS.includes(preset.settings.ratio));
  }
});

test("preset user menimpa bawaan dengan id sama", () => {
  const custom = [{ id: "podcast-tebal", name: "Versi gue", settings: { captionSize: 31 } }];
  const list = P.mergePresets(custom);
  const found = list.find((p) => p.id === "podcast-tebal");
  assert.strictEqual(found.name, "Versi gue");
  assert.strictEqual(found.settings.captionSize, 31);
  assert.strictEqual(found.custom, true);
});

test("preset rusak diabaikan, bukan bikin crash", () => {
  assert.strictEqual(P.normalizePreset(null), null);
  assert.strictEqual(P.normalizePreset({ name: "tanpa id" }), null);
  assert.strictEqual(P.mergePresets([null, {}, { id: "" }]).length, P.BUILTIN.length);
});

test("createPreset menolak nama kosong", () => {
  assert.strictEqual(P.createPreset("   ", {}), null);
  const preset = P.createPreset("Gaya Gue", { captionSize: 30 });
  assert.ok(preset && preset.id.startsWith("custom-"));
  assert.strictEqual(preset.settings.captionSize, 30);
});

const failed = results.filter((ok) => !ok).length;
console.log(`\nStyle preset test: ${results.length - failed}/${results.length} PASS`);
if (failed) process.exit(1);
