# Clipper Studio

Aplikasi lokal untuk mengubah URL YouTube menjadi short clips.

## Prasyarat & Setup

Kode Node tidak punya dependency npm untuk mode server, tetapi aplikasi butuh tiga hal di luar kode:

1. **Node.js ≥ 18** — `node server.js` langsung jalan. Untuk mode desktop/packaging: `npm install` (electron + electron-builder).
2. **Binary media** di folder `bin/` — atau lewat env `FFMPEG_PATH` / `FFPROBE_PATH` / `YTDLP_PATH` / `CLIPFORGE_BIN_DIR`:
   - `ffmpeg.exe`, `ffprobe.exe` (build "full"): https://www.gyan.dev/ffmpeg/builds/
   - `yt-dlp.exe`: https://github.com/yt-dlp/yt-dlp/releases

   Binary yang sudah ada di `PATH` sistem ikut terdeteksi otomatis. Statusnya dicetak saat startup (`[Tool] OK/MISS ...`) dan tersedia di `GET /api/system` → `tools`.
3. **Python venv di root repo** untuk STT lokal + terjemahan offline:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install --upgrade pip
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   ```

   `requirements.txt` memuat pin versi, termasuk **av==18.1.0** — av 19 mematahkan faster-whisper 1.2.1 (`metadata_errors` dihapus).
   Venv di lokasi lain: set `CLIPFORGE_VENV_PYTHON=C:\path\ke\.venv\Scripts\python.exe`.
4. **Model STT** tidak ikut di repo (`models/` hanya metadata). faster-whisper mengunduh model `tiny` sekali saat dipakai pertama kali (butuh internet), atau sediakan folder datar `models/<nama>/model.bin` — bila ada, model itu dipakai tanpa jaringan dan ikut dibawa saat `npm run dist`. Model wajah (YuNet) diunduh lewat tombol **Download Models**.
5. **Verifikasi**: buka `http://localhost:4173/api/system` — `tools.ffmpeg.available`, `tools.ffprobe.available`, `tools.ytdlp.available`, dan `pythonAvailable` harus `true` sesuai fitur yang dipakai.

## Cara menjalankan

```powershell
node server.js          # mode server + browser
npm run desktop         # mode aplikasi Electron (butuh npm install)
```

Lalu buka:

```text
http://localhost:4173
```

## Fitur yang sudah berfungsi

- Paste URL YouTube (bisa beberapa URL sekaligus, satu per baris, maksimal 10 — diproses batch dan masuk Library).
- Baca metadata YouTube dengan `yt-dlp` tanpa download full video.
- Ambil transcript/subtitle YouTube bila tersedia.
- Jika YouTube tidak menyediakan transcript, aplikasi bisa mencoba speech-to-text dari audio clip.
- OpenAI STT aktif otomatis jika `OPENAI_API_KEY` tersedia.
- Local Whisper aktif otomatis jika `.venv` berisi `faster-whisper`.
- Buat kandidat clip dari transcript, durasi, dan pacing/silence (skor retensi dihitung heuristik dari transcript + sinyal audio; heatmap retention belum tersedia).
- Auto caption dari teks transcript di rentang clip.
- Viral score sederhana berbasis kata kunci, pertanyaan, kepadatan ucapan, dan pacing.
- **ClipMe Intelligence Engine**: analisis clip multi-kriteria (hook strength, retention, value, story completeness, context independence, emotional impact, shareability, comment, quotability, rewatch) dengan score 0-100 + hard caps, 16 hook types, original vs recommended source hook (reorder aman), 3 caption variants, CTA, discussion question, hashtags, source evidence, dan quality gate. Tampil di tab **Intel** pada inspector.
- **Mode LLM**: jika `OPENAI_API_KEY` tersedia, analisis Intel diproses model AI dengan system prompt `clipme-prompt.js`. Tanpa API key, otomatis fallback ke engine heuristic lokal.
- Preview clip langsung di aplikasi dengan cached YouTube section resolusi ringan.
- Thumbnail clip menampilkan status `Needs preview`, `Loading`, atau `Ready`.
- Edit caption clip.
- Pilih rasio export: 9:16, 16:9, atau 1:1.
- Saat export, hanya section clip terpilih yang diambil lalu diproses dengan `ffmpeg`.
- Caption overlay ikut masuk ke file MP4.
- Export berjalan sebagai job queue dengan status progress.
- Library dan Exports punya view tersendiri.
- Export bisa memakai section preview yang sudah dicache agar lebih cepat.
- STT tidak lagi dijalankan untuk seluruh video di awal.
- Analyze URL default memakai metadata ringan agar jauh lebih cepat.
- Default terbaru memakai fast mode: paste URL langsung membuat kandidat clip. Durasi tetap diambil lewat `yt-dlp --skip-download` (timeout 5 menit); kalau gagal, dipakai durasi asumsi agar alur tidak berhenti.
- Jika caption belum tersedia, STT berjalan on-demand hanya untuk clip yang dipreview/export.
- Queue membatasi pekerjaan berat agar tidak saling menabrak.
- **Timeline caption editor**: blok caption bisa digeser (drag) dan di-resize dari kiri/kanan, zoom dengan Ctrl+scroll, geser timeline dengan scroll, klik area kosong untuk seek, Space untuk play/pause.
- **Export SRT**: tombol `Export SRT` pada panel Caption Timeline menghasilkan file `.srt` untuk clip aktif.
- **Import SRT/VTT**: tombol `Import SRT/VTT` membaca file subtitle lalu memuat segmen ke timeline caption untuk clip aktif.
- **Gabung clip jadi satu video**: tombol `Gabung jadi 1` mengekspor setiap clip pilihan (atau semua) lalu menggabungkannya menjadi satu MP4 via ffmpeg concat.
- **Export ke folder per project**: hasil export disimpan di `outputs/<nama-project>-<id>/` lengkap dengan file `info.txt` berisi rentang waktu, rasio, caption, dan hook untuk tiap clip.
- **Undo/Redo**: tombol `Undo`/`Redo` (atau `Ctrl+Z`/`Ctrl+Y`) memulihkan urutan clip dan hasil trim sebelumnya.
- **Trim dengan drag**: handle di kiri/kanan pada progress track bisa diseret untuk mengubah awal/akhir clip aktif.
- **Reorder clip**: kartu clip bisa diseret (drag & drop) untuk mengubah urutan clip.
- **Hapus project per-baris**: tombol `Hapus` di setiap baris Library menghapus project beserta file-nya.
- **Cari kata di caption**: kotak pencarian di panel Caption Timeline menyorot segmen yang cocok.
- **Terjemahkan caption (offline)**: tombol `Terjemahkan` di panel Caption Timeline menerjemahkan semua segmen ke bahasa pilihan (Indonesia/English) via Argos Translate lokal — tanpa API key. Auto-caption juga diterjemahkan otomatis ke bahasa pilihan bila bahasa asli video berbeda.
- **Pilih model STT**: dropdown `Model STT (offline)` di tab Settings menampilkan model Faster-Whisper yang tersedia di server.

## Cut-to-Face Mode Lite (active-speaker tracking offline)

Mode ini mengikuti wajah **speaker aktif** secara otomatis untuk crop dinamis
(Speaker Cut). Seluruh pipeline gratis, offline, dan open-source:

- **OpenCV FaceDetectorYN (YuNet)** — API resmi `cv2.FaceDetectorYN.create`
  dari OpenCV Zoo (lisensi **MIT**), menggantikan `readNetFromONNX` manual.
- **Haar cascade profile** (`haarcascade_profileface.xml`, lisensi **Apache-2.0**)
  membantu mendeteksi wajah menyamping kiri/kanan yang terlewat YuNet.
- **Adaptive face sampling**: default **3 FPS**, maksimal **5 FPS**.
- **Persistent `track_id`** via IoU + centroid tracking — tanpa face
  recognition/identity embedding.
- **Mouth-motion scoring**: normalized mouth ROI pixel difference + Farneback
  optical flow.
- **Pemilihan active speaker** berdasarkan mouth motion, detector confidence,
  track confidence, speaker timeline, dan kontinuitas track.
- **Hysteresis minimal dua frame** agar kamera tidak pindah karena satu frame
  noise.
- **Hold ~1,1 detik** ketika deteksi wajah aktif hilang sementara.
- **Look-room**: framing bergeser ke arah pandangan wajah.
- Association di-compact ke **maksimal 48** agar command FFmpeg tidak melewati
  batas panjang Windows (`CreateProcess` ~8191 karakter).
- Preview CSS Cut-to-Face dan dynamic crop FFmpeg memakai **association
  timeline yang sama**.
- UI **Analyze Speaker Cut** menampilkan `track_id` aktif dan metadata
  mouth-motion per association.
- Cache lama (schema v1: hanya `x, y, w, h, confidence` tanpa `track_id`)
  tetap kompatibel.

### Kebijakan model & offline (requirement pipeline)

- **Tidak** menggunakan SCRFD, InsightFace, TalkNet, cloud API, atau model
  berlisensi komersial yang belum jelas.
- Analisis video **tidak melakukan request jaringan apa pun**.
- YuNet diunduh **hanya** lewat tombol **"Download Models"** (subcommand
  `yunet-download`), bukan otomatis saat analisis.
- Metadata lisensi model disimpan di `models/MODELS-METADATA.json` setelah
  unduhan.

### File terkait

- `clipme-face-detect.py` — deteksi + tracking + mouth motion (backend Python).
- `clipme-active-speaker.js` — engine pemilihan active speaker + look-room +
  kompaksi association (browser & Node).
- `clipme-localai.js` — integrasi provider, asosiasi speaker↔wajah, filter FFmpeg.
- `clipme-cut-to-face.js` — transform CSS preview.
- `mode-lite-test.js` — verifikasi Mode Lite JS.
- `test_face_lite.py` — verifikasi Python (tanpa cv2).

Keduanya (`clipme-face-detect.py` & `clipme-speaker-detect.py`) sudah masuk
`asarUnpack` agar dapat dieksekusi langsung di Electron packaged app.

## Catatan

Gunakan hanya video yang memang boleh kamu download/proses. Jika video tidak punya subtitle/manual caption/auto caption dan tidak ada STT provider aktif, aplikasi tetap membuat clip dari durasi video sebagai fallback.

## GPU / CPU Acceleration

Fitur opsional LocalAI untuk speaker cut / cut-to-face otomatis. **Nonaktif secara default** — aktifkan lewat toggle *Speaker Cut* / *Face tracking* di Inspector → Settings setelah model & Python tersedia. Pipeline memakai `clipme-localai.js` + `clipme-speaker-detect.py` + `clipme-face-detect.py`.

Cara kerjanya:

1. Deteksi speaker berbasis energy + spectral clustering (NO ground-truth). Speaker timeline dianalisis dari audio dengan ffmpeg silencedetect + astats sebagai fallback universal — tanpa dependency wajib untuk dijalankan.
2. Face detection lokal optional. YuNet (~340KB, lisensi MIT) **tidak** diunduh otomatis saat analisis — ambil lewat tombol **Download Models** (`POST /api/localai/download-model`), lalu disimpan di `models/face/`. Rantai backend: YuNet → Haar cascade profile → `skipped-no-backend`.
3. Speaker↔face association tanpa persistent tracking: pilih frame di interval speaker yang paling mungkin berisi wajah, lalu crop weighted face ke tengah scene. Untuk satu-speaker aktif, hasil stabil.
4. Setelah **Analyze Speaker Cut**, preview menerapkan crop secara real-time lewat CSS pan/zoom (tanpa render ulang FFmpeg). Timeline yang sama dipakai oleh filter crop dinamis saat export agar perpindahan wajah konsisten.

Output JSON: `{ speakerTimeline, faceTimeline?, associations?, identity, source }`.

Pipeline 100% offline (no cloud). Optimalkan CLIPFORGE_ACCEL ambiance `auto|cpu|gpu`:

```powershell
$env:CLIPFORGE_ACCEL="auto"   # default
$env:CLIPFORGE_ACCEL="cpu"    # force CPU
$env:CLIPFORGE_ACCEL="gpu"    # coba pakai GPU kalau tersedia
```

## Local Stack

- **clipme-localai.js**: Node provider abstraction dengan 2 backend tier (energy + real pyannote).
- **clipme-speaker-detect.py**: Python analyzer speaker diarization. 3-level fallback: `pyannote.audio` (jauh terbaik), `numpy spectral clustering`, ffmpeg silencedetect (selalu).
- **clipme-face-detect.py**: Python analyzer face detection. Fallback nyata: `OpenCV DNN (YuNet)` → `Haar cascade profile` → graceful-skip (`skipped-no-backend`) kalau OpenCV tidak ada. Tidak memakai MediaPipe.

UI Panel "AI Engine" di Inspector > Settings tab expose:

- Panel toggle "Speaker Cut" + "Face tracking" (checkbox).
- 4 status row (Speaker / Face / Runtime / Backend) yang real-time.
- 2 tombol: "Analyze Speaker Cut" (POST /api/localai/analyze) + "Download Models" (POST /api/localai/download-model).

Endpoints ada di server.js:

- `GET /api/localai/status` → returns `{ aiBackend: { speaker, face }, runtime, hardware }`.
- `POST /api/localai/analyze` → returns speakerTimeline + faces + associations.
- `POST /api/localai/download-model` → trigger face model auto-download.

Cache: `analyzeForSpeakerCut()` caching by sha256(audioPath) + sha256(videoPath). Re-run di clip yang sama nggak re-run pipeline.

## Akselerasi GPU / CPU (runtime)

Clipper Studio secara otomatis mendeteksi hardware dan memilih runtime terbaik:

| Komponen | CPU-only | NVIDIA GPU + CUDA | GPU tanpa CUDA |
|----------|----------|-------------------|----------------|
| **STT** (faster-whisper) | CPU (int8) | GPU (float16) | CPU (auto-fallback) |
| **Video Encoding** | libx264 | h264_nvenc (NVENC) | NVENC bila runtime valid, selain itu libx264 |
| **UI Rendering** | Chromium CPU | Chromium GPU | Chromium GPU |

Saat startup, aplikasi tidak hanya membaca daftar encoder FFmpeg: satu frame uji benar-benar di-encode untuk memastikan driver NVIDIA/`nvcuda.dll` bisa dipakai. Jika NVENC masih gagal saat export, proses otomatis menghapus output kosong dan mengulang sekali dengan `libx264` (CPU); export berikutnya tetap memakai CPU selama sesi tersebut.

### Mode Runtime

| Mode | Deskripsi |
|------|-----------|
| `AUTO` (default) | Deteksi hardware otomatis → GPU jika kompatibel, CPU jika tidak |
| `CPU` | Paksa semua komponen pakai CPU |
| `GPU` | Paksa GPU (dengan fallback) |

### Set mode manual

```powershell
$env:CLIPFORGE_ACCEL="cpu"    # force CPU
$env:CLIPFORGE_ACCEL="gpu"    # force GPU
$env:CLIPFORGE_ACCEL="auto"   # default
node server.js
```

### Cek status hardware

Panel `Local Engine` di sidebar menampilkan runtime, CPU, GPU, dan status acceleration.

### Persyaratan GPU

- **NVIDIA GPU** dengan driver yang mendukung CUDA 11.8+
- **Python venv** dengan `faster-whisper` dan `ctranslate2` yang di-build dengan CUDA
- **FFmpeg** dengan `h264_nvenc` encoder (biasanya sudah termasuk di build resmi)

Untuk install venv dengan CUDA:
```powershell
.\\.venv\\Scripts\\python.exe -m pip install --upgrade pip
.\\.venv\\Scripts\\python.exe -m pip install nvidia-cublas-cu12 nvidia-cudnn-cu12
.\\.venv\\Scripts\\python.exe -m pip install faster-whisper
```

## Speech-to-text

OpenAI:

```powershell
$env:OPENAI_API_KEY=sk-xxxxxxxx
node server.js
```

Model default: `gpt-4o-mini-transcribe`. Bisa diganti:

```powershell
$env:OPENAI_TRANSCRIBE_MODEL="gpt-4o-transcribe"
node server.js
```

Model analisis ClipMe Intel default: `gpt-4o-mini`. Bisa diganti:

```powershell
$env:CLIPME_ANALYZE_MODEL="gpt-4o"
node server.js
```

Local faster-whisper (buat venv di folder proyek ini):

```powershell
cd "D:\PROJEK CODING\Clipper_Studio\ClipperStudio"
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install faster-whisper
node server.js
```

Atau jika venv di lokasi lain, set env var:

```powershell
$env:CLIPFORGE_VENV_PYTHON="C:\path\ke\.venv\Scripts\python.exe"
node server.js
```

Terjemahan caption offline (Argos Translate — model `id`↔`en` diunduh sekali, ~100 MB):

```powershell
.\.venv\Scripts\python.exe -m pip install argostranslate
node server.js
```

Model terjemahan lain bisa di-pre-download sebelum dipakai:

```powershell
.\.venv\Scripts\python.exe stt-engine.py translate --text "Halo" --from id --to en
```

Model default local STT adalah `tiny` di CPU dengan `int8` (tercepat). Model `small` **tidak** ikut ter-bundle di repo — unduh sekali lewat faster-whisper atau taruh di `models/small/`. Bisa diganti:

```powershell
$env:LOCAL_WHISPER_MODEL="base"
$env:LOCAL_WHISPER_DEVICE="cpu"
$env:LOCAL_WHISPER_COMPUTE_TYPE="int8"
node server.js
```

Mode cepat tanpa STT on-demand:

```powershell
$env:CLIPFORGE_ON_DEMAND_STT="0"
node server.js
```

Jika ingin analyze sekaligus mencoba subtitle YouTube penuh:

```powershell
$env:CLIPFORGE_DEEP_ANALYZE="1"
$env:CLIPFORGE_ANALYZE_TRANSCRIPT="1"
node server.js
```

Jumlah job berat paralel default adalah 2. Bisa diubah:

```powershell
$env:CLIPFORGE_MAX_JOBS="1"
node server.js
```

## Build installer

```powershell
npm install          # electron + electron-builder
npm run pack         # dist/win-unpacked (tanpa installer)
npm run dist         # dist/Clipper Studio Setup <versi>.exe
```

Yang ikut dibundel lewat `extraResources`: `bin/` (ffmpeg, ffprobe, yt-dlp), `.venv/` (runtime Python + faster-whisper + Argos + OpenCV), dan `models/`.

Penting untuk `.venv`:

- Venv harus **portable**. Venv yang dibuat dari Python “shared” bisa berisi junction ke instalasi Python lain — paket jadi rusak di mesin user dan `npm run dist` gagal di tahap 7-Zip (`WARNING: The directory name is invalid`).
- Repo ini memakai **Python embeddable** (python-3.13.x-embed-amd64) di `.venv\Scripts`, dengan `python313._pth` berisi `python313.zip`, `.`, `..\Lib\site-packages`, `import site`.
- Verifikasi cepat: `Get-ChildItem .venv -Recurse | Where-Object LinkType` harus kosong.
- `stt-engine.py` menambahkan folder dirinya ke `sys.path` supaya `import stt` tetap jalan di mode isolated Python embeddable.

## Pengujian

```powershell
npm test
```

34 program dijalankan berurutan (berhenti di kegagalan pertama). Catatan:

- Suite yang butuh `bin/ffmpeg.exe` (upload/export/preview E2E) akan **SKIP** dengan pesan jelas bila binary tidak ada — tidak menggagalkan rantai.
- Semua suite memakai data dir sementara (`CLIPFORGE_DATA_DIR`), jadi `npm test` tidak menyentuh project/export nyata.
- `node --check` menyapu seluruh file `.js`; `python -m py_compile` untuk file Python.

## Keamanan lokal (penting)

Server ini dirancang hanya untuk mesin sendiri:

- Default bind `127.0.0.1`. Selama bind loopback, setiap request wajib membawa header `Host` milik server itu sendiri (memblokir DNS rebinding) dan `Origin` yang persis sama untuk request non-GET.
- `HOST=0.0.0.0` membuka API ke jaringan, jadi server **otomatis membuat token** dan mencetak URL ber-token di log (`http://<ip>:4173/?token=...`). Navigasi pertama memasang cookie `clipper_token` (HttpOnly, SameSite=Strict); tanpa token, seluruh `/api/*` menjawab `401`. Token bisa dipatok lewat `CLIPFORGE_API_TOKEN`.
- Token OAuth & client secret disimpan di `~/.clipper-studio/` (di luar repo). Di aplikasi desktop file dienkripsi `safeStorage` (DPAPI/Keychain/libsecret); lewat `node server.js` enkripsi tidak tersedia sehingga file ditulis plaintext dengan permission 0600 (di Windows `chmod` tidak berefek). Statusnya ada di `GET /api/system` → `credentials.socialTokens`.

## Mengatasi blokir YouTube (HTTP 429 / "Sign in to confirm you're not a bot")

Download YouTube kadang diblokir karena rate limit atau bot check. yt-dlp sudah
mencoba beberapa client (`android_vr`, `ios`, `default`, lalu `tv` — prioritas
resolusi lalu ketahanan anti-bot). Jika masih
terblokir, berikan autentikasi lewat cookies:

- **Dari file cookies.txt** (format Netscape, bisa diekspor lewat ekstensi browser):
  ```powershell
  $env:YTDLP_COOKIES="C:\path\ke\cookies.txt"
  node server.js
  ```
- **Langsung dari browser** (browser harus sudah login ke YouTube):
  ```powershell
  $env:YTDLP_COOKIES_FROM_BROWSER="chrome"   # atau edge, firefox
  node server.js
  ```

Cara mengekspor cookies.txt: https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp
