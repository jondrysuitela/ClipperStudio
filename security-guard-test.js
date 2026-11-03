// Regression: server lokal hanya boleh melayani dirinya sendiri.
// Sebelum perbaikan, guard Origin cuma memeriksa hostname ("localhost"),
// sehingga dev server lain di port berbeda bisa memicu POST, dan tidak ada
// validasi Host sama sekali (DNS rebinding attacker.com -> 127.0.0.1).
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

process.env.CLIPFORGE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "clipper-secguard-"));
delete process.env.OPENAI_API_KEY;

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

function request(port, method, urlPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: urlPath, method, headers },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  const srv = await _test.startServerForTest(0, "127.0.0.1");
  const port = srv.port;
  const selfOrigin = `http://127.0.0.1:${port}`;

  try {
    await test("Host asing (DNS rebinding) ditolak 403", async () => {
      const res = await request(port, "GET", "/api/system", { headers: { Host: "attacker.example" } });
      assert.strictEqual(res.status, 403, `dapat ${res.status}`);
    });

    await test("Host milik server sendiri tetap 200", async () => {
      const res = await request(port, "GET", "/api/system", { headers: { Host: `127.0.0.1:${port}` } });
      assert.strictEqual(res.status, 200, `dapat ${res.status}`);
    });

    await test("Origin localhost di port lain ditolak 403", async () => {
      const res = await request(port, "POST", "/api/projects/00000000-0000-4000-8000-000000000000/config", {
        headers: { "Content-Type": "application/json", "Content-Length": "2", Origin: "http://localhost:3000" },
        body: "{}"
      });
      assert.strictEqual(res.status, 403, `dapat ${res.status}`);
    });

    await test("Origin sendiri tidak diblokir, project hantu 404", async () => {
      const res = await request(port, "POST", "/api/projects/00000000-0000-4000-8000-000000000000/config", {
        headers: { "Content-Type": "application/json", "Content-Length": "2", Origin: selfOrigin },
        body: "{}"
      });
      assert.notStrictEqual(res.status, 403, "origin sendiri tidak boleh diblokir");
      assert.strictEqual(res.status, 404, `project tidak ada harus 404, dapat ${res.status}`);
    });

    await test("callback OAuth meng-escape accountName & provider", async () => {
      const src = fs.readFileSync("server.js", "utf8");
      assert.ok(/function escapeHtml\(/.test(src), "escapeHtml helper harus ada");
      assert.ok(/terhubung sebagai \$\{escapeHtml\(account\.accountName\)\}/.test(src), "accountName harus di-escape");
      assert.ok(/Gagal menghubungkan \$\{escapeHtml\(entry\.provider\)\}/.test(src), "provider harus di-escape");
    });

    await test("isSafePath menolak traversal, menerima path sah", async () => {
      const base = path.join(process.cwd(), "outputs");
      assert.strictEqual(_test.isSafePath(path.join(base, "..", "..", "etc", "passwd"), base), false);
      assert.strictEqual(_test.isSafePath(path.join(base, "ok.mp4"), base), true);
    });

    await test("renderer punya helper esc() dan tidak ada escape ad-hoc di innerHTML", async () => {
      const script = fs.readFileSync("script.js", "utf8");
      assert.ok(/const esc = \(value\)/.test(script), "esc() harus ada di script.js");
      const lines = script.split(/\r?\n/).filter((line) => /innerHTML/.test(line) && /replace\(\/<\/g/.test(line));
      assert.strictEqual(lines.length, 0, `masih ada escape manual di innerHTML: ${lines[0] || ""}`);
    });
  } finally {
    try { srv.shutdown(); } catch {}
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nSecurity guard test done: ${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error("HARNESS ERROR", error);
  process.exit(1);
});
