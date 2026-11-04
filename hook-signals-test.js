// Regression: sinyal hook baru (contrarian, stakes, second person, anchor) dan band.
const assert = require("assert");
const HE = require("./clipme-hook-engine.js");

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

const score = (text) => HE.scoreHook(text, "id", {});

test("scoreHook mengembalikan band weak/medium/strong", () => {
  const r = score("Saya membuat kesalahan besar waktu membangun bisnis ini.");
  assert.ok(["weak", "medium", "strong"].includes(r.band), `band: ${r.band}`);
});

test("pembalikan (padahal/tapi) menaikkan skor dibanding kalimat netral", () => {
  const netral = score("Saya membangun bisnis ini selama lima tahun.");
  const balik = score("Saya membangun bisnis ini lima tahun, padahal semua orang bilang itu mustahil.");
  assert.ok(balik.score > netral.score, `${balik.score} harus > ${netral.score}`);
  assert.strictEqual(balik.evidence.contrarian, 1);
});

test("taruhan/kerugian terdeteksi sebagai sinyal stakes", () => {
  const r = score("Saya kehilangan dua juta dolar karena kesalahan ini.");
  assert.strictEqual(r.evidence.stakes, 1, "stakes harus terdeteksi");
});

test("sapaan langsung (kamu/lu) terdeteksi", () => {
  const r = score("Kalau kamu masih melakukan ini, berhenti sekarang.");
  assert.strictEqual(r.evidence.secondPerson, 1);
});

test("jangkar konkret (tahun/nominal) terdeteksi", () => {
  const r = score("Tahun 2002 saya mulai dengan modal lima ratus ribu.");
  assert.strictEqual(r.evidence.anchor, 1, "anchor harus terdeteksi");
});

test("hook yang lebih kuat menang pada selectHook", () => {
  const sentences = [
    "Saya bekerja di kantor itu.",
    "Padahal semua orang bilang mustahil, saya kehilangan dua juta dolar tahun 2002."
  ];
  const picked = HE.selectHook(sentences, "id", {});
  const chosen = String(picked.recommendedHook || picked.hook || "");
  assert.match(chosen, /mustahil|dua juta|kehilangan/i, `yang terpilih: ${chosen}`);
});

const failed = results.filter((r) => !r.ok).length;
console.log(`\nHook signals test: ${results.length - failed}/${results.length} PASS`);
if (failed) process.exit(1);
