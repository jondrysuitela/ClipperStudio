// Regression: content provider harus string (bug "missing field content").
const assert = require("assert");
const { OpenAICompatibleProvider } = require("./ai/providers/openai-compatible.js");

const results = [];
async function test(name, fn) {
  try { await fn(); results.push(true); console.log(`[OK  ] ${name}`); }
  catch (e) { results.push(false); console.error(`[FAIL] ${name}\n  -> ${e.message}`); process.exitCode = 1; }
}

function provider() {
  return new OpenAICompatibleProvider({
    id: "openrouter",
    baseUrl: "https://example.invalid/v1",
    apiKey: "k",
    model: "m"
  });
}

/** Tangkap body request tanpa jaringan. */
async function capture(payload) {
  const p = provider();
  let captured = null;
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    captured = JSON.parse(init.body);
    return { status: 200, ok: true, json: async () => ({ choices: [{ message: { content: "{\"ok\":true}" } }] }) };
  };
  try {
    await p.analyze("captionCleanup", payload);
  } finally {
    global.fetch = realFetch;
  }
  return captured;
}

(async () => {
  await test("objek user diratakan jadi string", () => {
    const p = provider();
    const text = p._contentOf({ text: "halo dunia", language: "id", task: "captionCleanup" });
    assert.strictEqual(typeof text, "string");
    assert.match(text, /halo dunia/);
    assert.match(text, /Language: id/);
  });

  await test("string user diteruskan apa adanya", () => {
    assert.strictEqual(provider()._contentOf("tes"), "tes");
  });

  await test("user kosong -> error EMPTY, bukan request invalid", () => {
    const p = provider();
    assert.strictEqual(p._contentOf({}), "{}");
    assert.strictEqual(p._contentOf(null), "");
  });

  await test("request nyata: content string dan bukan objek", async () => {
    const body = await capture({
      system: "Balas JSON.",
      user: { text: "bersihkan caption ini", language: "id", task: "captionCleanup" },
      options: {}
    });
    assert.ok(body, "request tidak terkirim");
    const msg = body.messages[body.messages.length - 1];
    assert.strictEqual(msg.role, "user");
    assert.strictEqual(typeof msg.content, "string", "content harus string");
    assert.match(msg.content, /bersihkan caption ini/);
    assert.ok(body.max_tokens > 0 && body.max_tokens <= 4096, `max_tokens=${body.max_tokens}`);
    assert.deepStrictEqual(body.response_format, { type: "json_object" });
  });

  await test("system kosong tidak mengirim pesan system invalid", async () => {
    const body = await capture({ system: "", user: { text: "x" }, options: {} });
    assert.ok(body.messages.every((m) => typeof m.content === "string" && m.content.length));
  });

  const failed = results.filter((ok) => !ok).length;
  console.log(`\nAI message test: ${results.length - failed}/${results.length} PASS`);
  if (failed) process.exit(1);
})();
