// Pembersih caption: buang segmen "rolling" yang dobel & hitung cakupan.
// YouTube auto-caption sering mengirim baris bergulir: segmen berikutnya
// mengulang sebagian besar teks sebelumnya dengan waktu yang bertumpuk.
(function initCaptionClean(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ClipmeCaptionClean = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCaptionClean() {
  "use strict";

  const finite = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

  const norm = (text) => String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  function tokenSet(text) {
    return new Set(norm(text).split(" ").filter(Boolean));
  }

  function jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter += 1;
    return inter / (a.size + b.size - inter);
  }

  /**
   * Buang segmen yang mengulang segmen sebelumnya (rolling captions).
   * @param {Array<{start:number,end:number,text:string}>} segments
   * @param {{minOverlap?:number,minSimilarity?:number}} options
   */
  function dedupeRollingSegments(segments, options) {
    const opts = options || {};
    const minOverlap = finite(opts.minOverlap, 0.25);
    const minSimilarity = finite(opts.minSimilarity, 0.6);

    const list = (segments || [])
      .map((seg) => ({
        ...seg,
        start: finite(seg.start, 0),
        end: finite(seg.end, 0),
        text: String(seg.text || "").trim()
      }))
      .filter((seg) => seg.text && seg.end > seg.start)
      .sort((a, b) => a.start - b.start);

    const out = [];
    for (const seg of list) {
      const prev = out[out.length - 1];
      if (!prev) { out.push(seg); continue; }

      const overlap = Math.min(prev.end, seg.end) - Math.max(prev.start, seg.start);
      const shorter = Math.min(prev.end - prev.start, seg.end - seg.start);
      const ratio = shorter > 0 ? overlap / shorter : 0;
      const similarity = jaccard(tokenSet(prev.text), tokenSet(seg.text));

      if (ratio >= minOverlap && similarity >= minSimilarity) {
        // Simpan teks yang lebih lengkap, gabung rentang waktunya.
        const winner = norm(seg.text).length > norm(prev.text).length ? seg.text : prev.text;
        prev.text = winner;
        prev.start = Math.min(prev.start, seg.start);
        prev.end = Math.max(prev.end, seg.end);
        continue;
      }
      out.push(seg);
    }
    return out;
  }

  /** Rasio durasi yang tercakup teks (0..1). */
  function coverageOf(segments, start, end) {
    const s0 = finite(start, 0);
    const s1 = finite(end, s0);
    const total = Math.max(0.001, s1 - s0);
    const spans = (segments || [])
      .map((seg) => ({
        start: Math.max(s0, finite(seg.start, 0)),
        end: Math.min(s1, finite(seg.end, 0))
      }))
      .filter((seg) => seg.end > seg.start)
      .sort((a, b) => a.start - b.start);

    let covered = 0;
    let cursor = s0;
    for (const span of spans) {
      const from = Math.max(span.start, cursor);
      if (span.end > from) { covered += span.end - from; cursor = span.end; }
    }
    return Math.max(0, Math.min(1, covered / total));
  }

  return { dedupeRollingSegments, coverageOf };
});
