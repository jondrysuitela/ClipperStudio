// Regression: job yang hang (worker tidak pernah settle) harus tetap melepas
// slot queue lewat watchdog. Sebelum perbaikan, activeJobs tidak pernah turun
// sehingga antrean berhenti permanen setelah satu job timeout.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Env harus diset SEBELUM require: konstanta dibaca saat modul dimuat.
process.env.CLIPFORGE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "clipper-queue-"));
process.env.CLIPFORGE_MAX_JOBS = "1";
process.env.CLIPFORGE_JOB_MAX_RUNTIME = "400";

const { _test } = require("./server.js");
const { createJob, getActiveJobs } = _test;

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

(async () => {
  // Job 1: worker yang tidak pernah selesai (mensimulasikan ffmpeg/python hang).
  const hanging = createJob("test-hang", () => new Promise(() => {}));
  // Job 2: antre di belakang job 1 (MAX_ACTIVE_JOBS=1).
  const follower = createJob("test-follower", async () => "selesai");

  await new Promise((resolve) => setTimeout(resolve, 1200));

  test("watchdog menandai job hang sebagai failed", () => {
    assert.strictEqual(hanging.status, "failed");
    assert.match(String(hanging.error), /melebihi batas waktu/i);
  });

  test("slot queue dilepas setelah watchdog (job berikutnya tetap jalan)", () => {
    assert.strictEqual(follower.status, "done", `follower status: ${follower.status}`);
    assert.strictEqual(getActiveJobs(), 0, "activeJobs harus kembali 0");
  });

  // Guard statis: exportClip tidak boleh membuat job bersarang lagi.
  test("exportClip tidak memanggil createJob (tidak ada job bersarang)", () => {
    const src = fs.readFileSync("server.js", "utf8");
    const start = src.indexOf("async function exportClip(");
    const end = src.indexOf("function sectionFileName", start);
    assert.ok(start > 0 && end > start, "blok exportClip ditemukan");
    const body = src.slice(start, end);
    // Abaikan komentar: penjelasan perbaikan menyebut createJob secara sengaja.
    const codeOnly = body.split(/\r?\n/).filter((line) => !line.trim().startsWith("//")).join("\n");
    assert.ok(!/createJob\(/.test(codeOnly), "exportClip masih membuat job bersarang");
    assert.ok(/analyzeForSpeakerCut\(/.test(codeOnly), "analisis speaker tetap dipanggil inline");
  });

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nQueue watchdog test done: ${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error("HARNESS ERROR", error);
  process.exit(1);
});
