# Canon EDSDK — catatan teknis

Binding langsung ke **Canon EOS Digital SDK 13.20.10** lewat FFI (`koffi`).
Dipakai kalau sumber kamera di panel Operator diset ke **DSLR Canon — EDSDK (langsung)**.

Bedanya dengan opsi DSLR yang lain: tidak butuh aplikasi perantara. digiCamControl
butuh instalasi + web server aktif, gphoto2 butuh binary terpisah. EDSDK dipanggil
langsung dari proses Node.

## Isi folder

```
server/edsdk/
  index.cjs           binding + manajemen sesi kamera
  errors.cjs          130 kode error EDSDK (di-generate dari EDSDKErrors.h)
  vendor/
    win-x64/          EDSDK.dll, EdsImage.dll, IHL/       ← Windows 64-bit
    linux-x64/        libEDSDK.so
    linux-arm64/      libEDSDK.so                          ← Raspberry Pi 64-bit
    linux-arm32/      libEDSDK.so
```

`DPP4Lib/` dari SDK asli **tidak** disertakan (226 MB). Itu hanya untuk RAW
development (`EdsCreateImageRef` / `EdsSaveImage`), yang tidak dipakai photobooth —
kita ambil JPEG apa adanya dari kamera.

macOS: SDK-nya ada di `Macintosh/Macintosh.dmg.zip` di dalam zip Canon. Extract
`EDSDK.framework` ke `vendor/macos/`, lalu set env `EDSDK_LIB` ke binary di dalamnya.

## Cara kerja

1. `EdsInitializeSDK()` sekali, lalu `EdsGetEvent()` dipompa tiap 50 ms. Ini yang
   mengantarkan event dari kamera — tanpa ini, foto tidak pernah sampai.
2. `EdsOpenSession` → set `SaveTo = Host` → `EdsSetCapacity`. Foto **tidak** ditulis
   ke kartu memori kamera; langsung dikirim ke PC.
3. Shutter: `PressShutterButton(Completely)`. Kalau AF gagal, ulang dengan
   `Completely_NonAF`. Kalau body-nya tidak merespons, fallback ke `TakePicture`.
4. Kamera mengirim event `DirItemRequestTransfer` → file di-download ke memory
   stream → dibaca jadi Buffer JPEG. Tidak lewat file sementara, jadi path berisi
   karakter non-ASCII (nama user Windows misalnya) tidak jadi masalah.
5. Live view: `Evf_OutputDevice = PC`, lalu `EdsDownloadEvfImage` per frame.
   Otomatis mati setelah 6 detik tanpa permintaan frame, supaya kamera tidak panas
   dan baterai tidak habis saat booth menganggur.

## Batasan

- **Node harus 64-bit.** Node 32-bit ditolak dengan pesan jelas.
- EDSDK tidak reentrant. Semua panggilan diserialisasi lewat satu promise queue di
  main thread. Jangan panggil fungsi SDK dari worker thread.
- Satu kamera saja (index 0). Multi-kamera perlu perubahan di `openCamera()`.
- Kamera hanya bisa dipegang satu aplikasi. EOS Utility yang masih nyala di system
  tray akan bikin `EdsOpenSession` gagal.

## Lisensi

Binary di `vendor/` adalah milik Canon dan tunduk pada Canon EDSDK License
Agreement yang ikut di dalam paket SDK. Saat ini file-file itu **ikut ter-commit**
supaya aplikasi langsung jalan begitu di-clone.

Kalau repo ini mau dijadikan **publik**, pertimbangkan untuk tidak menyertakannya:

```gitignore
server/edsdk/vendor/
```

lalu copy manual ke PC booth, atau set `EDSDK_LIB` ke lokasi lain.

## Test cepat

```bash
npm run edsdk:check -- --all
```

Ini menguji kamera tanpa melibatkan server, browser, atau database — kalau gagal di
sini, masalahnya di kamera/kabel/SDK, bukan di aplikasi.
