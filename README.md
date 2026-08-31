# Photobooth Kiosk

Aplikasi photobooth layar-sentuh: pilih template → ambil foto (webcam **atau DSLR**) →
compositing frame → **cetak ke printer** / download via QR.

## Tech stack

- **Frontend**: Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui + Framer Motion
- **Data**: Firebase **Firestore** — dipanggil langsung dari browser, tanpa server sendiri
- **Agent**: `agent/index.cjs` — proses kecil di PC booth yang jalankan DSLR & printer

Convex / auth / server Express **sudah dihapus**. Tidak ada login; kiosk langsung terbuka.

## Arsitektur

```
[ Kiosk UI ]  --- internet --->  [ Firebase Firestore ]  <--- internet ---  [ Agent di PC booth ]
  Netlify / localhost              pb_config, pb_templates,                    DSLR (digiCamControl/
  (frontend statis)                 pb_photos, pb_jobs                          gphoto2) + printer
```

- Kiosk bisa dibuka **dari mana saja** (Netlify, atau `npm run dev` lokal) — semuanya
  baca/tulis langsung ke Firestore. Foto, template, config, pembukuan semua di sana.
- DSLR & printer **wajib** ada proses yang jalan fisik di PC booth (tidak bisa dari
  cloud) — itu tugas `agent/index.cjs`. Kiosk menaruh "perintah" (capture/print) di
  collection `pb_jobs`, agent yang mengerjakan lalu menulis hasilnya balik.
- **Tidak perlu server, port terbuka, atau tunnel** — agent cuma butuh koneksi
  internet keluar biasa ke Firebase.
- Tanpa agent (mis. belum dinyalakan), kiosk tetap jalan pakai **webcam** + tanpa
  cetak — cuma opsi DSLR/print yang nonaktif.

## Setup awal (sekali saja)

1. **Firebase project** — sudah dibuat & config-nya ada di `firebase.config.json`
   (aman untuk di-commit, bukan rahasia — akses diatur lewat Firestore Security Rules,
   bukan dengan menyembunyikan key ini).
2. **Firestore Rules** — Firebase Console → Firestore Database → tab **Rules**, isi:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /pb_config/{doc} { allow read, write: if true; }
       match /pb_templates/{id} {
         allow read, write: if true;
         match /chunks/{c} { allow read, write: if true; }
       }
       match /pb_photos/{id} {
         allow read, write: if true;
         match /chunks/{c} { allow read, write: if true; }
       }
       match /pb_jobs/{id} {
         allow read, write: if true;
         match /chunks/{c} { allow read, write: if true; }
       }
       match /{document=**} { allow read, write: if false; }
     }
   }
   ```
   (Kiosk tidak punya login — collection `pb_*` memang publik by design, tapi
   baris terakhir mengunci semua yang lain di project ini.)

```bash
npm install
```

## Menjalankan

```bash
npm run dev
```
→ http://localhost:5173 — jalan penuh (kamera, template, pembayaran, QR download)
tanpa perlu apa pun lagi selain internet.

### Mau DSLR & printer? Nyalakan agent juga (di PC booth)

```bash
npm run agent
```
atau **klik 2x `start-photobooth.bat`** (jalan di background, boleh tutup terminal).
`stop-photobooth.bat` untuk mematikan.

## Deploy ke Netlify (frontend)

Sudah dikonfigurasi (`netlify.toml`) — hubungkan repo GitHub ini ke Netlify (Site
configuration → Build & deploy → Link repository), setiap `git push` ke `main`
otomatis build & deploy. Build command `npm run build`, publish `dist`.

**Tidak perlu env var apa pun** — config Firebase sudah ikut ter-build dari
`firebase.config.json`. Agent (`start-photobooth.bat`) tetap harus jalan di PC booth
kalau mau DSLR/print aktif dari deploy Netlify ini juga.

## Panel Operator (admin)

Tombol **OPERATOR** di layar utama. Semua setelan tersimpan di Firestore (`pb_config`).

| Tab | Fungsi |
|---|---|
| **Frame Template** | Tambah/hapus frame, upload PNG, atur layout & jumlah pose, edit di Layout Editor, set default. Tersimpan permanen di Firestore. |
| **Kamera** | Countdown timer • sumber kamera: Webcam / DSLR–digiCamControl / DSLR–gphoto2 • Test Koneksi & Test Ambil Foto (butuh agent jalan) |
| **Printer** | Aktifkan cetak • pilih printer (daftar dari agent) • jumlah salinan • Auto-Print • perintah cetak kustom • Test Print (butuh agent jalan) |
| **Pembayaran** | Aktifkan • Tunai (default) • upload gambar QRIS • catatan |
| **Pembukuan** | Atur harga per sesi • pemasukan hari ini/total • export CSV • reset |

Setiap tab punya tombol **Simpan** — perubahan baru tersimpan (dan muncul toast
konfirmasi) setelah ditekan.

### Setup DSLR (Windows, direkomendasikan)

1. Colok DSLR ke PC booth via kabel USB.
2. Install **digiCamControl** (gratis). Buka → *File → Settings → Webserver* → centang **Enable** (port 5513).
3. Nyalakan agent (`start-photobooth.bat`).
4. Panel Operator → Kamera → pilih **DSLR — digiCamControl**, URL `http://localhost:5513` → **Simpan**.
5. Klik **Test Koneksi** lalu **Test Ambil Foto**.

Mac/Linux: install `gphoto2`, pilih **DSLR — gPhoto2**.
Alternatif tanpa software: keluarkan HDMI DSLR ke **HDMI capture card** → pilih **Webcam / Capture Card**.

### Setup Printer (kabel USB atau jaringan)

Printer apa pun yang **drivernya terpasang di PC booth** otomatis terbaca di daftar
(agent menjalankan `Get-Printer`) — USB, jaringan, thermal/dye-sub (DNP, Mitsubishi,
Canon SELPHY), semuanya.

1. Pasang printer + install drivernya di PC booth. Set **ukuran kertas / borderless**
   di *Printing Preferences* printer tsb.
2. Nyalakan agent.
3. Panel Operator → Printer → **Aktifkan Cetak** → pilih printer (atau biarkan kosong
   = printer default) → atur salinan → **Simpan**.
4. Opsional **Auto-Print** (cetak otomatis tiap sesi selesai).

Cetak dijalankan senyap: Windows `mspaint /pt "<file>" "<printer>"`, Linux/Mac `lp`.
Bisa diganti di "perintah cetak kustom" (placeholder `{file}` `{printer}` `{copies}`).

### Pembayaran (Tunai / QRIS — verifikasi manual)

Muncul **setelah pelanggan lihat hasil foto**, sebelum bisa cetak & scan QR download.

1. Panel Operator → Pembayaran → **Aktifkan**.
2. **Tunai**: tidak perlu setelan — pelanggan bayar ke petugas, petugas tekan "Sudah Bayar".
3. **QRIS (opsional)**: upload **screenshot QR "Terima Uang" / QRIS** dari e-wallet
   (SeaBank / DANA / GoPay / OVO / ShopeePay) atau QRIS merchant. Crop sampai hanya
   QR-nya — inilah yang bisa di-scan & dibayar pelanggan.

Tidak ada payment gateway — verifikasi manual, cukup untuk kios kecil, tanpa biaya
per transaksi.

## Download foto via QR

Setiap foto final di-upload ke Firestore (`pb_photos`, base64 dipecah jadi beberapa
dokumen kecil karena batas 1MB/dokumen Firestore). Layar "Download" menampilkan QR
`<url-kiosk>/d/<id>` — halaman itu (React route `/d/:id`) baca ulang & tampilkan
fotonya, bisa di-scan dari HP mana saja yang punya internet.

## Struktur

- `src/components/KioskApp.tsx` — seluruh alur kiosk + panel Operator
- `src/components/FrameCompositor.tsx` — render frame + upload + cetak
- `src/components/TemplateEditor.tsx` — Layout Editor per template
- `src/pages/Download.tsx` — halaman `/d/:id` untuk scan QR
- `src/lib/firebase.ts` — init Firebase App + Firestore
- `src/lib/firestoreBlob.ts` — helper simpan/baca string besar (foto/template) terpecah jadi beberapa dokumen
- `src/lib/api.ts` — semua akses data (photos, config, templates) + job queue (capture, print, printers)
- `agent/index.cjs` — proses lokal di PC booth: proses job dari `pb_jobs` (DSLR capture, list printer, cetak)
- `firebase.config.json` — config Firebase (dipakai kiosk & agent, aman di-commit)
- `server/index.cjs` — **legacy**, backend Express+SQLite lama; tidak dipakai lagi kecuali mau jalan 100% lokal tanpa Firebase (`node server/index.cjs`)
