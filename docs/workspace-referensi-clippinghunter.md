# Referensi: ClippingHunter → rencana workspace Clipper Studio

Sumber: https://clippinghunter.id/ (diakses 4 Nov 2026). Catatan ini mencatat
alur yang mereka jual, lalu memetakannya ke Clipper Studio yang sudah ada.

## 1. Alur yang mereka tonjolkan (3 langkah)

1. **Tempel link / pilih file** — satu input, tidak ada wizard.
2. **AI tandai momen terbaik** — video panjang dianalisis, setiap kandidat klip
   diberi **skor AI** (contoh di situs: 94, 91, 88) supaya user tinggal memilih.
3. **Atur gaya → export** — caption, layout, rasio; lalu **render semua klip
   sekaligus** ("Export semua").

Kalimat kuncinya: *"Hasil, preview, dan setelan di satu layar."* Mereka menjual
**satu layar**, bukan banyak tab.

## 2. Struktur workspace mereka (dari demo di halaman)

```
┌─────────────────────────────────────────────────────────────┐
│ 1  Video panjang   podcast-eps-47.mp4   16:9 · 1:12:40       │
│    [ player + timeline + scrub ]                            │
│    penanda momen: ● 94  ● 91  ● 88                          │
├──────────────────────────┬──────────────────────────────────┤
│ 2  AI ClippingHunter     │  Panel gaya                      │
│    "Klip jadi 0/3"       │   - Gaya caption (3 preset)      │
│    [94] Klip 1 · 0:42    │   - Animasi (pop/naik/zoom/…)    │
│    [91] Klip 2 · 0:38    │   - Efek (outline/glow/kotak)    │
│    [88] Klip 3 · 0:31    │   - Layout (facecam, split)      │
│    [ preview 9:16 ]      │   - Rasio (9:16 / 1:1 / 16:9)    │
│                          │   - Bahasa caption               │
│    [ Export semua ]      │   - Backsound                    │
└──────────────────────────┴──────────────────────────────────┘
```

Elemen yang berulang di semua section:

- **Skor AI sebagai badge angka** (94/91/88) — bukan bintang, bukan persen bar.
  Angka besar + warna hangat jadi hierarki visual utama.
- **Hitungan "Klip jadi 0/3"** — progres batch terlihat, bukan spinner.
- **Preview vertikal kecil per klip** di dalam daftar (bukan halaman terpisah).
- **Satu tombol besar** untuk aksi massal ("Export semua").
- **Caption = kontrol utama gaya**, dengan contoh langsung (3 variasi caption
  memperlihatkan klip yang sama berubah total).

## 3. Yang mereka TIDAK punya (peluang Clipper Studio)

- Tidak ada editor timeline multi-track; mereka sederhana.
- Tidak ada analisis hook/retensi per klip (kita punya `clipme-hook-engine`,
  `hook-learn`, audio emphasis).
- Tidak ada laporan kualitas caption (kita baru punya `coverage` + QA).
- Tidak ada queue job dengan watchdog (kita punya).

Artinya: kita tidak perlu meniru kesederhanaannya secara buta — tapi **struktur
satu layar + skor + batch export** itulah yang membuatnya terasa cepat.

## 4. Kondisi Clipper Studio sekarang

Sudah satu layar (`.workspace-layout`):
`kartu Sumber` → `Editor` (clips | preview | inspector) → `Export` (dilipat).

Kesenjangan terhadap referensi:

| Referensi | Clipper Studio | Dampak |
|---|---|---|
| Skor AI besar di daftar klip | skor ada di data, tampil kecil | user tidak tahu mana yang layak |
| "Klip jadi 0/3" | progres per job, bukan batch | tidak terasa seperti batch |
| Export semua | export 1 per 1 | lambat untuk workflow harian |
| Preview kecil di daftar | hanya preview klip aktif | harus klik untuk menilai |
| Preset gaya caption bernama | banyak kontrol terpisah | butuh eksperimen |
| Layout/facecam preset | ada camera director, tapi tersembunyi | fitur tidak terlihat |

## 5. Rencana penerapan (bertahap, tiap tahap bisa dirilis)

### Tahap 1 — "Momen" sebagai daftar keputusan (dampak terbesar)

- Ganti panel kiri jadi daftar kartu klip: **badge skor** (angka, warna per
  rentang), durasi, judul/hook 1 baris, thumbnail kecil.
- Klik kartu = preview + inspector ikut berubah (sudah ada mekanismenya).
- Urut default: skor tertinggi. Tambah filter: semua / belum diexport / siap.
- Tandai status per kartu: `belum` · `dirender` · `gagal`.

Target: user bisa memutuskan "ambil 5 klip teratas" tanpa membuka apa pun.

### Tahap 2 — Batch export + progres "Klip jadi 0/3"

- Checkbox per kartu + "Pilih 5 teratas".
- Tombol **Export terpilih (n)** → masuk queue yang sudah ada, satu per satu.
- Header batch: `Klip jadi 2/5` + progress bar + daftar antrean ringkas.
- Gagal satu klip tidak menghentikan sisanya; ringkasan di akhir.

Ini yang membuat alur terasa "puluhan klip, 5 menit".

### Tahap 3 — Preset gaya (caption + layout + rasio)

- Simpan kombinasi (gaya caption, animasi, efek, posisi, rasio, layout facecam)
  sebagai preset bernama: `Podcast tebal`, `Serif elegan`, `Kotak bersih`.
- Terapkan preset ke 1 klip atau ke semua klip terpilih.
- Tiga preset bawaan mengikuti referensi; semua parameter sudah ada di app.

### Tahap 4 — Polish "satu layar"

- Timeline sumber dengan penanda momen (skor) — klik penanda = pindah klip.
- Ringkas inspector: sembunyikan kontrol lanjutan di balik "Advanced".
- Empty state yang mengarahkan: satu kolom input + "Buat klip".

## 6. Yang sengaja TIDAK ditiru

- **Klaim "tanpa kredit/tanpa limit"** — kita pakai model lokal, jadi klaim itu
  jujur untuk kita, tapi jangan dijual sebagai janji pemasaran di dalam app.
- **Timeline super sederhana** — kita sudah punya kontrol lebih; menyembunyikan
  semuanya akan menghilangkan keunggulan.
- **Skor AI sebagai satu-satunya dasar** — kita punya hook/retensi; tampilkan
  skor sebagai angka utama, detailnya di inspector.

## 7. Ukuran keberhasilan

- Waktu dari "video selesai dianalisis" → "5 klip terunduh" < 3 menit.
- Jumlah klik untuk export 5 klip: ≤ 3 (pilih 5 teratas → export).
- Tidak ada halaman yang perlu dibuka selain workspace.
