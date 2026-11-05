const fs = require("fs");
const FILE = "ai/providers/base.js";
let s = fs.readFileSync(FILE, "utf8");
const eol = s.includes("\r\n") ? "\r\n" : "\n";
const L = (a) => a.join(eol);

const from = L([
  "function normalizeJsonOutput(text) {",
  "  const s = String(text || \"\").trim();",
  "  if (!s) return null;",
  "  const cleaned = s",
  "    .replace(/^```(?:json)?\\s*/i, \"\")",
  "    .replace(/\\s*```\\s*$/i, \"\")",
  "    .trim();",
  "  try {",
  "    return JSON.parse(cleaned);",
  "  } catch {",
  "    return null;",
  "  }",
  "}"
]);
if (!s.includes(from)) throw new Error("normalizeJsonOutput tidak ditemukan");

const to = L([
  "// Tutup JSON yang terpotong (mis. kena max_tokens) supaya isinya masih bisa",
  "// dipakai daripada membuang seluruh respons.",
  "function repairTruncatedJson(text) {",
  "  let inString = false;",
  "  let escaped = false;",
  "  const stack = [];",
  "  for (const ch of text) {",
  "    if (inString) {",
  "      if (escaped) { escaped = false; continue; }",
  "      if (ch === \"\\\\\") { escaped = true; continue; }",
  "      if (ch === '\"') inString = false;",
  "      continue;",
  "    }",
  "    if (ch === '\"') { inString = true; continue; }",
  "    if (ch === \"{\" || ch === \"[\") stack.push(ch);",
  "    if (ch === \"}\" || ch === \"]\") stack.pop();",
  "  }",
  "  if (!stack.length && !inString) return null;",
  "  let out = text;",
  "  if (inString) out += '\"';",
  "  // Buang koma/kunci menggantung di ujung sebelum menutup.",
  "  out = out.replace(/,\\s*$/, \"\").replace(/,\\s*\"[^\"]*\"\\s*:\\s*$/, \"\");",
  "  for (let i = stack.length - 1; i >= 0; i--) out += stack[i] === \"{\" ? \"}\" : \"]\";",
  "  return out;",
  "}",
  "",
  "function normalizeJsonOutput(text) {",
  "  const s = String(text || \"\").trim();",
  "  if (!s) return null;",
  "  const cleaned = s",
  "    .replace(/^```(?:json)?\\s*/i, \"\")",
  "    .replace(/\\s*```\\s*$/i, \"\")",
  "    .trim();",
  "  const attempts = [cleaned];",
  "  // Model kadang menulis kalimat pembuka sebelum JSON.",
  "  const first = cleaned.indexOf(\"{\");",
  "  const last = cleaned.lastIndexOf(\"}\");",
  "  if (first > 0 && last > first) attempts.push(cleaned.slice(first, last + 1));",
  "  for (const candidate of attempts) {",
  "    try { return JSON.parse(candidate); } catch {}",
  "    const repaired = repairTruncatedJson(candidate);",
  "    if (repaired) {",
  "      try { return JSON.parse(repaired); } catch {}",
  "    }",
  "  }",
  "  return null;",
  "}"
]);
s = s.replace(from, to);
if (!s.includes("repairTruncatedJson,")) {
  // export untuk test (jika file mengekspor objek)
  s = s.replace("module.exports = {", "module.exports = {\n  normalizeJsonOutput,\n  repairTruncatedJson,");
}
fs.writeFileSync(FILE, s);
console.log("normalizeJsonOutput: ekstraksi + repair");
