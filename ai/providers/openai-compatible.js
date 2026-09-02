// ============================================================================
// ClipMe AI — OpenAI-Compatible Provider Adapter (#3)
//
// Satu adapter generic untuk provider yang kompatibel dengan OpenAI
// ChatCompletions: OpenAI, DeepSeek, Groq, OpenRouter, dan lainnya.
//
// Provider-agnostic: base URL + API key + model + capabilities dikonfigurasi
// via `ai/config.js`. Tidak ada SDK yang dikunci di seluruh aplikasi.
//
// Fitur:
//   - POST /chat/completions (JSON response bila `response_format` didukung)
//   - Connection timeout + request timeout (#29)
//   - Retry policy (once), lalu lempar agar orchestrator fallback (#21)
//   - healthCheck (#30), listModels (#5-UI)
// ============================================================================
const { AIProvider, normalizeJsonOutput } = require("./base");

const DEFAULT_TIMEOUT = 120000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class OpenAICompatibleProvider extends AIProvider {
  constructor(opts = {}) {
    super(opts);
    this.kind = "openai-compatible";
    this.baseUrl = String(opts.baseUrl || opts.defaultBaseUrl || "").replace(/\/+$/, "");
    this.apiKey = opts.apiKey || "";
    this.defaultModel = opts.model || (opts.models && opts.models[0]) || "";
    this.timeout = Number(opts.timeout) || DEFAULT_TIMEOUT;
  }

  // Internal: satu request chat-completions dengan timeout + retry.
  async _chat(messages, options = {}) {
    if (!this.apiKey) {
      const err = new Error("API key tidak tersedia.");
      err.code = "INVALID_KEY";
      throw err;
    }
    const model = options.model || this.defaultModel;
    if (!model) {
      const err = new Error("Model tidak dikonfigurasi.");
      err.code = "NO_MODEL";
      throw err;
    }

    const url = `${this.baseUrl}/chat/completions`;
    const body = {
      model,
      messages,
      temperature: options.temperature != null ? options.temperature : 0.4,
      ...(options.json ? { response_format: { type: "json_object" } } : {})
    };

    const attempt = async (signal) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      // Ganti signal agar tidak menimpa controller tunggal untuk retry.
      const outerSignal = signal || controller.signal;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(body),
          signal: outerSignal
        });
        if (res.status === 429) {
          const e = new Error("Rate limited (HTTP 429).");
          e.code = "RATE_LIMITED";
          e.status = 429;
          throw e;
        }
        if (res.status === 401 || res.status === 403) {
          const e = new Error(`Authentication failed (HTTP ${res.status}).`);
          e.code = "INVALID_KEY";
          e.status = res.status;
          throw e;
        }
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          const e = new Error(`API ${res.status}: ${text.slice(0, 300)}`);
          e.code = "SERVER_ERROR";
          e.status = res.status;
          throw e;
        }
        const data = await res.json();
        const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!content) {
          const e = new Error("Model tidak mengembalikan konten.");
          e.code = "EMPTY";
          throw e;
        }
        return {
          content,
          usage: (data.usage && { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens }) || { promptTokens: 0, completionTokens: 0 }
        };
      } finally {
        clearTimeout(timer);
      }
    };

    // Retry sekali pada timeout/jaringan (bukan 4xx).
    try {
      return await attempt(null);
    } catch (err) {
      if (err.status && err.status >= 400 && err.status < 500) throw err;
      try {
        await sleep(300);
        return await attempt(null);
      } catch (err2) {
        throw err2;
      }
    }
  }

  async analyze(task, { system, user, options = {} } = {}) {
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: user });
    const result = await this._chat(messages, { ...options, json: true });
    const data = normalizeJsonOutput(result.content);
    if (!data) {
      const err = new Error("Respons model bukan JSON valid.");
      err.code = "BAD_JSON";
      throw err;
    }
    return { ok: true, data, provider: this.id, model: (options.model || this.defaultModel), usage: result.usage };
  }

  async generate(task, params) {
    return this.analyze(task, params);
  }

  async healthCheck() {
    try {
      const result = await this._chat(
        [{ role: "user", content: "Reply with the single JSON object: {\"ok\":true}" }],
        { json: true }
      );
      if (normalizeJsonOutput(result.content)) {
        return { ok: true, state: "READY", message: "Connected", provider: this.id };
      }
      return { ok: false, state: "ERROR", message: "Invalid health response" };
    } catch (err) {
      const code = err && err.code;
      const map = {
        INVALID_KEY: "INVALID_KEY",
        RATE_LIMITED: "RATE_LIMITED",
        SERVER_ERROR: "ERROR"
      };
      return { ok: false, state: map[code] || "OFFLINE", message: (err && err.message) || String(err) };
    }
  }

  async listModels() {
    const models = this.models && this.models.length ? this.models : (this.defaultModel ? [this.defaultModel] : []);
    return { models, source: "configured" };
  }
}

module.exports = { OpenAICompatibleProvider, DEFAULT_TIMEOUT };
