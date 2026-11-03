// Token Manager — kredensial OAuth TIDAK PERNAH keluar dari layer ini.
// Disimpan di luar repo: ~/.clipper-studio/social-tokens.json
//   - di dalam Electron: terenkripsi safeStorage (DPAPI/Keychain/libsecret)
//   - via `node server.js`: plaintext 0600 (safeStorage tidak tersedia)
const os = require("os");
const path = require("path");
const secureStore = require("./secure-store");

const STORE_DIR = process.env.CLIPPER_DATA_DIR || path.join(os.homedir(), ".clipper-studio");
const STORE_FILE = path.join(STORE_DIR, "social-tokens.json");

function loadAll() {
  const parsed = secureStore.readJson(STORE_FILE, {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

function saveAll(all) {
  secureStore.writeJsonAtomic(STORE_FILE, all, { mode: 0o600 });
}

module.exports = {
  store(provider, data) {
    const all = loadAll();
    all[provider] = { ...all[provider], ...data, updatedAt: Date.now() };
    saveAll(all);
    return true;
  },
  get(provider) {
    return loadAll()[provider] || null;
  },
  remove(provider) {
    const all = loadAll();
    delete all[provider];
    saveAll(all);
    return true;
  },
  hasValidToken(provider) {
    const t = loadAll()[provider];
    return Boolean(t && t.access_token && (!t.expires_at || t.expires_at > Date.now() + 30000));
  },
  // Status penyimpanan untuk UI/endpoint /api/system — tanpa isi token.
  storageInfo() {
    return { file: STORE_FILE, ...secureStore.encryptionInfo() };
  }
};
