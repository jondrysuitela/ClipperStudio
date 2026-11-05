// Test: pembagian waktu kata proporsional panjang kata.
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const src = fs.readFileSync("server.js", "utf8");
const start = src.indexOf("function flattenTranscriptWords");
const endMarker = "// Caption QA + optional AI rewrite";
const end = src.indexOf(endMarker);
if (start === -1 || end === -1) throw new Error("fungsi tidak ditemukan");
const body = src.slice(start, end);
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(body + "\nthis.flattenTranscriptWords = flattenTranscriptWords;", sandbox);

const results = [];
function test(name, fn) {
  try { fn(); results.push(true); console.log(`[OK  ] ${name}`); }
  catch (e) { results.push(false); console.error(`[FAIL] ${name}\n  -> ${e.message}`); process.exitCode = 1; }
}

test("kata panjang dapat porsi waktu lebih besar", () => {
  const words = sandbox.flattenTranscriptWords([{ start: 0, end: 4, text: "internasionalisasi di" }]);
  const longDur = words[0].end - words[0].start;
  const shortDur = words[1].end - words[1].start;
  assert.ok(longDur > shortDur * 3, `panjang ${longDur} vs pendek ${shortDur}`);
});

test("total waktu tetap menutup segmen", () => {
  const words = sandbox.flattenTranscriptWords([{ start: 10, end: 14, text: "satu dua tiga empat" }]);
  assert.strictEqual(words[0].start, 10);
  assert.strictEqual(words[words.length - 1].end, 14);
});

test("timing naik monoton tanpa celah negatif", () => {
  const words = sandbox.flattenTranscriptWords([{ start: 0, end: 6, text: "ya, kita mulai sekarang juga" }]);
  for (let i = 0; i < words.length; i++) {
    assert.ok(words[i].end > words[i].start, `kata ${i} durasi invalid`);
    if (i) assert.ok(words[i].start >= words[i - 1].start, `kata ${i} mundur`);
  }
});

test("tanda baca memberi jeda ekstra", () => {
  const plain = sandbox.flattenTranscriptWords([{ start: 0, end: 4, text: "kita semua tahu" }]);
  const paused = sandbox.flattenTranscriptWords([{ start: 0, end: 4, text: "kita semua, tahu" }]);
  // Tanda baca menempel pada kata kedua ("semua,"), jadi kata itulah yang
  // mendapat porsi waktu lebih besar dibanding tanpa jeda.
  const plainSecond = plain[1].end - plain[1].start;
  const pausedSecond = paused[1].end - paused[1].start;
  assert.ok(pausedSecond > plainSecond, `jeda ${pausedSecond} harus > ${plainSecond}`);
});

const failed = results.filter((ok) => !ok).length;
console.log(`\nWord timing test: ${results.length - failed}/${results.length} PASS`);
if (failed) process.exit(1);
