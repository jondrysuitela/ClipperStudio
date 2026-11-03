// ============================================================================
// ClipMe AI — Task Router + Multi-AI Consensus (#7, #8, #9, #10, #21, #24, #25, #28)
//
// Task Router:
//   Memetakan tugas AI (HOOK_ANALYSIS, TITLE_GENERATION, ...) ke kandidat
//   provider berdasarkan capabilities + strategy (FAST/BALANCED/DEEP/MAXIMUM
//   atau LOCAL_ONLY/LOW_COST/BALANCED/QUALITY_FIRST/MAXIMUM).
//
// Multi-AI Consensus (#8):
//   Bukan sekadar "panggil semua, ambil pertama". Untuk skor numerik dilakukan
//   agregasi terbobot (median/weighted). Untuk label/teks kualitatif dilakukan
//   voting + pemilihan voting terkuat.
//
// Weighted (#9): tiap provider punya weight (default 1). priority menentukan
//   urutan, bukan "objektif lebih baik" yang diciptakan.
//
// Fallback (#21): bila semua cloud gagal => Local Provider => tetap berfungsi.
// Cache (#24): key meliputi task, transcriptHash, model, promptVersion.
// Versioning (#25): tiap task punya PROMPT_VERSION; perubahan prompt meng-invalidate.
// ============================================================================
const crypto = require("crypto");
const manager = require("./manager");

// Task ke capabilities yang dibutuhkan. Prompt version untuk cache invalidation.
const TASK_DEFS = {
  HOOK_ANALYSIS: { caps: ["textGeneration", "reasoning"], promptVersion: "HOOK_ANALYSIS_V1" },
  HOOK_SCORING: { caps: ["textGeneration", "structuredOutput"], promptVersion: "HOOK_SCORING_V1" },
  TRANSCRIPT_ANALYSIS: { caps: ["textGeneration", "longContext"], promptVersion: "TRANSCRIPT_ANALYSIS_V1" },
  TEXT_ANALYSIS: { caps: ["textGeneration", "structuredOutput"], promptVersion: "TEXT_ANALYSIS_V1" },
  TITLE_GENERATION: { caps: ["textGeneration"], promptVersion: "TITLE_GENERATION_V1" },
  DESCRIPTION_GENERATION: { caps: ["textGeneration", "longContext"], promptVersion: "DESCRIPTION_GENERATION_V1" },
  HASHTAG_GENERATION: { caps: ["textGeneration"], promptVersion: "HASHTAG_GENERATION_V1" },
  CAPTION_GENERATION: { caps: ["textGeneration", "structuredOutput"], promptVersion: "CAPTION_GENERATION_V1" },
  CAPTION_REWRITE: { caps: ["textGeneration"], promptVersion: "CAPTION_REWRITE_V1" },
  CAPTION_QA: { caps: ["textGeneration", "structuredOutput", "reasoning"], promptVersion: "CAPTION_QA_V1" },
  CTA_GENERATION: { caps: ["textGeneration"], promptVersion: "CTA_GENERATION_V1" },
  CLIP_RANKING: { caps: ["textGeneration", "structuredOutput"], promptVersion: "CLIP_RANKING_V1" },
  VIRALITY_ANALYSIS: { caps: ["textGeneration", "reasoning"], promptVersion: "VIRALITY_ANALYSIS_V1" },
  CONTENT_STRATEGY: { caps: ["textGeneration", "reasoning", "longContext"], promptVersion: "CONTENT_STRATEGY_V1" }
};

// Strategy -> berapa provider dipakai (untuk consensus), plus cost intent.
// Mendukung nama mode biaya (#22) DAN profile tugas (#10):
//   FAST=1, BALANCED=2, DEEP=2-3, MAXIMUM=semua enabled.
const STRATEGY_PROVIDER_COUNT = {
  "local-only": { max: 1, useLocalOnly: true },
  "low-cost": { max: 1, useLocalOnly: false },
  fast: { max: 1, useLocalOnly: false },
  balanced: { max: 2, useLocalOnly: false },
  "quality-first": { max: 2, useLocalOnly: false },
  deep: { max: 3, useLocalOnly: false },
  maximum: { max: 0, useLocalOnly: false }, // 0 = semua enabled
  MAXIMUM: { max: 0, useLocalOnly: false }
};

// Normalisasi nama profil/strategi (#10, #22) agar alias lintas penamaan tetap
// dipetakan ke konfigurasi provider yang konsisten.
function normalizeStrategy(str) {
  const s = String(str || "").toLowerCase();
  switch (s) {
    case "fast": return "fast";
    case "low-cost": return "low-cost";
    case "balanced": return "balanced";
    case "quality-first": return "quality-first";
    case "deep": return "deep";
    case "maximum": return "maximum";
    case "local-only": return "local-only";
    default: return "balanced";
  }
}

// Cache sederhana (in-memory) keyed lengkap. Bounded.
const cache = new Map();
const CACHE_SIZE = 200;

function taskPromptVersion(task) {
  return (TASK_DEFS[task] && TASK_DEFS[task].promptVersion) || `${task}_V1`;
}

// Hash sumber untuk key cache.
function hashInput(input) {
  return crypto.createHash("sha1").update(typeof input === "string" ? input : JSON.stringify(input || {})).digest("hex").slice(0, 16);
}

// Bounded cache.
function cacheGet(key) { const v = cache.get(key); return v ? v : null; }
function cacheSet(key, value) {
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}

// --- Consensus: numeric scores (#8, #9) ---
// Gunakan median bila >=3 nilai untuk ketahanan outlier; weighted average bila
// tersedia weight; fallback mean. Deterministic.
function aggregateScore(samples, weights) {
  if (!samples.length) return null;
  const vals = samples.map((s, i) => ({ v: s, w: (weights && weights[i]) || 1 }));
  if (vals.length >= 3) {
    const sorted = vals.map((x) => x.v).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return Math.round(median * 10) / 10;
  }
  const wsum = vals.reduce((a, x) => a + x.w, 0) || 1;
  const weighted = vals.reduce((a, x) => a + x.v * x.w, 0) / wsum;
  return Math.round(weighted * 10) / 10;
}

// --- Consensus: label/teks kualitatif (#8) ---
// Voting terbobot. return label pemenang + confidence (0..1) + votes.
function aggregateLabel(votes) {
  const counts = {};
  let totalW = 0;
  for (const v of votes) {
    const label = String(v.value || "UNKNOWN");
    const w = Number(v.weight) || 1;
    counts[label] = (counts[label] || 0) + w;
    totalW += w;
  }
  let best = null; let bestW = 0;
  for (const [label, w] of Object.entries(counts)) {
    if (w > bestW) { bestW = w; best = label; }
  }
  const support = bestW / (totalW || 1);
  return {
    value: best,
    confidence: Math.round(Math.min(1, support) * 100) / 100,
    support: Math.round(support * 100) / 100,
    votes: Object.keys(counts).map((label) => ({ label, weightedVotes: counts[label] }))
  };
}

// Override provider source (dipakai test untuk injeksi mock provider).
let _providerSource = null;
function _setProviderSourceForTest(fn) {
  _providerSource = fn || null;
}

// Pilih provider yang memenuhi capabilities untuk sebuah task.
function selectProvidersForTask(task, strategy) {
  const def = TASK_DEFS[task];
  const needCaps = def ? def.caps : ["textGeneration"];
  const norm = normalizeStrategy(strategy);
  const strat = STRATEGY_PROVIDER_COUNT[norm] || STRATEGY_PROVIDER_COUNT.balanced;
  const max = strat.max;

  let all;
  if (_providerSource) all = _providerSource();
  else all = manager.enabledProviders();
  let usable = all.filter((p) => p.id !== "local" && needCaps.every((c) => p.has(c)));
  // Local selalu kandidat terakhir sebagai fallback.
  const local = all.find((p) => p.id === "local");

  if (strat.useLocalOnly) {
    return local ? [local] : [];
  }
  // Prioritaskan provider berdasarkan priority yang dikonfigurasi.
  usable.sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0));
  const selected = max > 0 ? usable.slice(0, max) : usable.slice();
  if (local && selected.length < Math.max(1, max)) selected.push(local);
  return selected;
}

// Ekstrak nilai skor dari data raw per-provider (beragam schema).
function extractScoreField(data, keys) {
  for (const k of keys) {
    const v = data && data[k];
    const n = Number(v);
    if (typeof v === "number" && Number.isFinite(n)) return n;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

/**
 * Jalankan task AI lintas provider + consensus (#27, #28).
 * @param {string} task  - salah satu key TASK_DEFS
 * @param {object} opts  - { system, user, language, strategy?, skipCache?, extract?: {scoreKeys, labelKey}, onProgress? }
 * @returns {Promise<object>} { ok, task, strategy, providers, consensus, cacheHit, fallback, sourceFidelity, ... }
 */
async function runTask(task, opts = {}) {
  // Per-task profile (#10, #22): override per-task bila diatur, else strategi global.
  const strategy = opts.strategy || (manager.getStrategyForTask && manager.getStrategyForTask(task)) || manager.getAiStrategy();
  const providers = selectProvidersForTask(task, strategy);
  if (!providers.length) {
    return { ok: false, task, strategy, providers: [], error: "No AI provider available" };
  }

  const userText = typeof opts.user === "string" ? opts.user : JSON.stringify(opts.user || {});
  const lang = opts.language || "id";
  const sourcesHash = hashInput(userText);
  const modelHash = providers.map((p) => `${p.id}:${p.defaultModel || p.model || ""}`).join("|");
  const version = taskPromptVersion(task);
  const cacheKey = `${task}|${sourcesHash}|${modelHash}|${version}|${strategy}`;

  if (!opts.skipCache) {
    const cached = cacheGet(cacheKey);
    if (cached) return { ...cached, cacheHit: true };
  }

  // --- Jalankan provider (paralel, #28) ---
  const results = await Promise.all(
    providers.map(async (p, idx) => {
      if (typeof opts.onProgress === "function") opts.onProgress(idx + 1, providers.length, p.id, "running");
      try {
        // Re-resolve fresh karena ops mungkin membawa overriding (mis. model).
        const r = await p.analyze(task, {
          system: opts.system,
          user: { text: userText, language: lang, task, options: opts.options || {} },
          options: { ...(opts.options || {}), language: lang }
        });
        if (r && r.ok && r.data) {
          manager.recordUsage(p.id, r.usage);
          if (typeof opts.onProgress === "function") opts.onProgress(idx + 1, providers.length, p.id, "done");
          return { provider: p.id, model: r.model, data: r.data, weight: p.weight, ok: true, stub: !!r.stub };
        }
        manager.recordUsage(p.id, null);
        if (typeof opts.onProgress === "function") opts.onProgress(idx + 1, providers.length, p.id, "failed");
        return { provider: p.id, ok: false, error: "empty result" };
      } catch (e) {
        manager.recordUsage(p.id, null);
        if (typeof opts.onProgress === "function") opts.onProgress(idx + 1, providers.length, p.id, "failed");
        return { provider: p.id, ok: false, error: (e && e.message) || String(e), code: e && e.code };
      }
    })
  );

  const successful = results.filter((r) => r.ok);
  const failures = results.filter((r) => !r.ok);

  // --- Fallback: bila tak ada sukses, gunakan local bila tersedia (#21) ---
  let fallback = false;
  if (!successful.length) {
    let localProv = providers.find((p) => p.id === "local");
    if (!localProv) {
      // Local bukan bagian dari list terpilih — ambil dari sumber provider penuh.
      const source = _providerSource ? _providerSource() : manager.enabledProviders();
      localProv = (source || []).find((p) => p.id === "local");
    }
    if (localProv) {
      const r = await localProv.analyze(task, {
        system: opts.system,
        user: { text: userText, language: lang, task, options: opts.options || {} },
        options: { ...(opts.options || {}), language: lang }
      }).catch(() => ({ ok: false }));
      if (r && r.ok) {
        successful.push({ provider: "local", model: "clipme-heuristic", data: r.data, weight: 1, ok: true, stub: !!r.stub });
        fallback = true;
      }
    }
  }

  if (!successful.length) {
    return { ok: false, task, strategy, providers: providers.map((p) => p.id), results: [], errors: failures.map((f) => f.error), error: "All AI providers failed" };
  }

  // --- Consensus ---
  const extract = opts.extract || {};
  const scoreKeys = extract.scoreKeys || [];
  const scores = [];
  const weights = [];
  for (const r of successful) {
    const sc = extractScoreField(r.data, [task.toLowerCase() + "Score", ...scoreKeys]);
    if (sc != null) { scores.push(Math.max(0, Math.min(100, sc))); weights.push(r.weight || 1); }
  }
  let consensusScore = scores.length ? aggregateScore(scores, weights) : null;

  const labelKey = extract.labelKey || "hookType";
  const labelVotes = successful.map((r) => {
    const raw = r.data && r.data[labelKey];
    const val = raw != null && String(raw).trim() !== "" ? String(raw) : null;
    return { value: val, weight: r.weight || 1 };
  }).filter((v) => v.value != null);
  const labelConsensus = labelVotes.length ? aggregateLabel(labelVotes) : null;

  // Confidence keseluruhan: proporsi penyedia yang benar-benar menganalisis +
  // tingkat kesepakatan skor. Provider berstatus stub (fallback deterministik
  // tanpa analisis) tidak boleh menaikkan confidence.
  const realSuccess = successful.filter((r) => !r.stub);
  const providerConf = realSuccess.length / Math.max(1, providers.length);
  let agreement = 1;
  if (consensusScore != null && scores.length > 1) agreement = 1 - consensusSpread(scores);
  const confidence = realSuccess.length
    ? Math.min(1, Math.max(0, Math.round((0.6 * providerConf + 0.4 * agreement) * 100) / 100))
    : 0;

  const result = {
    ok: true,
    task,
    strategy,
    providers: successful.map((r) => r.provider),
    providerVotes: successful.map((r) => ({ provider: r.provider, model: r.model, weight: r.weight || 1 })),
    consensus: {
      score: consensusScore,
      label: labelConsensus ? labelConsensus.value : null,
      confidence,
      reasoningSummary: summarizeConsensus(successful, labelConsensus, consensusScore),
      votes: labelConsensus ? labelConsensus.votes : null,
      providerSupport: Math.round(providerConf * 100) / 100
    },
    fallback,
    cacheHit: false,
    sourceFidelity: realSuccess.length ? (opts.creative ? "MEDIUM" : "HIGH") : "STUB",
    promptVersion: version,
    raw: successful.map((r) => ({ provider: r.provider, data: r.data })),
    failedProviders: failures.map((f) => f.provider)
  };

  if (!opts.skipCache) cacheSet(cacheKey, result);
  return result;
}

function consensusSpread(scores) {
  // normalized range (0..1); 0 = perfect agreement.
  const min = Math.min(...scores), max = Math.max(...scores);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return avg ? (max - min) / avg : 1;
}

function summarizeConsensus(successful, labelConsensus, score) {
  const parts = [];
  if (labelConsensus && labelConsensus.value) parts.push(`Consensus label: ${labelConsensus.value}`);
  if (score != null) parts.push(`Consensus score: ${score}`);
  parts.push(`${successful.length} provider${successful.length > 1 ? "s" : ""} analyzed`);
  return parts.join(" · ");
}

// Resolve skor/label "final" dari hasil runTask dalam bentuk struktur konten.
function toContentHints(taskResult) {
  const c = taskResult.consensus || {};
  const best = taskResult.raw && taskResult.raw[0] && taskResult.raw[0].data;
  return {
    score: c.score,
    label: c.label,
    confidence: c.confidence,
    reasoningSummary: c.reasoningSummary,
    providerVotes: taskResult.providerVotes,
    ...(best || {})
  };
}

module.exports = {
  TASK_DEFS,
  taskPromptVersion,
  hashInput,
  runTask,
  aggregateScore,
  aggregateLabel,
  toContentHints,
  _setProviderSourceForTest,
  _providerSource,
  _cache: {
    get: cacheGet,
    set: cacheSet
  }
};
