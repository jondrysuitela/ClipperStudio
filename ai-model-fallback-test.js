// Regression: json keyword + fallback model + discovery.
const assert = require("assert");
const { OpenAICompatibleProvider } = require("./ai/providers/openai-compatible.js");

const results = [];
async function test(name, fn) {
  try { await fn(); results.push(true); console.log(`[OK  ] ${name}`); }
  catch (e) { results.push(false); console.error(`[FAIL] ${name}\n  -> ${e.message}`); process.exitCode = 1; }
}

function make() {
  return new OpenAICompatibleProvider({
    id: "groq",
    baseUrl: "https://api.example/v1",
    apiKey: "k",
    models: ["model-a", "model-b"],
    model: "model-a"
  });
}

/** fetch palsu: model yang "hilang" membalas 404 model_not_found. */
function stubFetch({ missing = [], available = [], reply = "{\"ok\":true}" } = {}) {
  const calls = { chat: [], models: 0 };
  const real = global.fetch;
  global.fetch = async (url, init) => {
    if (String(url).endsWith("/models")) {
      calls.models += 1;
      return {
        status: 200,
        ok: true,
        json: async () => ({ data: (available.length ? available : ["fresh-model"]).map((id) => ({ id })) })
      };
    }
    const body = JSON.parse(init.body);
    calls.chat.push(body);
    if (missing.includes(body.model)) {
      return {
        status: 404,
        ok: false,
        text: async () => `{"error":{"message":"The model \`${body.model}\` does not exist"}}`
      };
    }
    return {
      status: 200,
      ok: true,
      json: async () => ({ choices: [{ message: { content: reply } }], usage: {} })
    };
  };
  return { calls, restore: () => { global.fetch = real; } };
}

(async () => {
  await test("response_format json: prompt tanpa kata json tetap ditambah instruksi", async () => {
    const p = make();
    const stub = stubFetch();
    try {
      await p.analyze("captionCleanup", { system: "", user: { text: "bersihkan teks ini" }, options: {} });
      const body = stub.calls.chat[0];
      const all = body.messages.map((m) => m.content).join(" ").toLowerCase();
      assert.ok(all.includes("json"), "harus ada kata json di messages");
      assert.deepStrictEqual(body.response_format, { type: "json_object" });
    } finally { stub.restore(); }
  });

  await test("prompt sudah menyebut json tidak diduplikasi", async () => {
    const p = make();
    const stub = stubFetch();
    try {
      await p.analyze("x", { system: "Balas JSON valid.", user: { text: "halo" }, options: {} });
      const sys = stub.calls.chat[0].messages.filter((m) => m.role === "system");
      assert.strictEqual(sys.length, 1, `dapat ${sys.length} system message`);
    } finally { stub.restore(); }
  });

  await test("model pertama hilang -> pindah ke model kedua", async () => {
    const p = make();
    const stub = stubFetch({ missing: ["model-a"] });
    try {
      const r = await p.analyze("x", { system: "json", user: { text: "halo" }, options: {} });
      assert.strictEqual(r.model, "model-b", `dipakai ${r.model}`);
      assert.strictEqual(stub.calls.chat.length, 2);
    } finally { stub.restore(); }
  });

  await test("semua model statis hilang -> discovery /models dipakai", async () => {
    const p = make();
    const stub = stubFetch({ missing: ["model-a", "model-b"], available: ["fresh-model"] });
    try {
      const r = await p.analyze("x", { system: "json", user: { text: "halo" }, options: {} });
      assert.strictEqual(r.model, "fresh-model", `dipakai ${r.model}`);
      assert.ok(stub.calls.models >= 1, "harus memanggil /models");
    } finally { stub.restore(); }
  });

  await test("error non-model tidak diulang (tidak membuang kuota)", async () => {
    const p = make();
    const real = global.fetch;
    let calls = 0;
    global.fetch = async (url, init) => {
      calls += 1;
      return { status: 401, ok: false, text: async () => "unauthorized" };
    };
    try {
      await assert.rejects(() => p.analyze("x", { system: "json", user: { text: "halo" }, options: {} }));
      assert.strictEqual(calls, 1, `dipanggil ${calls} kali`);
    } finally { global.fetch = real; }
  });

  const failed = results.filter((ok) => !ok).length;
  console.log(`\nAI model fallback test: ${results.length - failed}/${results.length} PASS`);
  if (failed) process.exit(1);
})();
