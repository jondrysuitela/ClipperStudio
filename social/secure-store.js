// Penyimpanan JSON lokal untuk kredensial (token OAuth, client secret).
//
// Tujuan:
//  1. Enkripsi at-rest memakai Electron safeStorage (DPAPI di Windows, Keychain
//     di macOS, libsecret di Linux) bila tersedia — yaitu saat aplikasi berjalan
//     di dalam Electron. Saat dijalankan lewat `node server.js`, safeStorage
//     tidak ada dan file disimpan plaintext 0600 (dengan peringatan di log).
//  2. Tulis atomik (tmp + rename) supaya proses yang mati di tengah penulisan
//     tidak meninggalkan JSON korup.
//  3. Format kompatibel: file plaintext lama tetap bisa dibaca (migrasi diam-diam
//     ke format terenkripsi pada penyimpanan berikutnya).
const fs = require("fs");
const path = require("path");

const ENC_FORMAT = { flag: "__encrypted", version: 2 };

function safeStorage() {
  try {
    // Di dalam Electron, require("electron") mengembalikan API main process.
    // Di Node biasa ini berupa string path (tidak punya safeStorage).
    const electron = require("electron");
    if (electron && electron.safeStorage && typeof electron.safeStorage.isEncryptionAvailable === "function") {
      return electron.safeStorage;
    }
  } catch {}
  return null;
}

function encryptionInfo() {
  const store = safeStorage();
  const available = Boolean(store && store.isEncryptionAvailable());
  return {
    available,
    backend: available ? "electron-safeStorage" : "plaintext",
    // Aman dilaporkan ke UI: hanya status, bukan kunci/token.
    reason: available ? "" : (store ? "safeStorage tidak tersedia di runtime ini" : "bukan proses Electron")
  };
}

function readJson(file, fallback = {}) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return fallback;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (!parsed || typeof parsed !== "object") return fallback;
  if (parsed[ENC_FORMAT.flag]) {
    const store = safeStorage();
    if (!store || !store.isEncryptionAvailable()) {
      // File dienkripsi di mesin/user lain, atau runtime tanpa safeStorage.
      console.warn(`[secure-store] ${path.basename(file)} terenkripsi tetapi tidak bisa dibuka di runtime ini.`);
      return fallback;
    }
    try {
      const plain = store.decryptString(Buffer.from(String(parsed.data || ""), "base64"));
      const decrypted = JSON.parse(plain);
      return decrypted && typeof decrypted === "object" ? decrypted : fallback;
    } catch (error) {
      console.warn(`[secure-store] Gagal mendekripsi ${path.basename(file)}: ${error.message}`);
      return fallback;
    }
  }
  return parsed;
}

function writeJsonAtomic(file, data, { mode = 0o600 } = {}) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  try { fs.chmodSync(dir, 0o700); } catch {}

  const plain = JSON.stringify(data, null, 2);
  const store = safeStorage();
  const useEncryption = Boolean(store && store.isEncryptionAvailable());
  const body = useEncryption
    ? JSON.stringify({
        ...ENC_FORMAT,
        backend: "electron-safeStorage",
        data: store.encryptString(plain).toString("base64")
      }, null, 2)
    : plain;

  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, body, { mode });
  try { fs.chmodSync(tmp, mode); } catch {}
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, mode); } catch {}
  return { encrypted: useEncryption };
}

module.exports = {
  ENC_FORMAT,
  encryptionInfo,
  readJson,
  writeJsonAtomic
};
