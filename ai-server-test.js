process.env.CLIPPER_DATA_DIR = require("os").tmpdir() + "/ctest-" + Date.now();
process.env.PORT = "4771";
const { startServer } = require("./server.js");

(async () => {
  const srv = await startServer(4771, "127.0.0.1");
  const base = `http://127.0.0.1:4771`;
  const J = async (path, opts) => {
    const res = await fetch(base + path, opts);
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };

  let ok = 0, fail = 0;
  const t = (cond, msg) => { if (cond) ok++; else { fail++; console.log("FAIL:", msg); } };

  const prov = await J("/api/ai/providers");
  t(prov.status === 200, "GET /api/ai/providers -> 200");
  const ids = prov.data.providers.map((p) => p.id);
  t(ids.includes("local"), "local provider listed");
  t(ids.includes("openai") && ids.includes("deepseek"), "external providers listed");

  const settings = await J("/api/ai/settings");
  t(settings.status === 200, "GET /api/ai/settings -> 200");
  t(settings.data.strategy === "balanced", "default strategy balanced");

  const set = await J("/api/ai/settings", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ strategy: "quality-first" })
  });
  t(set.status === 200, "POST /api/ai/settings -> 200");
  const settings2 = await J("/api/ai/settings");
  t(settings2.data.strategy === "quality-first", "strategy persisted");

  // Trigger AI consensus using LOCAL provider (no API keys configured).
  // The provider router with "local-only" strategy uses local only.
  const analyze = await J("/api/ai/analyze", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task: "HOOK_ANALYSIS",
      strategy: "local-only",
      language: "id",
      user: "[0-1s] Kenapa bisnis saya tidak berkembang?\n[1-2s] Ternyata jawabannya ada di sistem.\n[2-3s] Banyak orang mau hasil instan padahal harus proses.",
      async: false
    })
  });
  t(analyze.status === 200, "POST /api/ai/analyze (sync) -> 200");
  t(analyze.data.ok === true, "analyze ok");
  t(analyze.data.providers.includes("local"), "local provider used");

  // ── Job queue integration (#27): async mode returns jobId, poll for result ──
  const asyncRun = await J("/api/ai/analyze", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task: "TEXT_ANALYSIS",
      strategy: "local-only",
      language: "id",
      user: "[0-1s] Teks contoh untuk job queue analysis.",
      async: true
    })
  });
  t(asyncRun.status === 202, "POST /api/ai/analyze (async) -> 202");
  t(asyncRun.data.jobId, "returns jobId");
  const jobId = asyncRun.data.jobId;
  let jobResult = null;
  for (let i = 0; i < 30; i++) {
    const j = await J("/api/jobs/" + jobId);
    if (j.data && (j.data.status === "done" || j.data.status === "failed")) { jobResult = j.data; break; }
    await new Promise((r) => setTimeout(r, 200));
  }
  t(jobResult && jobResult.status === "done", "queue job completes");
  t(jobResult && jobResult.result && jobResult.result.ok === true, "queue job returns AI result");
  t(jobResult && jobResult.result.task === "TEXT_ANALYSIS", "queue job result has task");

  const usage = await J("/api/ai/usage");
  t(usage.status === 200, "GET /api/ai/usage -> 200");
  t(usage.data.usage && usage.data.usage.providers, "usage snapshot present");

  // provider test for local (healthCheck)
  const test = await J("/api/ai/providers/local/test", { method: "POST" });
  t(test.data && (test.data.state === "READY" || test.data.ok), "local health OK");

  // provider models for openai (not configured -> static configured list is fine)
  const models = await J("/api/ai/providers/openai/models");
  t(models.status === 200, "GET models -> 200");
  t(Array.isArray(models.data.models), "models array");

  // ── Security: API key store 0600, never returned to renderer (#5, #38) ──
  const connect = await J("/api/ai/providers/openai/connect", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: "sk-SECRET-TEST-123" })
  });
  // connect makes a real health call which will fail offline, but it should
  // report configured=true and NOT echo the key back.
  t(connect.status === 200, "connect returns 200");
  t(connect.data.configured === true, "provider configured after connect");
  const rawConnect = JSON.stringify(connect.data);
  t(!rawConnect.includes("SECRET-TEST"), "connect response does not leak API key");

  const provAfter = await J("/api/ai/providers");
  const rawProv = JSON.stringify(provAfter.data);
  t(!rawProv.includes("SECRET-TEST"), "providers list does not leak API key");
  const openaiEntry = provAfter.data.providers.find((p) => p.id === "openai");
  t(openaiEntry && openaiEntry.configured === true, "providers list shows configured true");

  const usageRes2 = await J("/api/ai/usage");
  t(!JSON.stringify(usageRes2.data).includes("SECRET-TEST"), "usage response does not leak API key");

  const aiCfgFile = require("fs").readFileSync(process.env.CLIPPER_DATA_DIR + "/ai-config.json", "utf8");
  t(aiCfgFile.includes("SECRET-TEST"), "key persisted in ai-config.json (server-side)");

  // Disconnect clears it
  const disc = await J("/api/ai/providers/openai/disconnect", { method: "POST" });
  t(disc.status === 200 && disc.data.configured === false, "disconnect clears key");

  console.log(`\n${ok} passed, ${fail} failed`);
  srv.shutdown();
  setTimeout(() => process.exit(fail ? 1 : 0), 200);
})().catch((e) => { console.error(e); process.exit(1); });