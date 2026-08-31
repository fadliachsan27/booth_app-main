import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { getPhotoImage } from "@/lib/api";

/** Public download page for a photo, scanned via QR from DownloadScreen. */
export default function Download() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<"loading" | "ready" | "notfound" | "error">("loading");
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    if (!id) { setState("notfound"); return; }
    let cancelled = false;
    getPhotoImage(id)
      .then((r) => {
        if (cancelled) return;
        if (!r) { setState("notfound"); return; }
        setDataUrl(r.dataUrl);
        setState("ready");
      })
      .catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, [id]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 px-6 py-10 bg-background text-foreground">
      {state === "loading" && (
        <>
          <div className="h-8 w-8 rounded-full border-2 border-current border-t-transparent animate-spin opacity-60" />
          <p className="text-sm text-muted-foreground">Memuat foto...</p>
        </>
      )}

      {state === "notfound" && (
        <div className="text-center space-y-2">
          <h1 className="text-lg font-semibold">Foto tidak ditemukan</h1>
          <p className="text-sm text-muted-foreground">Link ini mungkin sudah dihapus.</p>
        </div>
      )}

      {state === "error" && (
        <div className="text-center space-y-2">
          <h1 className="text-lg font-semibold">Gagal memuat foto</h1>
          <p className="text-sm text-muted-foreground">Cek koneksi internet lalu coba lagi.</p>
        </div>
      )}

      {state === "ready" && (
        <>
          <h1 className="text-lg font-semibold">Foto kamu sudah siap</h1>
          <img
            src={dataUrl}
            alt="Foto photobooth"
            className="max-w-[min(420px,90vw)] w-full rounded-xl border border-border"
          />
          <a
            href={dataUrl}
            download={`photobooth_${id}.jpg`}
            className="inline-flex items-center gap-2 bg-foreground text-primary-foreground font-semibold px-7 py-3.5 rounded-full text-sm no-underline"
          >
            ⬇ Download Foto
          </a>
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            Kalau tombol tidak jalan, tekan &amp; tahan gambar lalu pilih "Simpan Gambar".
          </p>
        </>
      )}
    </div>
  );
}
