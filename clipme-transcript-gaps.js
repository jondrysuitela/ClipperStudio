// Deteksi lubang transkrip + gabung hasil STT tambahan.
// Dipakai server untuk "gap fill": kalau subtitle hanya menutup sebagian clip,
// transkripsi ulang hanya rentang yang kosong, bukan seluruh video.
(function initTranscriptGaps(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ClipmeTranscriptGaps = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTranscriptGaps() {
  "use strict";

  const finite = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

  /**
   * Cari rentang tanpa teks di dalam [start, end].
   * @returns {{start:number,end:number,duration:number}[]}
   */
  function findGaps(segments, start, end, options) {
    const opts = options || {};
    const minGap = finite(opts.minGap, 5);
    const maxGap = finite(opts.maxGap, 45);
    const maxGaps = finite(opts.maxGaps, 4);
    const s0 = finite(start, 0);
    const s1 = finite(end, s0);

    const spans = (segments || [])
      .map((seg) => ({ start: finite(seg.start, 0), end: finite(seg.end, 0) }))
      .filter((seg) => seg.end > seg.start)
      .sort((a, b) => a.start - b.start)
      // potong ke window clip
      .map((seg) => ({ start: Math.max(s0, seg.start), end: Math.min(s1, seg.end) }))
      .filter((seg) => seg.end > seg.start);

    // gabung span yang bertumpuk / bersambung supaya gap tidak dihitung dua kali
    const merged = [];
    for (const seg of spans) {
      const prev = merged[merged.length - 1];
      if (prev && seg.start <= prev.end + 0.05) prev.end = Math.max(prev.end, seg.end);
      else merged.push({ ...seg });
    }

    const gaps = [];
    let cursor = s0;
    for (const seg of merged) {
      const gap = seg.start - cursor;
      if (gap >= minGap) gaps.push({ start: cursor, end: seg.start, duration: gap });
      cursor = Math.max(cursor, seg.end);
    }
    if (s1 - cursor >= minGap) gaps.push({ start: cursor, end: s1, duration: s1 - cursor });

    return gaps
      .slice(0, maxGaps)
      .map((gap) => ({ ...gap, end: Math.min(gap.end, gap.start + maxGap) }));
  }

  /** Rasio durasi clip yang punya teks (0..1). */
  function coverageRatio(segments, start, end) {
    const s0 = finite(start, 0);
    const s1 = finite(end, s0);
    const total = Math.max(0.001, s1 - s0);
    const spans = (segments || [])
      .map((seg) => ({ start: Math.max(s0, finite(seg.start, 0)), end: Math.min(s1, finite(seg.end, 0)) }))
      .filter((seg) => seg.end > seg.start)
      .sort((a, b) => a.start - b.start);
    let covered = 0;
    let cursor = s0;
    for (const seg of spans) {
      const from = Math.max(seg.start, cursor);
      if (seg.end > from) { covered += seg.end - from; cursor = seg.end; }
    }
    return Math.max(0, Math.min(1, covered / total));
  }

  /** Gabung segmen baru (hasil STT gap) ke segmen lama, buang duplikat. */
  function mergeSegments(base, extra) {
    const all = [...(base || []), ...(extra || [])]
      .map((seg) => ({
        start: finite(seg.start, 0),
        end: finite(seg.end, 0),
        text: String(seg.text || "").trim(),
        words: Array.isArray(seg.words) ? seg.words : []
      }))
      .filter((seg) => seg.text && seg.end > seg.start)
      .sort((a, b) => a.start - b.start);

    const out = [];
    for (const seg of all) {
      const prev = out[out.length - 1];
      if (!prev) { out.push(seg); continue; }
      const overlap = Math.min(prev.end, seg.end) - Math.max(prev.start, seg.start);
      const shorter = Math.min(prev.end - prev.start, seg.end - seg.start);
      // Duplikat: tumpang tindih > 60% dari segmen terpendek → pertahankan yang lebih panjang.
      if (shorter > 0 && overlap / shorter > 0.6) {
        if ((seg.end - seg.start) > (prev.end - prev.start)) out[out.length - 1] = seg;
        continue;
      }
      out.push(seg);
    }
    return out;
  }

  return { findGaps, coverageRatio, mergeSegments };
});
