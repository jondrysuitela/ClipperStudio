const assert = require("assert");
const orchestrator = require("./orchestrator");
const { AIProvider } = require("./providers/base");
const { LocalProvider } = require("./providers/local");
const usage = require("./usage");

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log("FAIL:", msg); } }

// ── Batch 1: Consensus math (#8, #9) ──
// median for >=3 samples
const med = orchestrator.aggregateScore([82, 91, 87], [1, 1, 1]);
ok(med === 87, `aggregateScore median of [82,91,87] = 87 (got ${med})`);
// weighted mean for 2 samples
const wm = orchestrator.aggregateScore([60, 90], [1, 3]);
ok(wm === 82.5, `weighted mean [60(1),90(3)] = 82.5 (got ${wm})`);

// label voting
const lbl = orchestrator.aggregateLabel([
  { value: "CONFLICT", weight: 1 },
  { value: "CONFLICT", weight: 1.5 },
  { value: "CURIOSITY", weight: 0.8 }
]);
ok(lbl.value === "CONFLICT", `label consensus -> CONFLICT (got ${lbl.value})`);
ok(lbl.votes.length === 2, "label votes count 2");

// ── Mock providers ──
function mkProvider(id, opts = {}) {
  const p = new AIProvider({
    id,
    name: id,
    models: ["m-" + id],
    capabilities: ["textGeneration", "structuredOutput", "longContext", "reasoning"],
    priority: opts.priority,
    weight: opts.weight,
    enabled: opts.enabled
  });
  p.analyze = async (task, { user }) => {
    if (opts.fail) { const e = new Error(opts.fail); e.code = opts.code; throw e; }
    return {
      ok: true,
      data: {
        hookScore: opts.score,
        hookType: opts.label,
        title: opts.title || ("t-" + id)
      },
      provider: id,
      model: "m-" + id,
      usage: { promptTokens: 10, completionTokens: 5 }
    };
  };
  p.healthCheck = async () => ({ ok: !opts.fail, state: opts.fail ? "ERROR" : "READY" });
  return p;
}

const pA = mkProvider("A", { score: 82, label: "CONFLICT", weight: 1, priority: 1 });
const pB = mkProvider("B", { score: 91, label: "CONFLICT", weight: 1.5, priority: 2 });
const pC = mkProvider("C", { score: 87, label: "CURIOSITY", weight: 0.8, priority: 3 });
const local = new LocalProvider();
// local doesn't satisfy reasoning from the array perspective? it does (has reasoning)

// ── Batch 2: multi-provider consensus (#8) ──
orchestrator._setProviderSourceForTest(() => [pA, pB, pC, local]);
(async () => {
  const r = await orchestrator.runTask("HOOK_ANALYSIS", {
    system: "sys",
    user: "[0-1s] Kenapa bisnis saya tidak berkembang?\n[1-2s] Ternyata jawabannya ada di sistem.",
    language: "id",
    strategy: "maximum",
    skipCache: true,
    extract: { scoreKeys: ["hookScore"], labelKey: "hookType" }
  });
  ok(r.ok === true, "multi-provider runTask ok");
  ok(r.providers.length === 3, `3 cloud providers selected (got ${r.providers.length})`);
  ok(r.consensus.score === 87, `consensus score median [82,91,87] = 87 (got ${r.consensus.score})`);
  ok(r.consensus.label === "CONFLICT", `consensus label CONFLICT (got ${r.consensus.label})`);
  ok(r.providerVotes, "has providerVotes");

  // ── Batch 3: single provider + low-cost (#10) ──
  orchestrator._setProviderSourceForTest(() => [pA, pB, pC, local]);
  const r2 = await orchestrator.runTask("TITLE_GENERATION", {
    system: "sys", user: "some transcript", strategy: "low-cost", skipCache: true
  });
  ok(r2.ok === true, "low-cost runTask ok");
  ok(r2.providers.length === 1, "low-cost uses 1 provider (A)");

  // ── Batch 3b: FAST / DEEP profiles (#10) ──
  orchestrator._setProviderSourceForTest(() => [pA, pB, pC, local]);
  const rFast = await orchestrator.runTask("TITLE_GENERATION", { system: "s", user: "x", strategy: "fast", skipCache: true });
  ok(rFast.providers.length === 1, "FAST alias uses 1 provider");
  const rDeep = await orchestrator.runTask("TITLE_GENERATION", { system: "s", user: "y", strategy: "deep", skipCache: true });
  ok(rDeep.providers.length === 3, "DEEP alias uses 3 providers");
  const rMax = await orchestrator.runTask("TITLE_GENERATION", { system: "s", user: "z", strategy: "maximum", skipCache: true });
  ok(rMax.providers.length === 3, "MAXIMUM uses all enabled providers");

  // ── Batch 4: fallback (#21) ──
  const pFail = mkProvider("FAIL", { fail: "network down", code: "OFFLINE" });
  orchestrator._setProviderSourceForTest(() => [pFail, local]);
  const r3 = await orchestrator.runTask("HOOK_ANALYSIS", {
    system: "sys", user: "[0-1s] Teks contoh panjang untuk lokal cukup tentu saja ya.", strategy: "low-cost", skipCache: true,
    extract: { scoreKeys: ["hookScore"], labelKey: "hookType" }
  });
  ok(r3.fallback === true, "fallback to local when cloud fails");
  ok(r3.ok === true, "analysis still returns result after cloud failure");

  // ── Batch 5: cache (#24) ──
  orchestrator._setProviderSourceForTest(() => [pA, pB]);
  const key = "HOOK_ANALYSIS|abc|mock|HOOK_ANALYSIS_V1|balanced";
  const c1 = await orchestrator.runTask("HOOK_ANALYSIS", {
    system: "sys",
    user: "cache test transcript one",
    strategy: "balanced",
    extract: { scoreKeys: ["hookScore"], labelKey: "hookType" }
  });
  ok(c1.cacheHit === false, "first call cache miss");
  const c2 = await orchestrator.runTask("HOOK_ANALYSIS", {
    system: "sys",
    user: "cache test transcript one",
    strategy: "balanced",
    extract: { scoreKeys: ["hookScore"], labelKey: "hookType" }
  });
  ok(c2.cacheHit === true, "second call cache hit (same transcript)");

  // transcript change -> cache miss
  const c3 = await orchestrator.runTask("HOOK_ANALYSIS", {
    system: "sys",
    user: "A COMPLETELY DIFFERENT transcript content here",
    strategy: "balanced",
    extract: { scoreKeys: ["hookScore"], labelKey: "hookType" }
  });
  ok(c3.cacheHit === false, "different transcript -> cache miss");

  // ── Batch 6: usage tracking (#23) ──
  const snap = usage.snapshot();
  ok(typeof snap.providers === "object", "usage snapshot providers present");
  usage.record("A", { promptTokens: 5, completionTokens: 2 });
  const snap2 = usage.snapshot();
  ok(snap2.providers.A && snap2.providers.A.requests >= 1, "usage records requests");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
