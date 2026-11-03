// Regression: project YouTube "fast mode" tidak punya transcript. Tombol
// Generate tidak boleh langsung menyerah — kalau transcript.json sudah ada di
// disk, manifest harus diperbaiki dan clip tetap dibuat. (Jalur unduh subtitle
// butuh jaringan, jadi tidak diuji di sini; yang diuji adalah fallback lokal.)
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "clipper-transcript-"));
process.env.CLIPFORGE_DATA_DIR = DATA_DIR;

const { _test } = require("./server.js");

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`[OK  ] ${name}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.error(`[FAIL] ${name}\n  -> ${error.message}`);
    process.exitCode = 1;
  }
}

function request(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: urlPath,
      method,
      headers: payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}
    }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async () => {
  const projectId = crypto.randomUUID();
  const projectDir = path.join(DATA_DIR, "uploads", projectId);
  fs.mkdirSync(projectDir, { recursive: true });

  // Manifest seperti yang ditulis fast mode: tanpa transcriptPath.
  fs.writeFileSync(path.join(projectDir, "project.json"), JSON.stringify({
    id: projectId,
    videoId: "dQw4w9WgXcQ",
    type: "youtube",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    title: "YouTube dQw4w9WgXcQ",
    probe: { duration: 60, width: 0, height: 0, codec: "youtube-fast" },
    transcriptPath: "",
    transcriptProvider: "fast-mode"
  }, null, 2));

  // Subtitle sudah ada di disk (mis. hasil percobaan sebelumnya), tapi manifest
  // belum menunjuk ke sana.
  fs.writeFileSync(path.join(projectDir, "transcript.json"), JSON.stringify([
    { start: 0, end: 3, text: "Halo dunia ini uji generate" },
    { start: 3, end: 6, text: "Clip harus terbentuk tanpa error" }
  ]));

  const srv = await _test.startServerForTest(0, "127.0.0.1");
  const port = srv.port;

  try {
    await test("generate memperbaiki manifest dari transcript.json yang ada", async () => {
      const res = await request(port, "POST", `/api/projects/${projectId}/generate`, { duration: "90", durationMode: "AUTO" });
      assert.strictEqual(res.status, 200, `status ${res.status}: ${JSON.stringify(res.json)}`);
      assert.ok(Array.isArray(res.json.clips) && res.json.clips.length > 0, "harus menghasilkan clip");
      assert.match(String(res.json.transcriptStatus || ""), /cached-transcript|youtube-captions/);
    });

    await test("manifest menunjuk transcript.json setelah generate", async () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(projectDir, "project.json"), "utf8"));
      assert.strictEqual(manifest.transcriptPath, "transcript.json");
      assert.strictEqual(manifest.transcriptProvider, "cached-transcript");
    });

    // Guard statis: pesan lama tidak boleh lagi jadi satu-satunya jalur.
    await test("handleGenerateClips memanggil ensureProjectTranscript", async () => {
      const src = fs.readFileSync("server.js", "utf8");
      const start = src.indexOf("async function handleGenerateClips(");
      const end = src.indexOf("function ", start + 10);
      assert.ok(start > 0, "handleGenerateClips harus async");
      const body = src.slice(start, end);
      assert.ok(/ensureProjectTranscript\(projectDir, manifest\)/.test(body), "harus memanggil ensureProjectTranscript");
    });

    // Guard statis: isolasi Python hanya untuk interpreter app, bukan yt-dlp.
    await test("isolasi Python hanya untuk interpreter python.exe", async () => {
      const pyEnv = { PYTHONHOME: "C:/salah" };
      const py = _test.applyPythonIsolation(pyEnv, "C:/app/.venv/Scripts/python.exe");
      assert.strictEqual(py.PYTHONNOUSERSITE, "1", "python harus diisolasi");
      assert.strictEqual(py.PYTHONHOME, undefined, "PYTHONHOME harus dibuang");

      const yt = _test.applyPythonIsolation({}, "C:/app/bin/yt-dlp.exe");
      assert.strictEqual(yt.PYTHONNOUSERSITE, undefined, "yt-dlp tidak boleh diisolasi");
    });
  } finally {
    try { srv.shutdown(); } catch {}
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nTranscript fallback test done: ${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error("HARNESS ERROR", error);
  process.exit(1);
});
