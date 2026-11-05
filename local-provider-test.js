// Regression: provider lokal tidak boleh membaca seluruh payload sebagai teks.
const assert = require("assert");
const { LocalProvider } = require("./ai/providers/local.js");

const results = [];
async function test(name, fn) {
  try { await fn(); results.push(true); console.log(`[OK  ] ${name}`); }
  catch (e) { results.push(false); console.error(`[FAIL] ${name}\n  -> ${e.message}`); process.exitCode = 1; }
}

const text = "Pada 2019 saya membuka tiga cabang baru. Padahal itu kesalahan besar yang bikin rugi.";

(async () => {
  await test("analyze memakai user.text, bukan JSON payload", async () => {
    const p = new LocalProvider();
    const r = await p.analyze("HOOK_ANALYSIS", {
      user: { text, language: "id", task: "HOOK_ANALYSIS", options: {} },
      options: { language: "id" }
    });
    assert.ok(r.ok, "harus ok");
    const serialized = JSON.stringify(r.data);
    assert.ok(!serialized.includes('"task"'), "payload JSON tidak boleh bocor");
    assert.ok(!serialized.includes("HOOK_ANALYSIS"), "nama task tidak boleh jadi hook");
    assert.match(serialized, /2019|cabang|kesalahan/i, "isi nyata harus terbaca");
  });

  await test("string user tetap didukung", async () => {
    const p = new LocalProvider();
    const r = await p.analyze("HOOK_ANALYSIS", { user: text, options: { language: "id" } });
    assert.ok(r.ok);
    assert.match(JSON.stringify(r.data), /cabang|kesalahan/i);
  });

  const failed = results.filter((ok) => !ok).length;
  console.log(`\nLocal provider payload test: ${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
})();
