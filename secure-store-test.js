// Regression: penyimpanan kredensial harus (a) round-trip benar, (b) tulis
// atomik tanpa menyisakan file .tmp, (c) tidak crash saat menemukan file
// terenkripsi milik runtime lain, (d) melaporkan status enkripsi tanpa
// membocorkan isi token.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "clipper-secstore-"));
process.env.CLIPPER_DATA_DIR = DATA_DIR;

const tokens = require("./social/token-manager.js");
const credentials = require("./social/credentials.js");
const secureStore = require("./social/secure-store.js");

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

const TOKEN_FILE = path.join(DATA_DIR, "social-tokens.json");
const CREDS_FILE = path.join(DATA_DIR, "integrations.json");

test("token round-trip tersimpan & terbaca", () => {
  tokens.store("youtube", { access_token: "secret-abc", refresh_token: "refresh-xyz", expires_at: Date.now() + 3600e3 });
  const got = tokens.get("youtube");
  assert.strictEqual(got.access_token, "secret-abc");
  assert.strictEqual(got.refresh_token, "refresh-xyz");
  assert.ok(tokens.hasValidToken("youtube"), "token harus dianggap valid");
});

test("tidak ada file .tmp yang tertinggal (tulis atomik)", () => {
  const leftovers = fs.readdirSync(DATA_DIR).filter((n) => n.endsWith(".tmp"));
  assert.deepStrictEqual(leftovers, [], `sisa: ${leftovers.join(", ")}`);
});

test("token kedaluwarsa tidak dianggap valid", () => {
  tokens.store("tiktok", { access_token: "old", expires_at: Date.now() - 1000 });
  assert.strictEqual(tokens.hasValidToken("tiktok"), false);
});

test("remove menghapus token", () => {
  tokens.remove("tiktok");
  assert.strictEqual(tokens.get("tiktok"), null);
});

test("file terenkripsi dari runtime lain tidak membuat crash", () => {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ __encrypted: true, version: 2, data: "AAAA" }), "utf8");
  assert.deepStrictEqual(tokens.get("youtube"), null);
  assert.deepStrictEqual(secureStore.readJson(TOKEN_FILE, {}), {});
});

test("JSON korup tidak membuat crash", () => {
  fs.writeFileSync(TOKEN_FILE, "{ not json", "utf8");
  assert.deepStrictEqual(tokens.get("youtube"), null);
});

test("client secret OAuth round-trip lewat secure store", () => {
  credentials.setMany({ TIKTOK_CLIENT_SECRET: "client-secret-value", TIKTOK_CLIENT_KEY: "client-key" });
  assert.strictEqual(credentials.get("TIKTOK_CLIENT_SECRET"), "client-secret-value");
  assert.strictEqual(credentials.get("TIKTOK_CLIENT_KEY"), "client-key");
  assert.ok(fs.existsSync(CREDS_FILE), "file kredensial harus dibuat");
});

test("status penyimpanan tidak membocorkan token", () => {
  const info = tokens.storageInfo();
  assert.strictEqual(typeof info.available, "boolean");
  assert.ok(["electron-safeStorage", "plaintext"].includes(info.backend), `backend: ${info.backend}`);
  const serialized = JSON.stringify(info);
  assert.ok(!serialized.includes("secret-abc"), "info tidak boleh memuat token");
});

test("kunci asing diabaikan saat setMany", () => {
  credentials.setMany({ EVIL_KEY: "x" });
  assert.strictEqual(credentials.get("EVIL_KEY"), "");
});

const failed = results.filter((r) => !r.ok).length;
console.log(`\nSecure store test done: ${results.length - failed}/${results.length} PASS`);
if (failed) process.exit(1);
