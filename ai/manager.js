// ============================================================================
// ClipMe AI — Provider Manager (#2, #3, #30, #31)
//
// Manajer terpusat untuk SEMUA AI provider yang terhubung. Provider-agnostic:
// tidak meng-hardcode satu provider. Menangani:
//   - registri provider (Local + OpenAI-compatible external)
//   - resolve kredensial (ai/config) -> adapter
//   - enable/disable, priority, weight
//   - health monitor (#30) — status nyata dari healthCheck, bukan klaim
//   - test connection, connect/disconnect, list models
//   - per-provider fallback / selection
// ============================================================================
const config = require("./config");
const usage = require("./usage");
const { LocalProvider } = require("./providers/local");
const { OpenAICompatibleProvider } = require("./providers/openai-compatible");

// Provider yang didukung (map by id) — metadata dari ai/config.
const { PROVIDER_DEFS } = config;

// State runtime (bukan persist secret): enable / priority / weight / health.
let runtimeState = loadRuntimeState();

const HEALTH_TTL = 30000; // re-check health tiap 30s
const healthCache = new Map(); // id -> {at, state}

function loadRuntimeState() {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");
  try {
    const f = path.join(process.env.CLIPPER_DATA_DIR || path.join(os.homedir(), ".clipper-studio"), "ai-runtime.json");
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")) || {};
  } catch {}
  return {};
}

function saveRuntimeState() {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");
  try {
    const dir = process.env.CLIPPER_DATA_DIR || path.join(os.homedir(), ".clipper-studio");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "ai-runtime.json"), JSON.stringify(runtimeState, null, 2), { mode: 0o600 });
  } catch {}
}

// Bangun instance adapter untuk sebuah provider id (dengan kredensial).
function buildProvider(def) {
  if (def.id === "local") {
    const st = runtimeState.providers && runtimeState.providers.local;
    return new LocalProvider({ priority: st && st.priority, weight: st && st.weight });
  }
  const rc = config.resolveConfig(def.id);
  if (!rc) return null;
  const st = runtimeState.providers && runtimeState.providers[def.id];
  return new OpenAICompatibleProvider({
    id: def.id,
    name: def.name,
    models: def.models,
    capabilities: def.capabilities,
    baseUrl: rc.baseUrl,
    apiKey: rc.apiKey,
    model: rc.model,
    enabled: st ? st.enabled !== false : true,
    priority: st && st.priority,
    weight: st && st.weight,
    timeout: (st && st.timeout) || undefined
  });
}

// Daftar provider aktif (enabled) yang TERSEDIA untuk eksekusi.
// Local AI SELALU tersedia sebagai fondasi (#21) — tidak perlu konfigurasi.
function enabledProviders() {
  const local = buildProvider({ id: "local" });
  const out = [local];
  for (const def of PROVIDER_DEFS) {
    const st = runtimeState.providers && runtimeState.providers[def.id];
    if (st && st.enabled === false) continue;
    if (!config.isConfigured(def.id)) continue; // hanya yang punya key
    const p = buildProvider(def);
    if (p) out.push(p);
  }
  // Urutkan berdasarkan priority (lebih kecil = lebih dulu).
  out.sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0));
  return out;
}

// Semua provider yang diketahui (untuk UI), termasuk yang belum dikonfigurasi.
// Local AI selalu tampil pertama sebagai provider bawaan.
function allProvidersForUI() {
  const localUI = {
    id: "local",
    name: "Local AI",
    kind: "local",
    capabilities: ["textGeneration", "structuredOutput", "longContext", "reasoning", "fastInference", "local"],
    models: ["clipme-heuristic"],
    model: "clipme-heuristic",
    configured: true,
    enabled: true,
    priority: Number((runtimeState.providers && runtimeState.providers.local && runtimeState.providers.local.priority) || 99),
    weight: Number((runtimeState.providers && runtimeState.providers.local && runtimeState.providers.local.weight) || 1),
    builtIn: true
  };
  return [localUI, ...PROVIDER_DEFS.map((def) => {
    const st = runtimeState.providers && runtimeState.providers[def.id];
    const rc = def.id === "local" ? { model: "clipme-heuristic", models: ["clipme-heuristic"] } : config.resolveConfig(def.id);
    return {
      id: def.id,
      name: def.name,
      kind: def.kind,
      capabilities: def.capabilities,
      models: (rc && rc.models) || def.models || [],
      model: (rc && rc.model) || "",
      configured: config.isConfigured(def.id),
      enabled: def.id === "local" ? true : (st ? st.enabled !== false : false),
      priority: (st && st.priority) || (def.id === "local" ? 99 : 0),
      weight: (st && st.weight) || 1,
      fromEnv: def.keys ? def.keys.some((k) => Boolean(process.env[k.env])) : false
    };
  })];
}

async function health(id) {
  if (id === "local") {
    const cached = healthCache.get("local");
    if (cached && Date.now() - cached.at < HEALTH_TTL) return cached.state;
    const local = buildProvider({ id: "local" });
    const r = await local.healthCheck().catch((e) => ({ ok: false, state: "ERROR", message: e.message, provider: "local" }));
    healthCache.set("local", { at: Date.now(), state: r });
    return r;
  }
  const def = config.providerDef(id);
  if (!def) return { ok: false, state: "ERROR", message: "Unknown provider" };
  const cached = healthCache.get(id);
  if (cached && Date.now() - cached.at < HEALTH_TTL) return cached.state;
  const p = buildProvider(def);
  if (!p) {
    const state = { ok: false, state: "OFFLINE", message: "Not configured", provider: id };
    healthCache.set(id, { at: Date.now(), state });
    return state;
  }
  if (def.id === "local") {
    const r = await p.healthCheck().catch((e) => ({ ok: false, state: "ERROR", message: e.message }));
    healthCache.set(id, { at: Date.now(), state: r });
    return r;
  }
  if (!config.isConfigured(id)) {
    const state = { ok: false, state: "NOT_CONFIGURED", message: "API key missing", provider: id };
    healthCache.set(id, { at: Date.now(), state });
    return state;
  }
  const r = await p.healthCheck().catch((e) => ({ ok: false, state: "ERROR", message: e.message, provider: id }));
  healthCache.set(id, { at: Date.now(), state: r });
  return r;
}

async function listModels(id) {
  if (id === "local") {
    return { models: ["clipme-heuristic"], source: "built-in" };
  }
  const def = config.providerDef(id);
  if (!def) return { error: "Unknown provider" };
  const p = buildProvider(def);
  if (!p) return { error: "Not configured" };
  return p.listModels().catch((e) => ({ error: e.message || String(e) }));
}

function setSettings(id, patch) {
  const st = runtimeState.providers || (runtimeState.providers = {});
  st[id] = st[id] || {};
  if (patch.enabled != null) st[id].enabled = !!patch.enabled;
  if (patch.priority != null) st[id].priority = Number(patch.priority) || 0;
  if (patch.weight != null) st[id].weight = Number(patch.weight) || 1;
  if (patch.timeout != null) st[id].timeout = Number(patch.timeout) || 0;
  saveRuntimeState();
}

async function test(id) {
  const r = await health(id);
  return { id, ...r };
}

// Mode / strategy global (#22): local-only | low-cost | balanced | quality-first | maximum
function getAiStrategy() {
  return runtimeState.strategy || "balanced";
}
function setAiStrategy(strategy) {
  runtimeState.strategy = String(strategy || "balanced");
  saveRuntimeState();
}
function getAiProfiles() {
  return runtimeState.profiles || {};
}
function setAiProfile(task, profile) {
  runtimeState.profiles = runtimeState.profiles || {};
  runtimeState.profiles[task] = String(profile || "balanced");
  saveRuntimeState();
}
// Per-task strategy (#10, #22): override per-task bila diatur, else global.
function getStrategyForTask(task) {
  const profiles = runtimeState.profiles || {};
  if (profiles[task]) return profiles[task];
  return runtimeState.strategy || "balanced";
}

module.exports = {
  PROVIDER_DEFS,
  buildProvider,
  enabledProviders,
  allProvidersForUI,
  health,
  listModels,
  setSettings,
  test,
  isConfigured: config.isConfigured,
  saveConfig: config.setKeys,
  setModel: config.setModel,
  getAiStrategy,
  setAiStrategy,
  getAiProfiles,
  setAiProfile,
  getStrategyForTask,
  usageSnapshot: usage.snapshot,
  recordUsage: usage.record
};
