// Belajar dari performa: bobot per tipe hook dari data views/likes nyata.
// Tidak mengubah skor dasar; hanya pengali 0.85..1.20 dengan syarat sampel.
(function initHookLearn(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ClipmeHookLearn = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createHookLearn() {
  "use strict";

  const finite = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /** Engagement rate sederhana: komentar & share lebih berbobot dari like. */
  function engagementRate(rec) {
    const views = Math.max(0, finite(rec && rec.views, 0));
    if (!views) return 0;
    const likes = Math.max(0, finite(rec.likes, 0));
    const comments = Math.max(0, finite(rec.comments, 0));
    const shares = Math.max(0, finite(rec.shares, 0));
    return (likes + comments * 2 + shares * 3) / views;
  }

  /**
   * @param {Array<{hookType:string,views:number,likes:number,comments:number,shares:number}>} records
   * @returns {{weights:Object<string,number>, samples:Object, globalRate:number, total:number}}
   */
  function learnWeights(records, options) {
    const opts = options || {};
    const minSamples = Math.max(1, finite(opts.minSamples, 3));
    const lo = finite(opts.minWeight, 0.85);
    const hi = finite(opts.maxWeight, 1.2);

    const rows = (records || [])
      .map((rec) => ({
        hookType: String((rec && rec.hookType) || "").trim() || "unknown",
        rate: engagementRate(rec),
        views: Math.max(0, finite(rec && rec.views, 0))
      }))
      .filter((row) => row.views > 0);

    const total = rows.length;
    if (!total) return { weights: {}, samples: {}, globalRate: 0, total: 0 };

    const globalRate = rows.reduce((sum, row) => sum + row.rate, 0) / total;
    const byType = {};
    for (const row of rows) {
      const bucket = byType[row.hookType] || (byType[row.hookType] = { n: 0, sum: 0 });
      bucket.n += 1;
      bucket.sum += row.rate;
    }

    const weights = {};
    const samples = {};
    for (const [type, bucket] of Object.entries(byType)) {
      samples[type] = bucket.n;
      if (bucket.n < minSamples || globalRate <= 0) { weights[type] = 1; continue; }
      const avg = bucket.sum / bucket.n;
      weights[type] = Math.round(clamp(avg / globalRate, lo, hi) * 100) / 100;
    }

    return {
      weights,
      samples,
      globalRate: Math.round(globalRate * 10000) / 10000,
      total
    };
  }

  /** Terapkan bobot ke skor 0..100. */
  function applyWeights(score, hookType, weights) {
    const base = clamp(finite(score, 0), 0, 100);
    const w = Number((weights || {})[hookType]) || 1;
    return Math.round(clamp(base * w, 0, 100));
  }

  return { engagementRate, learnWeights, applyWeights };
});
