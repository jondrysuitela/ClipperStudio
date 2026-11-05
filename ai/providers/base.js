// ============================================================================
// ClipMe AI — Provider Interface Contract (#3)
//
// Setiap AI provider mengimplementasikan interface normal berikut:
//
//   {
//     id,            // string unik
//     name,          // label tampil
//     kind,          // "local" | "openai-compatible" | ...
//     models,        // daftar nama model yang didukung
//     capabilities,  // {"textGeneration":true, ...}  (#6)
//     analyze(task, {system, user, options})   -> Promise<StructuredResult>
//     generate(task, {system, user, options})  -> Promise<StructuredResult>
//     healthCheck()  -> Promise<{ok, state}>
//     listModels()   -> Promise<{models, source}>
//   }
//
// StructuredResult (kontrak output JSON normal, #26):
//   { ok, data, provider, model, usage:{promptTokens,completionTokens}, error? }
//
// Application tidak terkunci ke SDK provider tertentu — hanya ke interface ini.
// ============================================================================

const CAPABILITIES = [
  "textGeneration",
  "structuredOutput",
  "vision",
  "longContext",
  "reasoning",
  "fastInference",
  "local",
];

// Normalisasi output JSON model: toleransi fenced code block (untrusted input).
// Tutup JSON yang terpotong (mis. kena max_tokens) supaya isinya masih bisa
// dipakai daripada membuang seluruh respons.
function repairTruncatedJson(text) {
  let inString = false;
  let escaped = false;
  const stack = [];
  for (const ch of text) {
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{" || ch === "[") stack.push(ch);
    if (ch === "}" || ch === "]") stack.pop();
  }
  if (!stack.length && !inString) return null;
  let out = text;
  if (inString) out += '"';
  out = out.replace(/,\s*$/, "").replace(/,\s*"[^"]*"\s*:\s*$/, "");
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i] === "{" ? "}" : "]";
  return out;
}

function normalizeJsonOutput(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  const cleaned = s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const attempts = [cleaned];
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first > 0 && last > first) attempts.push(cleaned.slice(first, last + 1));
  for (const candidate of attempts) {
    try { return JSON.parse(candidate); } catch {}
    const repaired = repairTruncatedJson(candidate);
    if (repaired) {
      try { return JSON.parse(repaired); } catch {}
    }
  }
  return null;
}

// Base class / helper yang dipakai semua adapter.
class AIProvider {
  constructor(opts = {}) {
    this.id = opts.id;
    this.name = opts.name || opts.id;
    this.kind = opts.kind || "generic";
    this.models = opts.models || [];
    this.capabilities = {};
    for (const c of opts.capabilities || []) this.capabilities[c] = true;
    this.enabled = opts.enabled !== false;
    this.priority = Number(opts.priority) || 0;
    this.weight = Number(opts.weight) || 1;
  }

  has(cap) {
    return !!this.capabilities[cap];
  }

  // Health states (#30): READY / DEGRADED / RATE_LIMITED / OFFLINE / INVALID_KEY / ERROR
  async healthCheck() {
    return { ok: false, state: "ERROR", message: "healthCheck() not implemented" };
  }

  async analyze() {
    throw new Error("analyze() not implemented");
  }

  async generate() {
    throw new Error("generate() not implemented");
  }

  async listModels() {
    return { models: this.models, source: "static" };
  }
}

module.exports = {
  normalizeJsonOutput,
  repairTruncatedJson, AIProvider, CAPABILITIES, normalizeJsonOutput };
