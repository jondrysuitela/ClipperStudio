// E2E: export satu clip dari video lokal, dengan caption berisi karakter
// khusus ("&" dan apostrof) — memverifikasi chain drawtext/ASS tidak rusak,
// file MP4 benar-benar dibuat, durasinya sesuai, dan bisa diunduh.
// Butuh ffmpeg + ffprobe di bin/ (atau FFMPEG_PATH/FFPROBE_PATH).
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const FFMPEG = process.env.FFMPEG_PATH || path.join(__dirname, "bin", "ffmpeg.exe");
const FFPROBE = process.env.FFPROBE_PATH || path.join(__dirname, "bin", "ffprobe.exe");

if (!fs.existsSync(FFMPEG) || !fs.existsSync(FFPROBE)) {
  console.log(`[SKIP] ${path.basename(__filename)}: butuh ffmpeg & ffprobe (${FFMPEG}).`);
  process.exit(0);
}

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "clipper-export-e2e-"));
process.env.CLIPFORGE_DATA_DIR = DATA_DIR;

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

function request(port, method, urlPath, body, contentType) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: urlPath,
        method,
        headers: payload ? { "Content-Type": contentType || "application/json", "Content-Length": payload.length } : {}
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          let json = null;
          try { json = JSON.parse(buf.toString("utf8")); } catch {}
          resolve({ status: res.statusCode, json, buffer: buf, headers: res.headers });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const projectId = crypto.randomUUID();
  const projectDir = path.join(DATA_DIR, "uploads", projectId);
  fs.mkdirSync(projectDir, { recursive: true });

  const source = path.join(projectDir, "source.mp4");
  execFileSync(FFMPEG, [
    "-y", "-f", "lavfi", "-i", "testsrc=duration=6:size=320x240:rate=15",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-shortest", source
  ], { stdio: "ignore" });

  fs.writeFileSync(path.join(projectDir, "project.json"), JSON.stringify({
    id: projectId,
    name: "Export E2E",
    type: "upload",
    duration: 6,
    clips: [{ id: 1, start: 1, end: 4, caption: "Uji & ekspor", hook: "hook" }],
    transcriptPath: "",
    transcriptProvider: "none"
  }, null, 2));

  const { startServer } = require("./server.js");
  const srv = await startServer(0, "127.0.0.1");
  const port = srv.port;
  let jobId = null;

  try {
    await test("POST /api/export membuat job", async () => {
      const res = await request(port, "POST", "/api/export", JSON.stringify({
        projectId,
        clipId: 1,
        start: 1,
        end: 4,
        ratio: "portrait",
        caption: "Uji & ekspor: don't stop",
        captionStyle: "bold",
        captionSize: 23,
        fontFamily: "Arial",
        segments: [
          { start: 0, end: 3, text: "Uji & ekspor: don't stop" }
        ]
      }));
      assert.strictEqual(res.status, 202, `status ${res.status}: ${JSON.stringify(res.json)}`);
      assert.ok(res.json && res.json.jobId, "jobId harus ada");
      jobId = res.json.jobId;
    });

    await test("job export selesai tanpa error", async () => {
      let job = null;
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        const res = await request(port, "GET", `/api/jobs/${jobId}`);
        job = res.json;
        if (job && ["done", "failed", "cancelled"].includes(job.status)) break;
        await sleep(400);
      }
      assert.ok(job, "job harus terbaca");
      assert.strictEqual(job.status, "done", `status job: ${job.status} (${job.error || ""})`);
    });

    await test("hasil export punya file MP4 yang bisa diunduh", async () => {
      const res = await request(port, "GET", `/api/jobs/${jobId}`);
      const result = res.json.result || {};
      assert.ok(result.downloadUrl, "downloadUrl harus ada");
      const file = await request(port, "GET", result.downloadUrl);
      assert.strictEqual(file.status, 200, `download status ${file.status}`);
      assert.ok(file.buffer.length > 10_000, `file terlalu kecil: ${file.buffer.length} bytes`);
    });

    await test("durasi MP4 hasil export ~ 3 detik (1..4)", async () => {
      const res = await request(port, "GET", `/api/jobs/${jobId}`);
      const result = res.json.result || {};
      // Ambil file dari disk lewat folder output (hindari simpan buffer besar).
      const outDir = path.join(DATA_DIR, "outputs");
      const found = [];
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name.endsWith(".mp4")) found.push(full);
        }
      };
      walk(outDir);
      assert.ok(found.length >= 1, "harus ada MP4 di outputs/");
      const probe = execFileSync(FFPROBE, [
        "-v", "error", "-show_entries", "format=duration,size",
        "-of", "json", found[0]
      ], { encoding: "utf8" });
      const info = JSON.parse(probe).format;
      const duration = Number(info.duration);
      const size = Number(info.size);
      assert.ok(duration > 2.5 && duration < 3.6, `durasi ${duration}s di luar 2.5..3.6`);
      assert.ok(size > 10_000, `ukuran ${size} bytes terlalu kecil`);
      assert.ok(result.downloadUrl, "downloadUrl tetap ada");
    });
  } finally {
    try { srv.shutdown(); } catch {}
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nExport E2E done: ${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error("HARNESS ERROR", error);
  process.exit(1);
});
