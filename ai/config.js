// ============================================================================
// ClipMe AI — Secure Provider Credential Store (#5, #38)
//
// Menyimpan API key AI provider secara AMAN:
//   - Di luar repo, di ~/.clipper-studio/ai-config.json (mode 0600)
//   - Resolusi: env > user file (tidak ada fallback ke repo)
//   - Renderer TIDAK PERNAH menerima nilai key — hanya status `configured`.
//
// Mirip arsitektur social/credentials.js (Repliz-style) namun khusus AI.
// Keamanan (#38):
//   - Key tidak pernah masuk log
//   - Key tidak pernah masuk ke renderer / bundle frontend
//   - Key tidak pernah masuk Git
// ============================================================================
const fs = require("fs");
const os = require("os");
const path = require("path");

const DATA_DIR = process.env.CLIPPER_DATA_DIR || path.join(os.homedir(), ".clipper-studio");
const USER_FILE = path.join(DATA_DIR, "ai-config.json");

// Definisi provider yang diketahui (bukan SDK hardcoded — hanya metadata).
// `envKey` adalah nama env untuk fallback. `secret` menandai field sensitif.
const PROVIDER_DEFS = [
  {
    id: "openai",
    name: "OpenAI",
    kind: "openai-compatible",
    defaultBaseUrl: "https://api.openai.com/v1",
    capabilities: ["textGeneration", "structuredOutput", "vision", "longContext", "fastInference"],
    keys: [
      { key: "CLIPFORGE_AI_API_KEY", env: "CLIPFORGE_AI_API_KEY", label: "API Key", secret: true, required: true },
      { key: "CLIPFORGE_AI_BASE_URL", env: "CLIPFORGE_AI_BASE_URL", label: "Base URL (optional)", secret: false, required: false }
    ],
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"]
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    kind: "openai-compatible",
    defaultBaseUrl: "https://api.deepseek.com",
    capabilities: ["textGeneration", "structuredOutput", "longContext", "reasoning", "fastInference"],
    keys: [
      { key: "AI_DEEPSEEK_API_KEY", env: "AI_DEEPSEEK_API_KEY", label: "API Key", secret: true, required: true },
      { key: "AI_DEEPSEEK_BASE_URL", env: "AI_DEEPSEEK_BASE_URL", label: "Base URL (optional)", secret: false, required: false }
    ],
    models: ["deepseek-chat", "deepseek-reasoner"]
  },
  {
    id: "groq",
    name: "Groq",
    kind: "openai-compatible",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    capabilities: ["textGeneration", "structuredOutput", "longContext", "fastInference"],
    keys: [
      { key: "AI_GROQ_API_KEY", env: "AI_GROQ_API_KEY", label: "API Key", secret: true, required: true },
      { key: "AI_GROQ_BASE_URL", env: "AI_GROQ_BASE_URL", label: "Base URL (optional)", secret: false, required: false }
    ],
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    kind: "openai-compatible",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    capabilities: ["textGeneration", "structuredOutput", "vision", "longContext", "reasoning", "fastInference"],
    keys: [
      { key: "AI_OPENROUTER_API_KEY", env: "AI_OPENROUTER_API_KEY", label: "API Key", secret: true, required: true },
      { key: "AI_OPENROUTER_BASE_URL", env: "AI_OPENROUTER_BASE_URL", label: "Base URL (optional)", secret: false, required: false }
    ],
    models: ["openai/gpt-4o-mini", "anthropic/claude-3.5-haiku", "deepseek/deepseek-chat"]
  }
];

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")) || {}; } catch { return {}; }
}

function providerDef(id) {
  return PROVIDER_DEFS.find((p) => p.id === id) || null;
}

// Value resolusi per key: env dulu, lalu user file. Tidak ada fallback repo.
function getKey(providerId, keyName) {
  const def = providerDef(providerId);
  if (!def) return "";
  const k = def.keys.find((x) => x.key === keyName);
  if (!k) return "";
  if (process.env[k.env]) return process.env[k.env];
  const cfg = readJson(USER_FILE);
  const stored = cfg[providerId] && cfg[providerId][keyName];
  return typeof stored === "string" ? stored : "";
}

// Apakah provider punya key yang dibutuhkan (semua required key terisi).
function isConfigured(providerId) {
  const def = providerDef(providerId);
  if (!def) return false;
  return def.keys.every((k) => !k.required || Boolean(getKey(providerId, k.key)));
}

// Simpan satu kumpulan key untuk provider (filter allowlist, mode 0600).
function setKeys(providerId, partial) {
  const def = providerDef(providerId);
  if (!def) return false;
  const cfg = readJson(USER_FILE);
  const prov = cfg[providerId] || {};
  for (const k of def.keys) {
    const v = partial && partial[k.key];
    if (typeof v !== "string") continue;
    if (v.trim() === "") delete prov[k.key];
    else prov[k.key] = v.trim();
  }
  cfg[providerId] = prov;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try { fs.chmodSync(DATA_DIR, 0o700); } catch {}
  fs.writeFileSync(USER_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  try { fs.chmodSync(USER_FILE, 0o600); } catch {}
  return true;
}

// Konfigurasi efektif (nilai nyata untuk dipakai runtime server-side).
function resolveConfig(providerId) {
  const def = providerDef(providerId);
  if (!def) return null;
  const key = getKey(providerId, def.keys.find((k) => k.secret) ? def.keys.find((k) => k.secret).key : "");
  const baseUrlKey = def.keys.find((k) => k.key.endsWith("BASE_URL"));
  const baseUrl = (baseUrlKey ? getKey(providerId, baseUrlKey.key) : "") || def.defaultBaseUrl;
  const model = (readJson(USER_FILE)[providerId] && readJson(USER_FILE)[providerId].model) || "";
  return {
    id: providerId,
    name: def.name,
    kind: def.kind,
    apiKey: key,
    baseUrl: String(baseUrl).replace(/\/+$/, ""),
    model: model || def.models[0],
    models: def.models
  };
}

// Set model aktif per provider.
function setModel(providerId, model) {
  const cfg = readJson(USER_FILE);
  cfg[providerId] = cfg[providerId] || {};
  cfg[providerId].model = String(model || "");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try { fs.chmodSync(DATA_DIR, 0o700); } catch {}
  fs.writeFileSync(USER_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  try { fs.chmodSync(USER_FILE, 0o600); } catch {}
  return true;
}

// Public (aman untuk renderer): daftar provider + status configured (tanpa nilai).
function publicList() {
  return PROVIDER_DEFS.map((def) => ({
    id: def.id,
    name: def.name,
    kind: def.kind,
    capabilities: def.capabilities,
    models: def.models,
    configured: isConfigured(def.id),
    fromEnv: def.keys.some((k) => Boolean(process.env[k.env]))
  }));
}

module.exports = {
  PROVIDER_DEFS,
  USER_FILE,
  providerDef,
  getKey,
  isConfigured,
  setKeys,
  resolveConfig,
  setModel,
  publicList
};
