// Emphasa audio: ubah PCM mono menjadi envelope energi, lalu beri bonus pada
// kalimat yang diucapkan lebih keras / didahului jeda dramatis.
// Dipakai opsional oleh hook scoring: scoreHook(text, lang, { audio }).
(function initAudioEmphasis(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ClipmeAudioEmphasis = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAudioEmphasis() {
  "use strict";

  const finite = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

  /**
   * PCM 16-bit mono → RMS per hop.
   * @param {Buffer|Int16Array} pcm
   * @param {number} sampleRate
   * @param {number} hopMs
   * @returns {number[]} RMS 0..1
   */
  function computeEnvelope(pcm, sampleRate, hopMs) {
    const sr = Math.max(1000, finite(sampleRate, 16000));
    const hop = Math.max(20, finite(hopMs, 100));
    const hopSamples = Math.max(1, Math.round((sr * hop) / 1000));
    const samples = pcm instanceof Int16Array
      ? pcm
      : new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));

    const out = [];
    for (let i = 0; i + hopSamples <= samples.length; i += hopSamples) {
      let sum = 0;
      for (let k = 0; k < hopSamples; k++) {
        const v = samples[i + k] / 32768;
        sum += v * v;
      }
      out.push(Math.sqrt(sum / hopSamples));
    }
    return out;
  }

  /** Energi pada rentang detik (indeks hop). */
  function rangeEnergy(envelope, hopMs, startSec, endSec) {
    const hop = Math.max(20, finite(hopMs, 100));
    const from = Math.max(0, Math.floor((finite(startSec, 0) * 1000) / hop));
    const to = Math.min(envelope.length, Math.ceil((finite(endSec, 0) * 1000) / hop));
    if (to <= from) return { mean: 0, peak: 0 };
    let sum = 0;
    let peak = 0;
    for (let i = from; i < to; i++) {
      const v = envelope[i] || 0;
      sum += v;
      if (v > peak) peak = v;
    }
    return { mean: sum / (to - from), peak };
  }

  /** Baseline bicara normal: p30 (lantai energi), bukan median.
   *  Median ikut naik kalau separuh klip berteriak, sehingga bagian keras
   *  tidak pernah terdeteksi sebagai penekanan. */
  function baselineOf(envelope) {
    if (!envelope.length) return 0;
    const sorted = envelope.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.3)] || 0;
  }

  /**
   * Skor emosional satu segmen: seberapa keras dibanding baseline + jeda sebelum.
   * @returns {{emphasis:number,pauseBefore:number,ratio:number,bonus:number}}
   */
  function scoreSegment(envelope, hopMs, segments, index, options) {
    const opts = options || {};
    const seg = (segments || [])[index];
    if (!seg) return { emphasis: 0, pauseBefore: 0, ratio: 1, bonus: 0 };

    const baseline = Math.max(0.001, finite(opts.baseline, baselineOf(envelope)));
    const range = rangeEnergy(envelope, hopMs, seg.start, seg.end);
    const ratio = range.mean / baseline;

    const prev = (segments || [])[index - 1];
    const pauseBefore = prev ? Math.max(0, finite(seg.start, 0) - finite(prev.end, 0)) : 0;

    // Bonus dibatasi supaya tidak menyalip specificity/curiosity.
    let bonus = 0;
    if (ratio >= 1.35) bonus += 6;
    else if (ratio >= 1.15) bonus += 3;
    if (pauseBefore >= 0.8) bonus += 4;
    else if (pauseBefore >= 0.45) bonus += 2;

    return {
      emphasis: Math.round(range.mean * 1000) / 1000,
      pauseBefore: Math.round(pauseBefore * 100) / 100,
      ratio: Math.round(ratio * 100) / 100,
      bonus: Math.min(10, bonus)
    };
  }

  return { computeEnvelope, rangeEnergy, baselineOf, scoreSegment };
});
