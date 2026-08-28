import React, { useRef, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Download, RefreshCw, ChevronLeft, Check, Printer } from "lucide-react";
import type { FrameTemplate, EditorElement } from "@/types/kiosk";
import { uploadPhoto, printPhoto, type SavedPhoto } from "@/lib/api";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Frame slot positions for each layout type (4R portrait 472×709)    */
/* ------------------------------------------------------------------ */
type Slot = { x: number; y: number; w: number; h: number };

/** 2×N grid that fills [L..472-R] × [T..B] with a uniform gutter g. */
function grid(cols: number, rows: number, L: number, R: number, T: number, B: number, g: number): Slot[] {
  const cw = (472 - L - R - g * (cols - 1)) / cols;
  const ch = (B - T - g * (rows - 1)) / rows;
  const out: Slot[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out.push({ x: L + c * (cw + g), y: T + r * (ch + g), w: cw, h: ch });
  return out;
}

const SLOT_POSITIONS: Record<string, Slot[]> = {
  // 2×2 — margins account for each frame's title / footer decoration
  "layout-elegant": grid(2, 2, 30, 30, 72, 650, 14),
  "layout-minimal": grid(2, 2, 26, 26, 54, 668, 12),
  "layout-floral": grid(2, 2, 28, 28, 58, 652, 12),
  "layout-bold": grid(2, 2, 18, 18, 18, 662, 16),
  // 3 stacked, full width
  "layout-retro": grid(1, 3, 18, 18, 52, 672, 10),
  "layout-romantic": grid(1, 3, 22, 22, 52, 666, 12),
  "layout-polaroid": grid(1, 3, 40, 40, 26, 688, 44),
  // 2 stacked, wide
  "layout-cinema": grid(1, 2, 22, 22, 62, 636, 16),
  // asymmetric
  "layout-modern": [
    { x: 20, y: 20, w: 250, h: 300 },
    { x: 288, y: 20, w: 164, h: 138 },
    { x: 288, y: 172, w: 164, h: 148 },
    { x: 20, y: 336, w: 432, h: 350 },
  ],
  none: [{ x: 16, y: 16, w: 440, h: 677 }],
};

/** Higher-res export (on-screen preview stays at canvasW). */
const EXPORT_SCALE = 3;

/* ------------------------------------------------------------------ */
/*  Theme-aware color palettes                                         */
/* ------------------------------------------------------------------ */
const THEME_COLORS: Record<string, { bg: string; frame: string; accent: string; text: string; textSub: string }> = {
  dark: { bg: "#0a0a0a", frame: "#1a1a1a", accent: "#888888", text: "#ededed", textSub: "#666666" },
  light: { bg: "#fafafa", frame: "#ffffff", accent: "#111111", text: "#111111", textSub: "#999999" },
  warm: { bg: "#1a1410", frame: "#2a2018", accent: "#d4a574", text: "#e8d5c0", textSub: "#8a7a6a" },
};

/* ------------------------------------------------------------------ */
/*  Draw editorElements directly onto canvas (synchronized with editor)*/
/* ------------------------------------------------------------------ */
function drawEditorElementsToCanvas(
  ctx: CanvasRenderingContext2D,
  elements: EditorElement[],
  photos: string[],
  photoImages: HTMLImageElement[],
  canvasW: number,
  canvasH: number,
) {
  const scale = canvasW / 472;
  const sorted = [...elements].filter(e => e.visible).sort((a, b) => a.zIndex - b.zIndex);

  // Clear
  ctx.clearRect(0, 0, canvasW, canvasH);

  for (const el of sorted) {
    const x = el.x * scale;
    const y = el.y * scale;
    const w = el.w * scale;
    const h = el.h * scale;
    const r = el.rotation;

    ctx.save();
    if (r) {
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate((r * Math.PI) / 180);
      ctx.translate(-(x + w / 2), -(y + h / 2));
    }

    switch (el.type) {
      case "background":
        ctx.fillStyle = el.bgColor || "#111";
        ctx.fillRect(0, 0, canvasW, canvasH);
        break;
      case "photo": {
        const slotX = x, slotY = y, slotW = w, slotH = h;
        const pi = el.photoIndex ?? 0;
        const img = photoImages[pi];
        if (img && img.complete && img.naturalWidth > 0) {
          const imgRatio = img.naturalWidth / img.naturalHeight;
          const slotRatio = slotW / slotH;
          let drawW: number, drawH: number, offX: number, offY: number;
          if (imgRatio > slotRatio) {
            drawH = slotH; drawW = slotH * imgRatio;
            offX = slotX - (drawW - slotW) / 2; offY = slotY;
          } else {
            drawW = slotW; drawH = slotW / imgRatio;
            offX = slotX; offY = slotY - (drawH - slotH) / 2;
          }
          ctx.beginPath();
          ctx.rect(slotX, slotY, slotW, slotH);
          ctx.clip();
          ctx.drawImage(img, offX, offY, drawW, drawH);
        } else {
          ctx.fillStyle = el.bgColor || "#333";
          ctx.fillRect(slotX, slotY, slotW, slotH);
        }
        break;
      }
      case "text":
        ctx.fillStyle = el.color || "#aaa";
        ctx.font = `${(el.fontSize || 12) * scale}px ${el.fontFamily || "sans-serif"}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(el.text || "", x + w / 2, y + h / 2);
        break;
      case "shape":
        if (el.bgColor && el.bgColor !== "transparent") {
          ctx.fillStyle = el.bgColor;
          const br = (el.borderRadius || 0) * scale;
          if (br > 0) {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, br);
            ctx.fill();
          } else {
            ctx.fillRect(x, y, w, h);
          }
        }
        if (el.strokeColor) {
          ctx.strokeStyle = el.strokeColor;
          ctx.lineWidth = (el.strokeWidth || 1) * scale;
          ctx.strokeRect(x, y, w, h);
        }
        break;
      case "image":
        if (el.imageData) {
          const img2 = new Image();
          img2.src = el.imageData;
          if (img2.complete) {
            ctx.drawImage(img2, x, y, w, h);
          }
        }
        break;
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/*  Draw a single frame layout onto a canvas                          */
/* ------------------------------------------------------------------ */
function drawFrameToCanvas(
  ctx: CanvasRenderingContext2D,
  template: FrameTemplate,
  photos: string[],
  theme: string,
  photoImages: HTMLImageElement[],
  canvasW: number,
  canvasH: number,
) {
  const scale = canvasW / 472;
  const s = (n: number) => n * scale;
  const W = canvasW, H = canvasH;
  const title = "Groom & Bride";

  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";

  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  };
  const strokeRR = (x: number, y: number, w: number, h: number, r: number, color: string, lw: number) => {
    rr(x, y, w, h, r); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
  };
  const dot = (cx: number, cy: number, radius: number, color: string) => {
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  };
  const corners = (inset: number, r: number, color: string) => {
    for (const [cx, cy] of [[inset, inset], [W - inset, inset], [inset, H - inset], [W - inset, H - inset]]) {
      dot(cx, cy, r, color);
    }
  };

  const layout = template.layoutType;

  if (layout === "layout-elegant") {
    ctx.fillStyle = "#1a1f16"; ctx.fillRect(0, 0, W, H);
    strokeRR(s(12), s(12), W - s(24), H - s(24), s(6), "#d4a574", s(2.5));
    strokeRR(s(20), s(20), W - s(40), H - s(40), s(4), "rgba(212,165,116,0.4)", s(1));
    corners(s(20), s(6), "rgba(212,165,116,0.65)");
    ctx.fillStyle = "#2a2520"; rr(s(60), s(28), W - s(120), s(34), s(3)); ctx.fill();
    ctx.fillStyle = "#d4a574"; ctx.font = `italic ${s(21)}px Georgia, serif`;
    ctx.textAlign = "center"; ctx.fillText(title, W / 2, s(52));
    ctx.strokeStyle = "rgba(212,165,116,0.5)"; ctx.lineWidth = s(1);
    ctx.beginPath(); ctx.moveTo(s(90), H - s(48)); ctx.lineTo(W - s(90), H - s(48)); ctx.stroke();
    ctx.fillStyle = "#8a7a6a"; ctx.font = `${s(16)}px Georgia, serif`;
    ctx.fillText("♡", W / 2, H - s(28));
  } else if (layout === "layout-minimal") {
    ctx.fillStyle = "#1a1f16"; ctx.fillRect(0, 0, W, H);
    strokeRR(s(16), s(16), W - s(32), H - s(32), s(2), "#555555", s(1.2));
    ctx.fillStyle = "#aaaaaa"; ctx.font = `${s(16)}px Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.letterSpacing = `${s(6)}px`;
    ctx.fillText("WEDDING", W / 2, s(40));
    ctx.fillStyle = "#666666"; ctx.font = `${s(12)}px Arial, sans-serif`;
    ctx.fillText("2026", W / 2, H - s(26));
    ctx.letterSpacing = "0px";
  } else if (layout === "layout-floral") {
    ctx.fillStyle = "#2a1f25"; ctx.fillRect(0, 0, W, H);
    strokeRR(s(10), s(10), W - s(20), H - s(20), s(6), "rgba(196,122,138,0.35)", s(1.5));
    for (const [cx, cy] of [[s(20), s(20)], [W - s(20), s(20)], [s(20), H - s(20)], [W - s(20), H - s(20)]]) {
      dot(cx, cy, s(13), "rgba(196,122,138,0.4)");
      dot(cx, cy, s(6.5), "rgba(232,160,176,0.65)");
    }
    ctx.fillStyle = "#c47a8a"; ctx.font = `italic ${s(20)}px Georgia, serif`;
    ctx.textAlign = "center"; ctx.fillText(title, W / 2, s(44));
    ctx.strokeStyle = "rgba(196,122,138,0.5)"; ctx.lineWidth = s(1);
    ctx.beginPath(); ctx.moveTo(s(90), H - s(40)); ctx.lineTo(W - s(90), H - s(40)); ctx.stroke();
  } else if (layout === "layout-retro") {
    ctx.fillStyle = "#2a2218"; ctx.fillRect(0, 0, W, H);
    strokeRR(s(8), s(8), W - s(16), H - s(16), s(4), "#c4a060", s(1.2));
    ctx.fillStyle = "#3a3020"; rr(s(16), s(16), W - s(32), s(30), s(2)); ctx.fill();
    ctx.fillStyle = "#c4a060"; ctx.font = `${s(15)}px "Courier New", monospace`;
    ctx.textAlign = "center"; ctx.fillText("ROLL #001", W / 2, s(37));
    ctx.fillStyle = "#8a7a5a"; ctx.font = `${s(12)}px "Courier New", monospace`;
    ctx.fillText("KODAK 400", W / 2, H - s(24));
  } else if (layout === "layout-polaroid") {
    ctx.fillStyle = "#f0ece8"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#d9d3cd"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#f0ece8";
    const py = [30, 250, 470];
    for (const y of py) { ctx.fillRect(s(24), s(y + 210 - 4), W - s(48), s(46)); }
    ctx.fillStyle = "#999999"; ctx.font = `italic ${s(15)}px Georgia, serif`;
    ctx.textAlign = "center"; ctx.fillText(title, W / 2, H - s(18));
  } else if (layout === "layout-cinema") {
    ctx.fillStyle = "#0a0a0a"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ffffff"; ctx.font = `700 ${s(20)}px Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.letterSpacing = `${s(4)}px`;
    ctx.fillText("NOW SHOWING", W / 2, s(42));
    ctx.letterSpacing = "0px";
    ctx.fillStyle = "#c44040";
    ctx.fillRect(s(20), s(52), W - s(40), s(3));
    ctx.fillRect(s(20), H - s(56), W - s(40), s(3));
    ctx.fillStyle = "#666666"; ctx.font = `${s(13)}px "Courier New", monospace`;
    ctx.fillText("PERFECT MOMENT", W / 2, H - s(28));
  } else if (layout === "layout-modern") {
    ctx.fillStyle = "#111111"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#d44040";
    ctx.fillRect(s(286), s(16), s(170), s(144));
    ctx.globalAlpha = 0.5;
    ctx.fillRect(s(16), s(326), s(446), s(20));
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#888888"; ctx.font = `800 ${s(20)}px Arial, sans-serif`;
    ctx.textAlign = "left"; ctx.fillText("MODERN", s(20), H - s(20));
  } else if (layout === "layout-romantic") {
    ctx.fillStyle = "#2a1a20"; ctx.fillRect(0, 0, W, H);
    strokeRR(s(10), s(10), W - s(20), H - s(20), s(10), "rgba(224,96,128,0.3)", s(1.5));
    ctx.fillStyle = "rgba(224,96,128,0.3)"; ctx.font = `${s(26)}px Georgia, serif`;
    ctx.textAlign = "left"; ctx.fillText("♥", s(20), s(40));
    ctx.textAlign = "right"; ctx.fillText("♥", W - s(20), s(34));
    ctx.fillStyle = "#e06080"; ctx.font = `italic ${s(20)}px Georgia, serif`;
    ctx.textAlign = "center"; ctx.fillText("Together Forever", W / 2, s(40));
    ctx.fillStyle = "#8a5060"; ctx.font = `${s(14)}px Georgia, serif`;
    ctx.fillText("♥ Love ♥", W / 2, H - s(22));
  } else if (layout === "layout-bold") {
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#000000"; ctx.fillRect(s(6), s(6), W - s(12), H - s(12));
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = s(2);
    ctx.strokeRect(s(6), s(6), W - s(12), H - s(12));
    ctx.fillStyle = "#ffffff"; ctx.font = `900 ${s(26)}px Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.letterSpacing = `${s(3)}px`;
    ctx.fillText("BOLD", W / 2, H - s(18));
    ctx.letterSpacing = "0px";
  } else {
    ctx.fillStyle = (THEME_COLORS[theme] || THEME_COLORS.dark).bg;
    ctx.fillRect(0, 0, W, H);
  }

  // Draw photos into slots
  const slots = SLOT_POSITIONS[layout] || [];
  slots.forEach((slot, i) => {
    if (i >= photos.length || i >= photoImages.length) return;
    const img = photoImages[i];
    if (!img || !img.complete) return;

    const sx = slot.x * scale;
    const sy = slot.y * scale;
    const sw = slot.w * scale;
    const sh = slot.h * scale;

    // Cover-fit the photo
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const slotRatio = sw / sh;
    let drawW: number, drawH: number, offsetX: number, offsetY: number;

    if (imgRatio > slotRatio) {
      drawH = sh;
      drawW = sh * imgRatio;
      offsetX = sx - (drawW - sw) / 2;
      offsetY = sy;
    } else {
      drawW = sw;
      drawH = sw / imgRatio;
      offsetX = sx;
      offsetY = sy - (drawH - sh) / 2;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, sy, sw, sh);
    ctx.clip();
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    ctx.restore();
  });
}

/* ------------------------------------------------------------------ */
/*  Main Compositor Component                                          */
/* ------------------------------------------------------------------ */
interface FrameCompositorProps {
  template: FrameTemplate;
  photos: string[];
  theme: string;
  price?: number;
  canPrint?: boolean;
  paymentEnabled?: boolean;
  onBack: () => void;
  onNext: () => void;
  onUploaded?: (entry: SavedPhoto) => void;
}

export default function FrameCompositor({ template, photos, theme, price = 0, canPrint = false, paymentEnabled = false, onBack, onNext, onUploaded }: FrameCompositorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uploadedRef = useRef(false);
  const uploadedIdRef = useRef<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printed, setPrinted] = useState(false);
  const photoImagesRef = useRef<HTMLImageElement[]>([]);

  const n = template.poses;
  const canvasW = 472;
  const canvasH = 709;
  const layout = template.layoutType;
  const slots = SLOT_POSITIONS[layout] || [];
  const colors = THEME_COLORS[theme] || THEME_COLORS.dark;

  const [imagesLoaded, setImagesLoaded] = useState(0);

  // Preload the captured photos. The draw functions cover-fit each into its
  // template slot, so no pre-cropping step is needed.
  React.useEffect(() => {
    const imgs: HTMLImageElement[] = [];
    let loaded = 0;
    const total = photos.filter(Boolean).length;
    if (total === 0) { photoImagesRef.current = []; setImagesLoaded(0); return; }
    photos.forEach((src, i) => {
      if (!src) { imgs[i] = null as unknown as HTMLImageElement; return; }
      const img = new Image();
      const done = () => { loaded++; if (loaded >= total) setImagesLoaded((v) => v + 1); };
      img.onload = done;
      img.onerror = done;
      img.src = src;
      imgs[i] = img;
    });
    photoImagesRef.current = imgs;
  }, [photos]);

  // Draw preview on canvas
  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    template.editorElements && template.editorElements.length > 0 ? drawEditorElementsToCanvas(ctx, template.editorElements, photos, photoImagesRef.current, canvasW, canvasH) : drawFrameToCanvas(ctx, template, photos, theme, photoImagesRef.current, canvasW, canvasH);
  }, [template, photos, theme]);

  // Draw after images finish loading
  React.useEffect(() => { if (imagesLoaded > 0) drawPreview(); }, [imagesLoaded, drawPreview]);
  // Also draw immediately for frame preview (without photos)
  React.useEffect(() => { drawPreview(); }, [drawPreview]);

  // Auto-save to local storage after photos are composited
  React.useEffect(() => {
    if (imagesLoaded > 0 && !autoSaved) {
      const timer = setTimeout(() => {
        const hiRes = document.createElement("canvas");
        hiRes.width = canvasW * EXPORT_SCALE;
        hiRes.height = canvasH * EXPORT_SCALE;
        const ctx = hiRes.getContext("2d");
        if (!ctx) return;
        template.editorElements && template.editorElements.length > 0 ? drawEditorElementsToCanvas(ctx, template.editorElements, photos, photoImagesRef.current, canvasW * EXPORT_SCALE, canvasH * EXPORT_SCALE) : drawFrameToCanvas(ctx, template, photos, theme, photoImagesRef.current, canvasW * EXPORT_SCALE, canvasH * EXPORT_SCALE);
        setTimeout(() => {
          hiRes.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${template.name.replace(/\s+/g, "_")}_${Date.now()}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setAutoSaved(true);
          }, "image/jpeg", 0.95);
        }, 200);
      }, 800); // short delay so canvas is rendered first
      return () => clearTimeout(timer);
    }
  }, [imagesLoaded, autoSaved, template, photos, theme]);

  // Upload the finished composite to the local server so it can be downloaded
  // via QR code. Runs once per session, best-effort (kiosk still works offline).
  React.useEffect(() => {
    if (imagesLoaded === 0 || uploadedRef.current) return;
    uploadedRef.current = true;
    const timer = setTimeout(() => {
      const hiRes = document.createElement("canvas");
      hiRes.width = canvasW * EXPORT_SCALE;
      hiRes.height = canvasH * EXPORT_SCALE;
      const ctx = hiRes.getContext("2d");
      if (!ctx) return;
      template.editorElements && template.editorElements.length > 0
        ? drawEditorElementsToCanvas(ctx, template.editorElements, photos, photoImagesRef.current, canvasW * EXPORT_SCALE, canvasH * EXPORT_SCALE)
        : drawFrameToCanvas(ctx, template, photos, theme, photoImagesRef.current, canvasW * EXPORT_SCALE, canvasH * EXPORT_SCALE);
      setTimeout(() => {
        const dataUrl = hiRes.toDataURL("image/jpeg", 0.92);
        uploadPhoto(dataUrl, {
          templateId: template.id,
          templateName: template.name,
          price,
        })
          .then((entry) => { uploadedIdRef.current = entry.id; onUploaded?.(entry); })
          .catch((err) => console.warn("[photobooth] upload failed:", err));
      }, 250);
    }, 900);
    return () => clearTimeout(timer);
  }, [imagesLoaded, template, photos, theme, price, onUploaded]);

  // Download the composited image
  const handleDownload = useCallback(() => {
    setDownloading(true);
    const hiRes = document.createElement("canvas");
    hiRes.width = canvasW * EXPORT_SCALE;
    hiRes.height = canvasH * EXPORT_SCALE;
    const ctx = hiRes.getContext("2d");
    if (!ctx) { setDownloading(false); return; }

    template.editorElements && template.editorElements.length > 0 ? drawEditorElementsToCanvas(ctx, template.editorElements, photos, photoImagesRef.current, canvasW * EXPORT_SCALE, canvasH * EXPORT_SCALE) : drawFrameToCanvas(ctx, template, photos, theme, photoImagesRef.current, canvasW * EXPORT_SCALE, canvasH * EXPORT_SCALE);

    setTimeout(() => {
      hiRes.toBlob((blob) => {
        if (!blob) { setDownloading(false); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${template.name.replace(/\s+/g, "_")}_${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setDownloading(false);
        setDownloaded(true);
        setTimeout(() => setDownloaded(false), 3000);
      }, "image/jpeg", 0.95);
    }, 100);
  }, [template, photos, theme]);

  // Print the composited photo — sent to the server, which runs the OS printer
  const handlePrint = useCallback(async () => {
    const waitForUpload = async () => {
      for (let i = 0; i < 30 && !uploadedIdRef.current; i++) {
        await new Promise((r) => setTimeout(r, 300));
      }
      return uploadedIdRef.current;
    };
    setPrinting(true);
    try {
      const id = await waitForUpload();
      if (!id) throw new Error("foto belum tersimpan di server");
      await printPhoto(id);
      setPrinted(true);
      setTimeout(() => setPrinted(false), 3000);
      toast.success("Perintah cetak terkirim ke printer");
    } catch (e) {
      toast.error("Gagal mencetak: " + (e as Error).message);
    } finally {
      setPrinting(false);
    }
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" /><span>Kembali</span>
        </button>
        <h2 className="text-sm font-medium tracking-widest uppercase text-muted-foreground">Hasil Foto</h2>
        <button onClick={onNext} className="text-xs tracking-wide uppercase bg-foreground text-primary-foreground px-4 py-1.5 rounded-full">Selesai</button>
      </div>

      {/* Content — centered large canvas */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-6">

        {/* Canvas preview — large, centered */}
        <div className="relative mb-6">
          <canvas
            ref={canvasRef}
            width={canvasW}
            height={canvasH}
            className="rounded-xl shadow-2xl border border-border/10"
            style={{ width: 'min(380px, 80vw)', height: 'min(570px, 120vw)' }}
          />
          {/* Success badge */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[10px] tracking-widest uppercase px-4 py-1.5 rounded-full shadow-lg"
          >
            Foto Selesai ✓
          </motion.div>
        </div>

        {/* Bottom action bar */}
        <div className="w-full max-w-md space-y-4 mt-4">
          {/* Photo thumbnails */}
          <div className="flex gap-2 justify-center">
            {Array.from({ length: n }).map((_, i) => (
              <div key={i} className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${photos[i] ? "border-emerald-400/60" : "border-border"}`}>
                {photos[i] ? (
                  <img src={photos[i]} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <span className="text-xs text-muted-foreground/40">{i + 1}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Info row */}
          <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground tracking-wide">
            <span>{template.name}</span>
            <span className="w-px h-3 bg-border" />
            <span>4R Portrait</span>
            <span className="w-px h-3 bg-border" />
            <span className="capitalize">{theme}</span>
          </div>

          {/* Action buttons — 3 columns */}
          <div className="flex gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleDownload}
              disabled={downloading}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-3 border border-border rounded-lg text-xs font-medium tracking-wide uppercase hover:bg-muted transition-colors disabled:opacity-50"
            >
              {downloading ? (
                <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Menyimpan...</>
              ) : downloaded ? (
                <><Check className="h-3.5 w-3.5" />Tersimpan!</>
              ) : (
                <><Download className="h-3.5 w-3.5" />Simpan</>
              )}
            </motion.button>
            {canPrint && !paymentEnabled && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handlePrint}
              disabled={printing}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-3 bg-foreground text-primary-foreground rounded-lg text-xs font-medium tracking-wide uppercase hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {printing ? (
                <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Mencetak...</>
              ) : printed ? (
                <><Check className="h-3.5 w-3.5" />Tercetak!</>
              ) : (
                <><Printer className="h-3.5 w-3.5" />Cetak</>
              )}
            </motion.button>
            )}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onNext}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-3 border border-border rounded-lg text-xs font-medium tracking-wide uppercase hover:bg-muted transition-colors"
            >
              Selesai
            </motion.button>
          </div>
          <p className="text-[10px] text-muted-foreground/50 text-center">Cetak langsung ke printer atau simpan ke perangkat</p>
        </div>
      </div>
    </motion.div>
  );
}
