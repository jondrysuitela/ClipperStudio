// ============================================================================
// ClipMe AI — Local Provider (#3, #21)
//
// Provider lokal yang membungkus engine heuristic deterministik yang sudah ada
// (hook engine, deep-title engine, caption engine, director). Selalu tersedia
// dan tidak pernah membutuhkan internet. Menjamin Clipper Studio tetap
// berfungsi penuh tanpa provider cloud (#21, #41).
//
// capabilities: textGeneration, structuredOutput, reasoning, fastInference, local
// ============================================================================
const path = require("path");
const { AIProvider } = require("./base");

const ROOT = path.join(__dirname, "..", "..");

// Lazy require engine lokal agar tidak merusak startup bila satu modul gagal.
function loadRel(rel, key) {
  try {
    return require(path.join(ROOT, rel));
  } catch {
    return null;
  }
}

let _engines = null;
function engines() {
  if (_engines) return _engines;
  _engines = {
    hook: loadRel("clipme-hook-engine.js", "hook"),
    deepTitle: loadRel("clipme-deep-title-engine.js", "deep"),
    caption: loadRel("clipme-caption-engine.js", "caption"),
    director: loadRel("clipme-director.js", "director")
  };
  return _engines;
}

class LocalProvider extends AIProvider {
  constructor(opts = {}) {
    super({
      id: "local",
      name: "Local AI",
      kind: "local",
      models: ["clipme-heuristic"],
      capabilities: ["textGeneration", "structuredOutput", "reasoning", "fastInference", "local"],
      ...opts
    });
    this.enabled = true;
    this.priority = Number(opts.priority) || 99; // default terakhir kecuali diatur
    this.weight = Number(opts.weight) || 1;
  }

  // Analyzer lokal: hook + deep-title. Menghasilkan struktur mirip LLM tapi
  // deterministik & grounded ke sumber. Tidak pernah mengarang.
  async analyze(task, { system, user, options = {} } = {}) {
    const e = engines();
    // Orchestrator mengirim user sebagai objek { text, language, task, options }.
    // Jangan di-JSON.stringify: seluruh payload ikut terbaca sebagai kalimat dan
    // hook jadi berisi kunci JSON (bug nyata pada analyze-clip).
    const usr = typeof user === "string"
      ? user
      : String((user && (user.text || user.prompt || "")) || "");
    // user berisi blok "TRANSCRIPT..." — kita parsing teks untuk engine lokal.
    const parsed = parseTranscriptBlock(usr);
    const language = (options && options.language) || "id";
    const lang = (e.hook && e.hook.langTag && e.hook.langTag(language)) || "id";

    if (task === "HOOK_ANALYSIS" || task === "TEXT_ANALYSIS" || task === "TITLE_GENERATION") {
      const data = buildLocalAnalysis(parsed.sentences, parsed.segments, e, lang, options);
      return { ok: true, data, provider: "local", model: "clipme-heuristic", usage: { promptTokens: 0, completionTokens: 0 } };
    }

    return {
      ok: true,
      // Task ini tidak punya implementasi heuristik: tandai stub supaya
      // orchestrator tidak menghitungnya sebagai analisis nyata (confidence).
      stub: true,
      data: { result: "local-heuristic", note: "Task belum didukung provider lokal, fallback deterministik." },
      provider: "local",
      model: "clipme-heuristic",
      usage: { promptTokens: 0, completionTokens: 0 }
    };
  }

  async generate(task, params) {
    return this.analyze(task, params);
  }

  async healthCheck() {
    const e = engines();
    const ok = !!(e.hook && e.deepTitle);
    return {
      ok,
      state: ok ? "READY" : "ERROR",
      message: ok ? "Local engines ready" : "Local engine unavailable",
      provider: "local"
    };
  }

  async listModels() {
    return { models: ["clipme-heuristic"], source: "built-in" };
  }
}

// Parsing blok "TRANSCRIPT:\n[0-1s] text\n[1-2s] ..." menjadi sentences + segments.
function parseTranscriptBlock(userText) {
  const text = String(userText || "");
  const segments = [];
  const lineRe = /\[([\d.]+)-([\d.]+)s?\]\s*([^\n]+)/g;
  let m;
  while ((m = lineRe.exec(text))) {
    segments.push({ start: Number(m[1]), end: Number(m[2]), text: String(m[3] || "").trim() });
  }
  if (!segments.length && text.trim()) {
    // Fallback: seluruh teks sebagai satu segmen.
    const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) segments.push({ start: i, end: i + 1, text: lines[i] });
  }
  const sentences = segments.map((s) => s.text).filter(Boolean);
  return { segments, sentences };
}

function buildLocalAnalysis(sentences, segments, e, lang, options) {
  const langTag = lang || "id";
  const base = { provider: "local", local: true, sourceFidelity: "HIGH", consensus: null, providerVotes: [] };

  // HOOK (dari hook engine)
  try {
    if (e.hook && typeof e.hook.selectHook === "function" && sentences.length) {
      const res = e.hook.selectHook(sentences, langTag, {});
      if (res) {
        base.hookType = res.type || "UNKNOWN";
        base.hookScore = Math.round((res.score != null ? res.score : 0) * 100) || 0;
        base.recommendedHook = res.recommendedHook || res.hook || "";
        base.originalHook = res.originalHook || sentences[0] || "";
        base.confidence = Math.round((res.confidence != null ? res.confidence : 0) * 100) || 0;
        base.hookStrategy = res.explanation || "";
      }
    }
  } catch {}

  // DEEP TITLE (judul deterministik)
  try {
    if (e.deepTitle && typeof e.deepTitle.analyzeDeepTitle === "function" && sentences.length) {
      const deep = e.deepTitle.analyzeDeepTitle(sentences, segments, langTag, {});
      if (deep) {
        base.title = deep.title || "";
        base.titleScore = deep.titleScore || 0;
        base.titleReason = deep.titleReason || "";
        base.titleAlternatives = (deep.titleAlternatives || []).map((t) => (typeof t === "object" ? t.text : t)).filter(Boolean);
        base.deepHook = deep.deepHook || "";
        base.deepHookReason = deep.deepHookReason || "";
      }
    }
  } catch {}

  // HASTAGS dari keyword teratas (deterministik)
  base.hashtags = buildHashtags(sentences.join(" "));

  // Text metrics sederhana (deterministik, bukan angka acak)
  base.text = buildTextMetrics(sentences);
  return base;
}

function buildHashtags(allText) {
  const stop = new Set(["yang","dan","di","ke","dari","ini","itu","untuk","dengan","pada","adalah","akan","sudah","tidak","bisa","ada","juga","karena","kalau","saya","kami","kita","mereka","anda","the","and","that","this","with","for","you","your","have","not","can","but","yang"]);
  const counts = {};
  for (const w of String(allText || "").toLowerCase().match(/[a-zà-ÿ0-9']{4,}/g) || []) {
    if (stop.has(w)) continue;
    counts[w] = (counts[w] || 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([w]) => "#" + w);
  return { primary: top.slice(0, 3).join(" "), niche: top.slice(3, 5).join(" "), broad: top.slice(5, 7).join(" ") || top.slice(0, 3).join(" ") };
}

function buildTextMetrics(sentences) {
  const words = sentences.join(" ").split(/\s+/).filter(Boolean);
  const total = words.length;
  const clarity = total === 0 ? 0 : Math.min(100, Math.round(60 + (sentences.length / Math.max(1, total)) * 80 + (total < 300 ? 20 : 0)));
  return {
    clarity: Math.min(100, clarity),
    readability: total > 0 ? Math.min(100, Math.round(55 + Math.min(total, 500) / 500 * 30)) : 0,
    specificity: total > 0 ? Math.min(100, Math.round(50 + (/\d/.test(sentences.join(" ")) ? 20 : 0) + (total > 40 ? 20 : 0))) : 0,
    curiosity: sentences.some((s) => /[?]/.test(s)) ? 70 : 45,
    wordsCount: total,
    sentencesCount: sentences.length
  };
}

module.exports = { LocalProvider };
