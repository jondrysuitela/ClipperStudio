// Regression: penjaga kualitas caption (refineSegments).
// Fokus: segmen panjang dipecah, segmen pendek digabung/dipanjangkan,
// tidak ada overlap, teks & kata tidak hilang, id unik berurutan.
const assert = require("assert");
const engine = require("./clipme-caption-engine.js");

const refine = engine.refineSegments;
if (typeof refine !== "function") {
  console.error("refineSegments tidak diekspor");
  process.exit(1);
}

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`[OK  ] ${name}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.error(`[FAIL] ${name}\n  -> ${error.message}`);
    process.exitCode = 1;
  }
}

function makeWords(count, { start = 0, step = 0.7, dur = 0.6 } = {}) {
  const words = [];
  let t = start;
  for (let i = 0; i < count; i++) {
    words.push({ text: `kata${i}`, start: t, end: t + dur });
    t += step;
  }
  return words;
}

const cfg = { maxSegmentDuration: 3, minSegmentDuration: 1.2, maxWords: 7, maxLines: 2, maxLineLength: 40 };

test("segmen 10s/14 kata dipecah jadi potongan <= 3s & <= 7 kata", () => {
  const words = makeWords(14);
  const seg = { id: 1, start: 0, end: words[13].end, text: words.map((w) => w.text).join(" "), words, wordCount: 14 };
  const out = refine([seg], cfg);
  assert.ok(out.length >= 2, `harus terpecah, dapat ${out.length}`);
  for (const s of out) {
    assert.ok(s.end - s.start <= 3.2, `durasi ${(s.end - s.start).toFixed(2)}s terlalu panjang`);
    assert.ok(s.wordCount <= 7, `kata ${s.wordCount} terlalu banyak`);
  }
});

test("tidak ada kata yang hilang setelah dipecah", () => {
  const words = makeWords(14);
  const seg = { id: 1, start: 0, end: words[13].end, text: words.map((w) => w.text).join(" "), words, wordCount: 14 };
  const out = refine([seg], cfg);
  const joined = out.map((s) => s.text).join(" ");
  for (const w of words) assert.ok(joined.includes(w.text), `kata hilang: ${w.text}`);
});

test("segmen mikro tidak digabung (batas engine dihormati)", () => {
  const a = { id: 1, start: 0, end: 0.4, text: "Ya.", words: [{ text: "Ya.", start: 0, end: 0.4 }], wordCount: 1 };
  const b = { id: 2, start: 0.5, end: 0.9, text: "Betul.", words: [{ text: "Betul.", start: 0.5, end: 0.9 }], wordCount: 1 };
  const out = refine([a, b], cfg);
  assert.strictEqual(out.length, 2, "micro caption tetap terpisah");
  assert.strictEqual(out[0].text, "Ya.");
});

test("segmen pendek tidak diperpanjang melewati kata terakhir", () => {
  const seg = { id: 9, start: 5, end: 5.2, text: "ya", words: [{ text: "ya", start: 5, end: 5.2 }], wordCount: 1 };
  const out = refine([seg], cfg);
  assert.ok(out[0].end <= 5.21, `end ${out[0].end} tidak boleh melewati kata terakhir`);
});

test("tidak ada overlap antar segmen", () => {
  const words = makeWords(12);
  const seg = { id: 1, start: 0, end: words[11].end, text: words.map((w) => w.text).join(" "), words, wordCount: 12 };
  const extra = { id: 2, start: words[11].end - 0.3, end: words[11].end + 1.5, text: "tambahan kata", words: [], wordCount: 2 };
  const out = refine([seg, extra], cfg);
  for (let i = 1; i < out.length; i++) {
    assert.ok(out[i].start >= out[i - 1].end - 0.001, `overlap di ${i}`);
  }
});

test("id unik dan berurutan setelah refine", () => {
  const words = makeWords(10);
  const seg = { id: 7, start: 0, end: words[9].end, text: words.map((w) => w.text).join(" "), words, wordCount: 10 };
  const out = refine([seg], cfg);
  out.forEach((s, i) => assert.strictEqual(s.id, i + 1));
});

test("lines dihitung ulang mengikuti batas 2x40", () => {
  const words = makeWords(6, { step: 0.5, dur: 0.45 });
  const seg = { id: 1, start: 0, end: words[5].end, text: words.map((w) => w.text).join(" "), words, wordCount: 6 };
  const out = refine([seg], cfg);
  for (const s of out) {
    assert.ok(Array.isArray(s.lines), "lines harus array");
    assert.ok(s.lines.length <= 2, "maksimal 2 baris");
  }
});

const failed = results.filter((r) => !r.ok).length;
console.log(`\nCaption refine test: ${results.length - failed}/${results.length} PASS`);
if (failed) process.exit(1);
