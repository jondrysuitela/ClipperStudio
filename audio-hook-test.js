// Verifikasi hook audio dengan file audio NYATA (quiet vs loud).
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const FFMPEG = process.env.FFMPEG_PATH || path.join(__dirname, "bin", "ffmpeg.exe");
if (!fs.existsSync(FFMPEG)) {
  console.log(`[SKIP] ${path.basename(__filename)}: butuh ffmpeg (${FFMPEG}).`);
  process.exit(0);
}

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "clipper-audiohook-"));
process.env.CLIPFORGE_DATA_DIR = DATA_DIR;

const { _test } = require("./server.js");

const results = [];
async function test(name, fn) {
  try { await fn(); results.push(true); console.log(`[OK  ] ${name}`); }
  catch (e) { results.push(false); console.error(`[FAIL] ${name}\n  -> ${e.message}`); process.exitCode = 1; }
}

const projectId = "11111111-2222-4333-8444-555555555555";
const projectDir = path.join(DATA_DIR, "uploads", projectId);
fs.mkdirSync(projectDir, { recursive: true });
const source = path.join(projectDir, "source.mp4");

// 16 detik: 0-8 pelan (volume 0.05), 8-16 keras (volume 0.9)
execFileSync(FFMPEG, [
  "-y",
  "-f", "lavfi", "-i", "testsrc=duration=16:size=320x240:rate=15",
  "-f", "lavfi", "-i", "sine=frequency=300:duration=8",
  "-f", "lavfi", "-i", "sine=frequency=300:duration=8",
  "-filter_complex", "[1:a]volume=0.05[a1];[2:a]volume=0.9[a2];[a1][a2]concat=n=2:v=0:a=1[aout]",
  "-map", "0:v", "-map", "[aout]",
  "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source
], { stdio: "ignore" });

const spans = [
  { text: "kalimat pertama yang diucapkan pelan", start: 0.5, end: 7.5 },
  { text: "padahal ini kesalahan besar yang bikin rugi", start: 8.5, end: 15.5 }
];
const clip = { start: 0, end: 16 };

(async () => {
  await test("computeAudioBonuses mengembalikan bonus per kalimat", async () => {
    const bonuses = await _test.computeAudioBonuses(projectDir, spans, clip);
    assert.ok(Array.isArray(bonuses), "harus array");
    assert.strictEqual(bonuses.length, spans.length);
  });

  await test("kalimat keras mendapat bonus lebih tinggi dari yang pelan", async () => {
    const bonuses = await _test.computeAudioBonuses(projectDir, spans, clip);
    assert.ok(bonuses[1] > bonuses[0], `pelan=${bonuses[0]} keras=${bonuses[1]}`);
    assert.ok(bonuses[1] > 0, "bagian keras harus dapat bonus");
  });

  await test("splitSentenceSpans memberi rentang waktu proporsional", async () => {
    const segs = [{ start: 10, end: 14, text: "Satu. Dua. Tiga." }];
    const out = _test.splitSentenceSpans(segs);
    assert.strictEqual(out.length, 3, `dapat ${out.length}`);
    assert.ok(Math.abs(out[0].start - 10) < 0.01);
    assert.ok(Math.abs(out[2].end - 14) < 0.01);
    for (let i = 1; i < out.length; i++) assert.ok(out[i].start >= out[i - 1].start);
  });

  const failed = results.filter((ok) => !ok).length;
  console.log(`\nAudio hook integration test: ${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
})();
