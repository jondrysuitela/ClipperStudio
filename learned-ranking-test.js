// Regression: bobot pembelajaran mempengaruhi urutan clip (hanya skor berdekatan).
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "clipper-learn-rank-"));
process.env.CLIPFORGE_DATA_DIR = DATA_DIR;
delete process.env.CLIPFORGE_LEARNED_RANK;

const outDir = path.join(DATA_DIR, "outputs", "probe");
fs.mkdirSync(outDir, { recursive: true });

// 6 export: 3 "PROBLEM" performa tinggi, 3 "CURIOSITY" rendah
const rows = [
  ["Padahal semua orang bilang mustahil, saya rugi dua juta.", 1000, 220],
  ["Padahal ini kesalahan kedua saya, gagal lagi.", 1000, 210],
  ["Padahal kita hampir bangkrut waktu itu.", 1000, 200],
  ["Saya bekerja di kantor itu.", 1000, 20],
  ["Saya bekerja di kantor itu juga.", 1000, 22],
  ["Saya bekerja di kantor itu setiap hari.", 1000, 18]
];
rows.forEach(([hook, views, likes], i) => {
  const mp4 = path.join(outDir, `probe-${i}.mp4`);
  fs.writeFileSync(mp4, Buffer.alloc(8));
  fs.writeFileSync(`${mp4}.info.txt`, `Project: probe\nClip ID: ${i + 1}\nHook: ${hook}\nRasio: portrait\n`);
  fs.writeFileSync(`${mp4}.perf.json`, JSON.stringify({
    postId: String(i), platform: "tiktok",
    records: [{ at: Date.now(), views, likes, comments: 0, shares: 0 }],
    updatedAt: Date.now()
  }));
});

const { _test } = require("./server.js");

const results = [];
function test(name, fn) {
  try { fn(); results.push(true); console.log(`[OK  ] ${name}`); }
  catch (e) { results.push(false); console.error(`[FAIL] ${name}\n  -> ${e.message}`); process.exitCode = 1; }
}

test("bobot terbaca dari ledger nyata (>=3 sampel)", () => {
  const learned = _test.getLearnedWeightsCached();
  assert.ok(learned, "harus ada bobot");
  assert.ok(learned.total >= 6, `total=${learned.total}`);
  assert.ok(learned.weights.PROBLEM > 1, `PROBLEM=${learned.weights.PROBLEM}`);
});

test("skor berdekatan diurutkan ulang oleh bobot", () => {
  const clips = [
    { id: 1, score: 80, hookType: "CURIOSITY" },
    { id: 2, score: 79, hookType: "PROBLEM" }
  ];
  const out = _test.applyLearnedRanking(clips);
  assert.strictEqual(out[0].hookType, "PROBLEM", "PROBLEM harus naik");
  assert.strictEqual(out[0].id, 1, "id dinomori ulang");
  assert.strictEqual(out[1].id, 2);
});

test("selisih skor jauh tidak diubah urutannya", () => {
  const clips = [
    { id: 1, score: 90, hookType: "CURIOSITY" },
    { id: 2, score: 60, hookType: "PROBLEM" }
  ];
  const out = _test.applyLearnedRanking(clips);
  assert.strictEqual(out[0].hookType, "CURIOSITY", "jarak 30 poin tidak boleh dibalik");
});

test("skor tidak diubah, hanya urutan", () => {
  const clips = [{ id: 1, score: 80, hookType: "CURIOSITY" }, { id: 2, score: 79, hookType: "PROBLEM" }];
  const out = _test.applyLearnedRanking(clips);
  assert.deepStrictEqual(out.map((c) => c.score).sort((a, b) => b - a), [80, 79]);
  assert.ok(out.every((c) => c.learnedWeight >= 0.85 && c.learnedWeight <= 1.2));
});

test("env CLIPFORGE_LEARNED_RANK=0 mematikan pembelajaran", () => {
  process.env.CLIPFORGE_LEARNED_RANK = "0";
  const clips = [{ id: 1, score: 80, hookType: "CURIOSITY" }, { id: 2, score: 79, hookType: "PROBLEM" }];
  const out = _test.applyLearnedRanking(clips);
  assert.strictEqual(out[0].hookType, "CURIOSITY", "urutan asli dipertahankan");
  delete process.env.CLIPFORGE_LEARNED_RANK;
});

const failed = results.filter((ok) => !ok).length;
console.log(`\nLearned ranking test: ${results.length - failed}/${results.length} PASS`);
if (failed) process.exit(1);
