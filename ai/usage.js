// ============================================================================
// ClipMe AI — Usage Tracker (#23)
//
// Mencatat jumlah request dan token per provider. Persisted di memori + file
// (0600). NAvar data yang tidak tersedia ditampilkan "Not available" — kita
// tidak pernah mengarang angka penggunaan.
// ============================================================================
const fs = require("fs");
const os = require("os");
const path = require("path");

const DATA_DIR = process.env.CLIPPER_DATA_DIR || path.join(os.homedir(), ".clipper-studio");
const FILE = path.join(DATA_DIR, "ai-usage.json");

let _usage = null;

function load() {
  if (_usage) return _usage;
  try {
    if (fs.existsSync(FILE)) _usage = JSON.parse(fs.readFileSync(FILE, "utf8")) || {};
    else _usage = {};
  } catch {
    _usage = {};
  }
  if (!_usage.providers) _usage.providers = {};
  if (!_usage.total) _usage.total = { requests: 0, promptTokens: 0, completionTokens: 0 };
  return _usage;
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(_usage, null, 2), { mode: 0o600 });
  } catch {}
}

function record(providerId, usage) {
  const u = load();
  const p = u.providers[providerId] || (u.providers[providerId] = { requests: 0, promptTokens: 0, completionTokens: 0, tokenAvailable: false });
  p.requests += 1;
  if (usage) {
    const pt = Number(usage.promptTokens) || 0;
    const ct = Number(usage.completionTokens) || 0;
    if (pt > 0 || ct > 0) {
      p.promptTokens += pt;
      p.completionTokens += ct;
      p.tokenAvailable = true;
    }
  }
  u.total.requests += 1;
  if (usage) {
    const pt = Number(usage.promptTokens) || 0;
    const ct = Number(usage.completionTokens) || 0;
    if (pt > 0 || ct > 0) {
      u.total.promptTokens += pt;
      u.total.completionTokens += ct;
    }
  }
  save();
}

// Snapshot aman untuk renderer — tanpa nilai secret.
function snapshot() {
  const u = load();
  return {
    providers: Object.fromEntries(
      Object.entries(u.providers).map(([id, p]) => [
        id,
        {
          requests: p.requests || 0,
          promptTokens: p.tokenAvailable ? (p.promptTokens || 0) : null,
          completionTokens: p.tokenAvailable ? (p.completionTokens || 0) : null,
          tokenAvailable: !!p.tokenAvailable
        }
      ])
    ),
    total: {
      requests: u.total.requests || 0,
      promptTokens: u.total.promptTokens ?? null,
      completionTokens: u.total.completionTokens ?? null
    },
    usageNotAvailable: Object.fromEntries(
      Object.entries(u.providers).map(([id, p]) => [id, !p.tokenAvailable])
    )
  };
}

module.exports = { record, snapshot, load };
