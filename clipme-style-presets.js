// Preset gaya: satu nama untuk kombinasi caption + layout + rasio.
// Dipakai UI (browser global) dan test (CommonJS). Semua nilai divalidasi di
// sini supaya preset dari localStorage tidak bisa menyuntik nilai aneh ke
// pipeline export.
(function initStylePresets(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ClipmeStylePresets = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createStylePresets() {
  "use strict";

  const CAPTION_STYLES = ["karaoke", "bold", "minimal", "pop", "glow", "off"];
  const RATIOS = ["portrait", "square", "wide", "four5"];
  const HEX = /^#[0-9a-f]{6}$/i;

  const DEFAULTS = {
    captionStyle: "karaoke",
    captionSize: 23,
    fontFamily: "Arial",
    captionColor: "#FFFFFF",
    captionPosition: 76,
    ratio: "portrait",
    speakerCut: false,
    faceTrack: true
  };

  // Tiga preset bawaan mengikuti referensi: tebal, serif, kotak bersih.
  const BUILTIN = [
    {
      id: "podcast-tebal",
      name: "Podcast tebal",
      description: "Karaoke besar, kontras tinggi, cocok untuk obrolan.",
      settings: {
        captionStyle: "karaoke",
        captionSize: 27,
        fontFamily: "Arial Black",
        captionColor: "#FFFFFF",
        captionPosition: 78,
        ratio: "portrait",
        speakerCut: true,
        faceTrack: true
      }
    },
    {
      id: "serif-elegan",
      name: "Serif elegan",
      description: "Minimal, serif, untuk konten reflektif.",
      settings: {
        captionStyle: "minimal",
        captionSize: 22,
        fontFamily: "Georgia",
        captionColor: "#F3EDE3",
        captionPosition: 72,
        ratio: "portrait",
        speakerCut: false,
        faceTrack: true
      }
    },
    {
      id: "kotak-bersih",
      name: "Kotak bersih",
      description: "Bold netral untuk feed dan carousel.",
      settings: {
        captionStyle: "bold",
        captionSize: 23,
        fontFamily: "Arial",
        captionColor: "#FFFFFF",
        captionPosition: 76,
        ratio: "square",
        speakerCut: false,
        faceTrack: true
      }
    }
  ];

  const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };

  /** Bersihkan satu objek setelan; nilai tak dikenal dibuang. */
  function normalizeSettings(input) {
    const src = input && typeof input === "object" ? input : {};
    const out = { ...DEFAULTS };

    if (CAPTION_STYLES.includes(src.captionStyle)) out.captionStyle = src.captionStyle;
    if (RATIOS.includes(src.ratio)) out.ratio = src.ratio;

    out.captionSize = clamp(src.captionSize, 14, 40, DEFAULTS.captionSize);
    out.captionPosition = clamp(src.captionPosition, 30, 95, DEFAULTS.captionPosition);

    if (typeof src.fontFamily === "string" && src.fontFamily.trim()) {
      out.fontFamily = src.fontFamily.trim().slice(0, 40);
    }
    if (typeof src.captionColor === "string" && HEX.test(src.captionColor)) {
      out.captionColor = src.captionColor.toUpperCase();
    }
    out.speakerCut = !!src.speakerCut;
    out.faceTrack = !!src.faceTrack;
    return out;
  }

  /** Preset dengan setelan yang sudah divalidasi. */
  function normalizePreset(preset) {
    if (!preset || typeof preset !== "object") return null;
    const id = typeof preset.id === "string" ? preset.id.trim().slice(0, 48) : "";
    if (!id) return null;
    return {
      id,
      name: typeof preset.name === "string" && preset.name.trim() ? preset.name.trim().slice(0, 48) : id,
      description: typeof preset.description === "string" ? preset.description.slice(0, 160) : "",
      custom: !!preset.custom,
      settings: normalizeSettings(preset.settings)
    };
  }

  /** Gabungkan preset bawaan + preset user (user menang saat id sama). */
  function mergePresets(customList) {
    const map = new Map();
    for (const preset of BUILTIN) {
      const normalized = normalizePreset({ ...preset, custom: false });
      if (normalized) map.set(normalized.id, normalized);
    }
    for (const raw of Array.isArray(customList) ? customList : []) {
      const normalized = normalizePreset({ ...raw, custom: true });
      if (normalized) map.set(normalized.id, normalized);
    }
    return [...map.values()];
  }

  /** Ambil preset berdasarkan id. */
  function findPreset(id, customList) {
    return mergePresets(customList).find((preset) => preset.id === id) || null;
  }

  /** Buat preset baru dari setelan saat ini. */
  function createPreset(name, settings) {
    const label = String(name || "").trim();
    if (!label) return null;
    const id = `custom-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || Date.now()}`;
    return normalizePreset({ id, name: label, custom: true, description: "Preset simpanan", settings });
  }

  return {
    CAPTION_STYLES,
    RATIOS,
    DEFAULTS,
    BUILTIN,
    normalizeSettings,
    normalizePreset,
    mergePresets,
    findPreset,
    createPreset
  };
});
