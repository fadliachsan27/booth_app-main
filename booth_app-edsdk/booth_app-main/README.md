# Photobooth Kiosk

Aplikasi photobooth layar-sentuh: pilih template → ambil foto (webcam **atau DSLR**) →
compositing frame → **cetak ke printer** / download via QR.

## Tech stack

- **Frontend**: Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui + Framer Motion
- **Backend**: Express + SQLite (`node:sqlite`, tanpa native build) — `server/index.cjs`

Convex / auth **sudah dihapus**. Tidak ada login; kiosk langsung terbuka.

## Arsitektur (penting untuk DSLR / printer)

```
[ Tablet / layar sentuh ]  --- WiFi --->  [ PC "host" di booth ]
   browser buka                              - server/index.cjs  (port 4000)
   http://<ip-host>:5173                      - digiCamControl / gphoto2  (DSLR via kabel USB)
                                              - printer terpasang di Windows
```

DSLR & printer **tidak bisa** dikendalikan langsung dari browser. Server photobooth
di PC host yang menjalankannya. Tablet cukup membuka alamat web PC host.
Semua tetap jalan dengan **webcam + tanpa printer** kalau host tidak dipakai.

## Cara pakai — pilih salah satu

Aplikasi ini = **frontend + server Node + SQLite** dalam 1 repo. Server (`npm start`)
juga menyajikan frontend, jadi **cukup 1 deploy**.

| | Cocok untuk | Foto/QR download | DSLR kabel | Printer |
|---|---|---|---|---|
| **A. Lokal di PC booth** | booth dengan DSLR + printer | ✅ (LAN) | ✅ | ✅ |
| **B. Deploy ke Render/Railway** | booth pakai webcam, mau QR bisa discan dari mana saja | ✅ (public URL) | ❌ | ❌ (pakai dialog print browser) |

> **Netlify/Vercel TIDAK bisa** — cuma hosting statis, server Node tidak jalan.

### A. Lokal (di PC booth)

```bash
npm install
npm run dev
```

Tablet buka `http://<ip-PC-booth>:5173`. PC + tablet di WiFi sama.

### B. Deploy 1-service ke Render (webcam mode)

1. Push repo ini ke GitHub.
2. [render.com](https://render.com) → **New → Blueprint** → pilih repo → **Apply**.
   (`render.yaml` sudah ada — build & start otomatis.)
3. Selesai. Buka URL yang dikasih Render (mis. `https://photobooth-xxx.onrender.com`).
   QR download otomatis pakai URL itu → pengunjung bisa scan dari HP mana saja.

- `render.yaml` sudah pakai plan **free** — build command `npm install && npm run build`,
  start `npm start`, tanpa disk. Kalau Render minta bayar, pastikan pilih
  instance **Free** dan JANGAN tambah Disk.
- Free: foto/DB hilang tiap redeploy (tidak masalah — pengunjung download saat
  acara, setting & template tersimpan di browser). Service tidur setelah ~15 mnt
  idle (cold start ~30 dtk).
- Mau permanen: plan **starter** ($7/bln) + Disk mount `/data` + env `DATA_DIR=/data`.

## Menjalankan manual (build + serve, 1 port)

```bash
npm install
npm run build     # hasil di dist/
npm start         # server + frontend di http://localhost:4000
```

- Frontend: http://localhost:5173  (dari tablet: `http://<ip-host>:5173`)
- Server:   http://localhost:4000
- `npm run dev` menjalankan keduanya. Terpisah: `npm run dev:web` / `npm run dev:api`.

## Panel Operator (admin)

Tombol **OPERATOR** di layar utama. Semua setelan tersimpan di `server/data/booth.db`.

| Tab | Fungsi |
|---|---|
| **Frame Template** | Tambah/hapus frame, upload PNG, atur layout & jumlah pose, edit di Layout Editor, set default. Tersimpan permanen di server. |
| **Kamera** | Countdown timer • sumber kamera: Webcam / DSLR–Canon EDSDK / DSLR–digiCamControl / DSLR–gphoto2 • Test Koneksi & Test Ambil Foto |
| **Printer** | Aktifkan cetak • pilih printer (daftar dari OS) • jumlah salinan • Auto-Print • perintah cetak kustom • Test Print |
| **Pembayaran** | Aktifkan • Tunai (default) • upload gambar QRIS • catatan |
| **Pembukuan** | Atur harga per sesi • pemasukan hari ini/total • export CSV • reset |

### Setup DSLR

Ada tiga cara. Untuk kamera **Canon EOS**, pakai yang pertama.

#### 1. Canon EDSDK — direkomendasikan (tanpa software tambahan)

Canon EOS Digital SDK 13.20.10 sudah tertanam di aplikasi (`server/edsdk/`).
Tidak perlu install apa pun selain `npm install`.

> Pakai **`npm install`**, jangan `bun install` — `bun.lock` di repo ini dibuat sebelum
> dependensi `koffi` ditambahkan, jadi bun akan melewatkannya dan EDSDK gagal load.

1. Colok Canon EOS ke PC host via **kabel USB data**.
2. Nyalakan kamera. Mode dial di **M / Av / Tv** — jangan posisi video.
3. Kualitas gambar di **JPEG** (atau RAW+JPEG). Kalau RAW-only, hasilnya tidak bisa dipakai.
4. **Tutup EOS Utility / digiCamControl / Lightroom**, termasuk icon di system tray.
   Kamera cuma bisa dipegang satu aplikasi.
5. Tes dulu tanpa aplikasi:

   ```bash
   npm run edsdk:check -- --all
   ```

   Ini connect ke kamera, ambil 1 foto uji, dan 1 frame live view. Hasilnya masuk ke
   `server/data/edsdk-check/`. Kalau langkah ini gagal, masalahnya di kamera/kabel —
   tidak ada gunanya lanjut ke aplikasi.
6. Panel Operator → Kamera → pilih **DSLR Canon — EDSDK (langsung)** → **Simpan** →
   **Test Koneksi** → **Test Ambil Foto**.

Syarat: **Node 64-bit** (Node 32-bit ditolak). Windows x64, Linux x64/ARM.
Detail teknis & batasan: [`server/edsdk/README.md`](server/edsdk/README.md).

Foto disimpan ke PC (`SaveTo=Host`), **bukan** ke kartu memori kamera. Live view mati
sendiri setelah 6 detik menganggur supaya kamera tidak panas.

#### 2. digiCamControl (Windows, untuk kamera non-Canon)

1. Colok DSLR ke PC host via kabel USB.
2. Install **digiCamControl** (gratis). Buka → *File → Settings → Webserver* → centang **Enable** (port 5513).
3. Di panel Operator → Kamera → pilih **DSLR — digiCamControl**, URL `http://localhost:5513`.
4. Klik **Test Koneksi** lalu **Test Ambil Foto**.

#### 3. gPhoto2 (Mac/Linux) atau HDMI capture card

Install `gphoto2`, pilih **DSLR — gPhoto2**.
Alternatif tanpa software: keluarkan HDMI DSLR ke **HDMI capture card** → pilih **Webcam / Capture Card**.

### Setup Printer (kabel USB atau jaringan)

Printer apa pun yang **drivernya terpasang di Windows PC host** otomatis terbaca
di daftar (`Get-Printer`) — USB, jaringan, thermal/dye-sub (DNP, Mitsubishi,
Canon SELPHY), semuanya.

1. Pasang printer + install drivernya di Windows PC host. Set **ukuran kertas /
   borderless** di *Printing Preferences* printer tsb.
2. Panel Operator → Printer → **Aktifkan Cetak** → pilih printer (atau biarkan
   kosong = printer default Windows) → atur salinan.
3. Opsional **Auto-Print** (cetak otomatis tiap sesi selesai).

Cetak dijalankan senyap: Windows `mspaint /pt "<file>" "<printer>"`, Linux/Mac `lp`.
Bisa diganti di "perintah cetak kustom" (placeholder `{file}` `{printer}` `{copies}`).

### Pembayaran (ATM / dompet digital — verifikasi manual)

Muncul **setelah pelanggan lihat hasil foto**, sebelum bisa cetak & scan QR download.

Pilihan bayar: **Tunai** (selalu ada) dan **Scan QRIS** (kalau QRIS diupload).

1. Panel Operator → Pembayaran → **Aktifkan**.
2. **Tunai**: tidak perlu setelan — pelanggan bayar ke petugas, petugas tekan "Sudah Bayar".
3. **QRIS (opsional)**: upload **screenshot QR "Terima Uang" / QRIS** dari e-wallet
   kamu (SeaBank / DANA / GoPay / OVO / ShopeePay) atau QRIS merchant. Crop sampai
   hanya QR-nya. Ini yang bisa di-scan & dibayar pelanggan.
4. Layar bayar menampilkan nominal + pilihan Tunai/QRIS. Setelah dibayar, petugas
   tekan **"Sudah Bayar"** → lanjut ke cetak & QR download.

Tidak ada payment gateway — verifikasi manual, cukup untuk kios kecil, tanpa biaya
per transaksi. Kalau butuh auto-verifikasi (QRIS dinamis), perlu integrasi
Midtrans/Xendit terpisah.

## Download foto via QR

Setiap foto final di-upload ke server, disimpan di `server/data/uploads/` + 1 baris
di `booth.db` (sekaligus data pembukuan). Layar "Download" menampilkan QR
`http://<ip-host>:4000/d/<id>` → HP pengunjung (WiFi sama) scan → tombol Download.

## Konfigurasi (opsional) — `.env`

| Var | Default | Guna |
|---|---|---|
| `PORT` | `4000` | port server |
| `PUBLIC_BASE_URL` | `http://<LAN-IP>:PORT` | URL di dalam QR (set ke tunnel bila HP beda jaringan) |
| `VITE_API_URL` | `http://<host>:4000` | alamat server dari sisi frontend |
| `EDSDK_LIB` | SDK bawaan di `server/edsdk/vendor/` | path manual ke `EDSDK.dll` / `libEDSDK.so` |

## Struktur

- `src/components/KioskApp.tsx` — seluruh alur kiosk + panel Operator
- `src/components/FrameCompositor.tsx` — render frame + upload + cetak
- `src/components/TemplateEditor.tsx` — Layout Editor per template
- `src/lib/api.ts` — client ke server (photos, config, templates, capture, print)
- `server/index.cjs` — backend: photos, config, templates, `/api/capture`, `/api/print`, `/api/printers`
- `server/edsdk/` — Canon EDSDK: capture tethered + live view ([detail](server/edsdk/README.md))
- `scripts/edsdk-check.cjs` — self-test kamera Canon (`npm run edsdk:check -- --all`)
