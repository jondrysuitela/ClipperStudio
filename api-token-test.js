// Regression: mode LAN (HOST=0.0.0.0) wajib memakai token API. Token juga
// bisa dipaksa di loopback lewat CLIPFORGE_API_TOKEN. Tanpa token, seluruh
// endpoint /api harus menolak (401), bukan melayani.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "clipper-apitoken-"));
process.env.CLIPFORGE_DATA_DIR = DATA_DIR;
process.env.CLIPFORGE_API_TOKEN = "test-token-1234";

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

function request(port, method, urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: urlPath, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    req.on("error", reject);
    req.end();
  });
}

(async () => {
  const srv = await _test.startServerForTest(0, "127.0.0.1");
  const port = srv.port;

  try {
    await test("token dari env dipakai server", async () => {
      assert.strictEqual(srv.apiToken, "test-token-1234");
    });

    await test("/api tanpa token -> 401", async () => {
      const res = await request(port, "GET", "/api/system");
      assert.strictEqual(res.status, 401, `dapat ${res.status}`);
    });

    await test("/api dengan header token -> 200", async () => {
      const res = await request(port, "GET", "/api/system", { "x-clipper-token": "test-token-1234" });
      assert.strictEqual(res.status, 200, `dapat ${res.status}`);
    });

    await test("/api dengan token salah -> 401", async () => {
      const res = await request(port, "GET", "/api/system", { "x-clipper-token": "salah" });
      assert.strictEqual(res.status, 401, `dapat ${res.status}`);
    });

    await test("navigasi ?token= memasang cookie lalu redirect", async () => {
      const res = await request(port, "GET", "/?token=test-token-1234");
      assert.strictEqual(res.status, 302, `dapat ${res.status}`);
      const cookie = String(res.headers["set-cookie"] || "");
      assert.ok(cookie.includes("clipper_token=test-token-1234"), "cookie harus dipasang");
      assert.ok(/HttpOnly/i.test(cookie), "cookie harus HttpOnly");
      assert.ok(/SameSite=Strict/i.test(cookie), "cookie harus SameSite=Strict");
    });

    await test("/api dengan cookie token -> 200", async () => {
      const res = await request(port, "GET", "/api/system", { Cookie: "clipper_token=test-token-1234" });
      assert.strictEqual(res.status, 200, `dapat ${res.status}`);
    });

    await test("halaman statis tetap bisa dimuat tanpa token", async () => {
      const res = await request(port, "GET", "/");
      assert.notStrictEqual(res.status, 401, "static tidak boleh kena 401");
    });
  } finally {
    try { srv.shutdown(); } catch {}
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nAPI token test done: ${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error("HARNESS ERROR", error);
  process.exit(1);
});
