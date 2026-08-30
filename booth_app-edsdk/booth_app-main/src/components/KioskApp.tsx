import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, ChevronLeft, ChevronRight, Download, FileImage, HardDrive, Info,
  Image, Settings, Trash2, Wifi, WifiOff, Plus,
  Upload, Check, RefreshCw, Save, Aperture, CircleDot, Crosshair, Sun,
  Battery, FolderOpen, Edit,
  DollarSign, Calendar, TrendingUp, Clock, FileSpreadsheet, Target, Eye, EyeOff, Globe,
  CreditCard, Banknote, QrCode,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  type KioskScreen, type FrameTemplate, type BookkeepingEntry, DEFAULT_TEMPLATES,
  formatRupiah, getTodayDate, exportBookkeepingToCSV, downloadCSV,
} from "@/types/kiosk";
import TemplateEditor from "@/components/TemplateEditor";
import FrameCompositor from "@/components/FrameCompositor";
import {
  listPhotos, clearPhotos, getConfig, saveConfig as apiSaveConfig,
  listTemplates, saveTemplates, cameraStatus, dslrCapture, liveviewUrl,
  listPrinters, printPhoto, serverOnline as apiServerOnline, DEFAULT_CONFIG,
  type BoothConfig, type CameraSource, type CameraStatus,
} from "@/lib/api";
import { toast } from "sonner";
import type { EditorElement } from "@/types/kiosk";

function StatusBar({ isOnline }: { isOnline: boolean }) {
  return (
    <div className="flex items-center justify-end gap-2 px-6 py-3 text-xs tracking-widest uppercase text-muted-foreground">
      {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      <span>{isOnline ? "Online" : "Offline"}</span>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
      <ChevronLeft className="h-4 w-4" /><span>Kembali</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Template Preview SVG                                               */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/*  Render editorElements as scaled SVG for preview                    */
/* ------------------------------------------------------------------ */
function EditorElementsSVG({ elements, canvasW, canvasH, svgW, svgH }: { elements: EditorElement[]; canvasW: number; canvasH: number; svgW: number; svgH: number }) {
  const scale = svgW / canvasW;
  const sorted = [...elements].filter(e => e.visible).sort((a, b) => a.zIndex - b.zIndex);
  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-full object-contain">
      {sorted.map(el => {
        const x = el.x * scale;
        const y = el.y * scale;
        const w = el.w * scale;
        const h = el.h * scale;
        const r = el.rotation;
        const transform = r ? `rotate(${r} ${x + w / 2} ${y + h / 2})` : undefined;
        switch (el.type) {
          case "background":
            return <rect key={el.id} x={x} y={y} width={w} height={h} fill={el.bgColor || "#111"} />;
          case "photo":
            return (
              <g key={el.id} transform={transform}>
                <rect x={x} y={y} width={w} height={h} rx={(el.borderRadius || 0) * scale} fill={el.bgColor || "#333"} stroke={el.strokeColor || "#555"} strokeWidth={(el.strokeWidth || 0.5) * scale} />
                {el.photoIndex !== undefined && (
                  <text x={x + w / 2} y={y + h / 2 + 3} textAnchor="middle" fontSize={8 * scale} fill="#666">{el.photoIndex + 1}</text>
                )}
              </g>
            );
          case "text":
            return (
              <text key={el.id} x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central"
                fontSize={(el.fontSize || 12) * scale} fontFamily={el.fontFamily || "sans-serif"}
                fill={el.color || "#aaa"} transform={transform}>
                {el.text || ""}
              </text>
            );
          case "shape":
            return <rect key={el.id} x={x} y={y} width={w} height={h} rx={(el.borderRadius || 0) * scale}
              fill={el.bgColor || "transparent"} stroke={el.strokeColor || "#555"} strokeWidth={(el.strokeWidth || 1) * scale}
              transform={transform} />;
          case "image":
            if (el.imageData) {
              return <image key={el.id} x={x} y={y} width={w} height={h} href={el.imageData} preserveAspectRatio="xMidYMid slice" transform={transform} />;
            }
            return <rect key={el.id} x={x} y={y} width={w} height={h} fill="#333" transform={transform} />;
          default:
            return null;
        }
      })}
    </svg>
  );
}

function TemplatePreviewSmall({ template }: { template: FrameTemplate }) {
  const isStrip = template.size === "portrait";
  const W = isStrip ? 70 : 110;
  const H = isStrip ? 110 : 70;

  // If template has editorElements, render from them (synchronized with editor)
  if (template.editorElements && template.editorElements.length > 0) {
    return <EditorElementsSVG elements={template.editorElements} canvasW={472} canvasH={709} svgW={W} svgH={H} />;
  }

  if (template.layoutType === "none") {
    return <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full object-contain"><rect width={W} height={H} fill="#f5f5f5" /><rect x="6" y="6" width={W-12} height={H-12} rx="2" fill="#e5e5e5" /></svg>;
  }
  const n = template.poses;
  if (template.layoutType === "layout-elegant") {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full object-contain">
        <rect width={W} height={H} fill="#1a1f16" />
        {/* Elegant border frame */}
        <rect x="3" y="3" width={W-6} height={H-6} rx="3" fill="none" stroke="#d4a574" strokeWidth="0.8" />
        <rect x="5" y="5" width={W-10} height={H-10} rx="2" fill="none" stroke="#d4a574" strokeWidth="0.3" />
        {/* Corner ornaments */}
        <circle cx="5" cy="5" r="1.5" fill="#d4a574" opacity="0.6" />
        <circle cx={W-5} cy="5" r="1.5" fill="#d4a574" opacity="0.6" />
        <circle cx="5" cy={H-5} r="1.5" fill="#d4a574" opacity="0.6" />
        <circle cx={W-5} cy={H-5} r="1.5" fill="#d4a574" opacity="0.6" />
        {/* Title area */}
        <rect x="10" y="8" width={W-20} height="10" rx="1" fill="#2a2520" />
        <text x={W/2} y="15" textAnchor="middle" fontSize="3.5" fill="#d4a574" fontFamily="serif" fontStyle="italic">Groom &amp; Bride</text>
        {/* Photo grid 2x2 */}
        {[0,1,2,3].map(i => (
          <rect key={i} x={10 + (i%2) * ((W-24)/2 + 2)} y={22 + Math.floor(i/2) * ((H-42)/2 + 2)} width={(W-24)/2} height={(H-42)/2} rx="1" fill="#3a3530" stroke="#d4a574" strokeWidth="0.3" />
        ))}
        {/* Bottom decoration */}
        <line x1="15" y1={H-12} x2={W-15} y2={H-12} stroke="#d4a574" strokeWidth="0.3" opacity="0.5" />
        <text x={W/2} y={H-7} textAnchor="middle" fontSize="2.5" fill="#8a7a6a" fontFamily="serif">♡</text>
      </svg>
    );
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full object-contain"><rect width={W} height={H} fill="#1a1f16" />
      {/* === MINIMAL — clean white, thin lines, 2x2 grid === */}
      {template.layoutType==="layout-minimal"&&<>
        <rect x="4" y="4" width={W-8} height={H-8} rx="1" fill="none" stroke="#555" strokeWidth="0.4" />
        <text x={W/2} y="11" textAnchor="middle" fontSize="3.5" fill="#aaa" fontFamily="sans-serif" letterSpacing="1">WEDDING</text>
        {[0,1,2,3].map(i=><rect key={i} x={8+(i%2)*((W-20)/2+2)} y={14+Math.floor(i/2)*((H-30)/2+2)} width={(W-20)/2} height={(H-30)/2} rx="0.5" fill="#333" />)}
        <text x={W/2} y={H-6} textAnchor="middle" fontSize="2.5" fill="#555" fontFamily="sans-serif" letterSpacing="0.5">2026</text>
      </>}
      {/* === FLORAL — soft pastel, flower corners, 2x2 === */}
      {template.layoutType==="layout-floral"&&<>
        <rect x="2" y="2" width={W-4} height={H-4} rx="2" fill="#2a1f25" />
        {/* Flower corners */}
        <circle cx="6" cy="6" r="3" fill="#c47a8a" opacity="0.4" />
        <circle cx="6" cy="6" r="1.5" fill="#e8a0b0" opacity="0.6" />
        <circle cx={W-6} cy="6" r="3" fill="#c47a8a" opacity="0.4" />
        <circle cx={W-6} cy="6" r="1.5" fill="#e8a0b0" opacity="0.6" />
        <circle cx="6" cy={H-6} r="3" fill="#c47a8a" opacity="0.4" />
        <circle cx="6" cy={H-6} r="1.5" fill="#e8a0b0" opacity="0.6" />
        <circle cx={W-6} cy={H-6} r="3" fill="#c47a8a" opacity="0.4" />
        <circle cx={W-6} cy={H-6} r="1.5" fill="#e8a0b0" opacity="0.6" />
        <text x={W/2} y="12" textAnchor="middle" fontSize="3" fill="#c47a8a" fontFamily="serif" fontStyle="italic">Groom &amp; Bride</text>
        {[0,1,2,3].map(i=><rect key={i} x={8+(i%2)*((W-20)/2+2)} y={15+Math.floor(i/2)*((H-32)/2+2)} width={(W-20)/2} height={(H-32)/2} rx="1" fill="#3a2a30" />)}
        <line x1="20" y1={H-10} x2={W-20} y2={H-10} stroke="#c47a8a" strokeWidth="0.3" opacity="0.5" />
      </>}
      {/* === RETRO — warm tones, film-strip style, 3 poses === */}
      {template.layoutType==="layout-retro"&&<>
        <rect x="3" y="3" width={W-6} height={H-6} rx="2" fill="#2a2218" />
        <rect x="5" y="5" width={W-10} height="8" rx="1" fill="#3a3020" />
        <text x={W/2} y="11" textAnchor="middle" fontSize="2.5" fill="#c4a060" fontFamily="monospace">ROLL #001</text>
        {[0,1,2].map(i=><rect key={i} x="8" y={16+i*28} width={W-16} height={24} rx="1" fill="#3a3020" stroke="#c4a060" strokeWidth="0.3" />)}
        <text x={W/2} y={H-6} textAnchor="middle" fontSize="2" fill="#8a7a5a" fontFamily="monospace">KODAK 400</text>
      </>}
      {/* === POLAROID — classic white border, 3 stacked === */}
      {template.layoutType==="layout-polaroid"&&<>
        <rect x="3" y="3" width={W-6} height={H-6} rx="1" fill="#f0ece8" />
        {[0,1,2].map(i=>{
          const py = 6 + i * 34;
          return <g key={i}><rect x="8" y={py} width={W-16} height={26} fill="#e0dcd8" /><rect x="8" y={py+26} width={W-16} height="6" fill="#f0ece8" /><text x={W/2} y={py+31} textAnchor="middle" fontSize="2" fill="#999" fontFamily="sans-serif">{i+1}</text></g>;
        })}
      </>}
      {/* === CINEMA — dark, widescreen bars, 2 poses === */}
      {template.layoutType==="layout-cinema"&&<>
        <rect x="2" y="2" width={W-4} height={H-4} fill="#0a0a0a" />
        <rect x="6" y="15" width={W-12} height={20} rx="1" fill="#1a1a1a" />
        <rect x="6" y="40" width={W-12} height={20} rx="1" fill="#1a1a1a" />
        <text x={W/2} y="12" textAnchor="middle" fontSize="3" fill="#fff" fontFamily="sans-serif" fontWeight="bold" letterSpacing="2">NOW SHOWING</text>
        <rect x="6" y="15" width={W-12} height="0.5" fill="#c44040" />
        <rect x="6" y="40" width={W-12} height="0.5" fill="#c44040" />
        <text x={W/2} y={H-6} textAnchor="middle" fontSize="2" fill="#555" fontFamily="monospace">PERFECT MOMENT</text>
      </>}
      {/* === MODERN — asymmetric grid, 4 poses, bold colors === */}
      {template.layoutType==="layout-modern"&&<>
        <rect x="2" y="2" width={W-4} height={H-4} rx="1" fill="#111" />
        {/* Large top-left */}
        <rect x="4" y="4" width={(W-12)*0.6} height={(H-20)*0.55} rx="1" fill="#2a2a2a" />
        {/* Small top-right */}
        <rect x={4+(W-12)*0.6+2} y="4" width={(W-12)*0.4-2} height={(H-20)*0.25} rx="1" fill="#d44040" opacity="0.7" />
        {/* Small mid-right */}
        <rect x={4+(W-12)*0.6+2} y={4+(H-20)*0.25+2} width={(W-12)*0.4-2} height={(H-20)*0.3} rx="1" fill="#2a2a2a" />
        {/* Wide bottom-left */}
        <rect x="4" y={4+(H-20)*0.55+2} width={(W-12)*0.6-1} height={(H-20)*0.45-2} rx="1" fill="#2a2a2a" />
        {/* Small bottom-right */}
        <rect x={4+(W-12)*0.6+1} y={4+(H-20)*0.55+2} width={(W-12)*0.4-1} height={(H-20)*0.45-2} rx="1" fill="#d44040" opacity="0.5" />
        <text x="8" y={H-6} fontSize="3" fill="#666" fontFamily="sans-serif" fontWeight="bold">MODERN</text>
      </>}
      {/* === ROMANTIC — hearts, soft pink, 3 poses === */}
      {template.layoutType==="layout-romantic"&&<>
        <rect x="2" y="2" width={W-4} height={H-4} rx="3" fill="#2a1a20" />
        {/* Hearts */}
        <text x="10" y="10" fontSize="4" fill="#e06080" opacity="0.3">♥</text>
        <text x={W-14} y="14" fontSize="3" fill="#e06080" opacity="0.2">♥</text>
        <text x="14" y={H-8} fontSize="3.5" fill="#e06080" opacity="0.25">♥</text>
        <text x={W/2} y="12" textAnchor="middle" fontSize="3" fill="#e06080" fontFamily="serif" fontStyle="italic">Together Forever</text>
        {[0,1,2].map(i=>(
          <rect key={i} x="8" y={16+i*28} width={W-16} height={24} rx="1" fill="#3a2028" stroke="#e06080" strokeWidth="0.3" />
        ))}
        <text x={W/2} y={H-6} textAnchor="middle" fontSize="2" fill="#8a5060" fontFamily="serif">♥ Love ♥</text>
      </>}
      {/* === BOLD — high contrast, thick borders, 2x2 === */}
      {template.layoutType==="layout-bold"&&<>
        <rect x="1" y="1" width={W-2} height={H-2} rx="1" fill="#fff" />
        <rect x="3" y="3" width={W-6} height={H-6} rx="0" fill="#000" />
        {[0,1,2,3].map(i=><rect key={i} x={8+(i%2)*((W-20)/2+2)} y={8+Math.floor(i/2)*((H-24)/2+2)} width={(W-20)/2} height={(H-24)/2} rx="0" fill="#333" />)}
        <text x={W/2} y={H-5} textAnchor="middle" fontSize="4" fill="#fff" fontFamily="sans-serif" fontWeight="900" letterSpacing="1">BOLD</text>
      </>}
    </svg>
  );
}


/* ------------------------------------------------------------------ */
/*  Screen 1 — Home                                                    */
/* ------------------------------------------------------------------ */
function HomeScreen({ onNavigate, homeMode, screensaverImage }: { onNavigate: (s: KioskScreen) => void; homeMode: "default"|"camera"|"screensaver"; screensaverImage: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);

  // Start camera for live view mode
  useEffect(() => {
    if (homeMode !== "camera") { setCameraActive(false); return; }
    let stream: MediaStream | null = null;
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } });
        if (videoRef.current) { videoRef.current.srcObject = stream; setCameraActive(true); }
      } catch { setCameraActive(false); }
    };
    startCamera();
    return () => { if (stream) stream.getTracks().forEach(t => t.stop()); };
  }, [homeMode]);

  const isScreensaver = homeMode === "screensaver" && screensaverImage;
  const isCamera = homeMode === "camera";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-screen flex flex-col bg-background text-foreground relative overflow-hidden">

      {/* Screensaver background */}
      {isScreensaver && (
        <div className="absolute inset-0 z-0">
          <img src={screensaverImage} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40" />
        </div>
      )}

      {/* Live camera background */}
      {isCamera && (
        <div className="absolute inset-0 z-0">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/30" />
        </div>
      )}

      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between relative z-10">
        <div className="w-20" />
        <h2 className="text-sm font-medium tracking-widest uppercase text-muted-foreground">Photobooth</h2>
        <button onClick={() => onNavigate("settings")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors bg-background/80 backdrop-blur-sm">
          <Settings className="h-3.5 w-3.5" strokeWidth={1.5} /><span className="text-[10px] tracking-widest uppercase">Operator</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-12 px-6 relative z-10">
        {isScreensaver ? (
          /* Screensaver mode: show minimal overlay */
          <div className="text-center space-y-4">
            <h1 className="text-5xl font-light tracking-tight uppercase text-white drop-shadow-lg">Mulai Foto</h1>
            <p className="text-sm text-white/70 tracking-wide drop-shadow">Sentuh layar untuk memulai</p>
          </div>
        ) : isCamera ? (
          /* Camera mode: show minimal overlay on live feed */
          <div className="text-center space-y-4">
            <h1 className="text-5xl font-light tracking-tight uppercase text-white drop-shadow-lg">Mulai Foto</h1>
            <p className="text-sm text-white/70 tracking-wide drop-shadow">Sentuh layar untuk memulai</p>
          </div>
        ) : (
          /* Default mode: show icon + text */
          <>
            <div className="h-32 w-32 rounded-full border border-border flex items-center justify-center">
              <Camera className="h-16 w-16 text-foreground" strokeWidth={1} />
            </div>
            <div className="text-center space-y-3">
              <h1 className="text-4xl font-light tracking-tight uppercase">Mulai Foto</h1>
              <p className="text-sm text-muted-foreground tracking-wide">Sentuh layar untuk memulai</p>
            </div>
          </>
        )}

        <button onClick={() => onNavigate("templates")} className="mt-4 group" aria-label="Start">
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className={`h-20 w-20 rounded-full border flex items-center justify-center transition-colors ${isScreensaver || isCamera ? "border-white/30 hover:border-white" : "border-border hover:border-foreground"}`}>
            <div className={`h-10 w-10 rounded-full border flex items-center justify-center ${isScreensaver || isCamera ? "border-white/60" : "border-foreground"}`}><div className={`h-3 w-3 rounded-full ${isScreensaver || isCamera ? "bg-white" : "bg-foreground"}`} /></div>
          </motion.div>
        </button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Screen 2 — Template Selection (Swipeable Carousel)                 */
/* ------------------------------------------------------------------ */
function TemplateSelectionScreen({ templates, selectedId, onSelect, onBack }: { templates: FrameTemplate[]; selectedId: string; onSelect: (t: FrameTemplate) => void; onBack: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(() => {
    const idx = templates.findIndex(t => t.id === selectedId);
    return idx >= 0 ? idx : 0;
  });
  const touchStartX = useRef(0);
  const isDragging = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);

  const tpl = templates[currentIndex];

  const goTo = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(templates.length - 1, idx));
    if (clamped === currentIndex) return;
    setCurrentIndex(clamped);
    setDragOffset(0);
  }, [currentIndex, templates.length]);

  const goPrev = useCallback(() => goTo(currentIndex - 1), [goTo, currentIndex]);
  const goNext = useCallback(() => goTo(currentIndex + 1), [goTo, currentIndex]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    isDragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const delta = e.touches[0].clientX - touchStartX.current;
    setDragOffset(delta * 0.3);
  }, []);

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;
    if (dragOffset > 50) goPrev();
    else if (dragOffset < -50) goNext();
    setDragOffset(0);
  }, [dragOffset, goPrev, goNext]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    touchStartX.current = e.clientX;
    isDragging.current = true;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const delta = e.clientX - touchStartX.current;
    setDragOffset(delta * 0.3);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (dragOffset > 50) goPrev();
    else if (dragOffset < -50) goNext();
    setDragOffset(0);
  }, [dragOffset, goPrev, goNext]);

  const handleMouseLeave = useCallback(() => {
    if (isDragging.current) { isDragging.current = false; setDragOffset(0); }
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "Enter") onSelect(tpl);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goPrev, goNext, onSelect, tpl]);

  // Generate visible cards: center + 2 on each side
  const visibleRange = 2;
  const visibleCards = [];
  for (let offset = -visibleRange; offset <= visibleRange; offset++) {
    const idx = currentIndex + offset;
    if (idx >= 0 && idx < templates.length) {
      visibleCards.push({ template: templates[idx], offset, idx });
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 flex flex-col select-none overflow-hidden"
      style={{ background: "linear-gradient(180deg, #0d1117 0%, #161b22 40%, #1a1f16 100%)" }}>

      {/* Header */}
      <div className="pt-8 pb-2 text-center relative z-10">
        <p className="text-[10px] tracking-[0.3em] uppercase text-white/30 mb-2">Photobooth</p>
        <h1 className="text-3xl font-light tracking-wide text-white">Choose a Template</h1>
        <div className="mt-3 flex items-center justify-center gap-2">
          <div className="h-px w-12 bg-white/10" />
          <span className="text-[10px] text-white/25 tracking-widest">{currentIndex + 1} / {templates.length}</span>
          <div className="h-px w-12 bg-white/10" />
        </div>
      </div>

      {/* Coverflow */}
      <div
        className="flex-1 flex items-center justify-center relative"
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave}
        style={{ perspective: "1400px" }}
      >
        {visibleCards.map(({ template: t, offset, idx }) => {
          const isCenter = offset === 0;
          const absOffset = Math.abs(offset);
          const isStrip = t.size === "portrait";
          const scale = isCenter ? 1 : Math.max(0.45, 1 - absOffset * 0.18);
          const translateX = offset * (isCenter ? 0 : 220) + dragOffset;
          const rotateY = isCenter ? 0 : (offset > 0 ? -35 : 35);
          const opacity = isCenter ? 1 : Math.max(0.2, 1 - absOffset * 0.4);
          const zIndex = 10 - absOffset;

          const previewW = isCenter ? (isStrip ? 200 : 280) : (isStrip ? 120 : 160);
          const previewH = isCenter ? (isStrip ? 300 : 200) : (isStrip ? 180 : 110);

          return (
            <motion.div
              key={t.id}
              animate={{ x: translateX, scale, opacity, rotateY }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
              style={{ position: "absolute", zIndex, transformStyle: "preserve-3d", width: previewW, height: previewH }}
              onClick={() => isCenter ? onSelect(t) : goTo(idx)}
              className="cursor-pointer"
            >
              {/* Template preview */}
              <div className="w-full h-full flex flex-col items-center">
                <div className={`w-full h-full ${isCenter ? "scale-[2.4]" : "scale-[2.0]"} origin-center`}>
                  {t.layoutType === "none" ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <Camera className="h-16 w-16 text-white/15" strokeWidth={1} />
                    </div>
                  ) : (
                    <TemplatePreviewSmall template={t} />
                  )}
                </div>
                {/* Template name below center card */}
                {isCenter && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
                    className="absolute -bottom-12 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                    <p className="text-sm font-medium text-white/90 tracking-wide">{t.name}</p>
                    <p className="text-[10px] text-white/30 mt-0.5">{t.description}</p>
                  </motion.div>
                )}
              </div>


            </motion.div>
          );
        })}

        {/* Left arrow */}
        <button onClick={goPrev} disabled={currentIndex === 0}
          className="absolute left-6 z-20 h-12 w-12 rounded-full border border-white/10 flex items-center justify-center text-white/30 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all disabled:opacity-0 disabled:pointer-events-none">
          <ChevronLeft className="h-6 w-6" strokeWidth={1.5} />
        </button>
        {/* Right arrow */}
        <button onClick={goNext} disabled={currentIndex === templates.length - 1}
          className="absolute right-6 z-20 h-12 w-12 rounded-full border border-white/10 flex items-center justify-center text-white/30 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all disabled:opacity-0 disabled:pointer-events-none">
          <ChevronRight className="h-6 w-6" strokeWidth={1.5} />
        </button>
      </div>

      {/* Bottom bar */}
      <div className="pb-8 pt-6 flex flex-col items-center gap-5 relative z-10">
        {/* Dot indicators */}
        <div className="flex items-center gap-1.5">
          {templates.map((_, i) => (
            <button key={i} onClick={() => goTo(i)}
              className={`transition-all duration-300 rounded-full ${i === currentIndex ? "h-2 w-6 bg-white shadow-sm shadow-white/20" : "h-1.5 w-1.5 bg-white/20 hover:bg-white/40"}`} />
          ))}
        </div>

        {/* Select button */}
        <motion.button whileHover={{ scale: 1.03, boxShadow: "0 0 30px rgba(255,255,255,0.15)" }} whileTap={{ scale: 0.97 }}
          onClick={() => onSelect(tpl)}
          className="relative px-14 py-3.5 bg-white text-black rounded-full text-sm font-medium tracking-wider uppercase hover:bg-white/90 transition-all shadow-lg shadow-white/10">
          Select Template
        </motion.button>
      </div>
    </motion.div>
  );
}


/* ------------------------------------------------------------------ */
/*  Screen 3a — Tap to Start (Camera Ready)                           */
/* ------------------------------------------------------------------ */
function CameraReadyScreen({ template, onStart, onCancel }: { template: FrameTemplate; onStart: () => void; onCancel: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between">
        <button onClick={onCancel} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" /><span>Kembali</span>
        </button>
        <h2 className="text-sm font-medium tracking-widest uppercase text-muted-foreground">Siap Foto</h2>
        <div className="w-20" />
      </div>
      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-10 px-6">
        <div className="h-32 w-32 rounded-full border border-border flex items-center justify-center">
          <Camera className="h-16 w-16 text-foreground" strokeWidth={1} />
        </div>
        <div className="text-center space-y-3">
          <p className="text-xs tracking-widest uppercase text-muted-foreground">{template.name}</p>
          <h1 className="text-4xl font-light tracking-tight uppercase">Siap Foto</h1>
          <p className="text-sm text-muted-foreground tracking-wide">{template.poses} foto akan diambil</p>
          <p className="text-[10px] text-muted-foreground/60 tracking-wide">Foto tidak dapat diulang</p>
        </div>
        <button onClick={onStart} className="mt-4 group" aria-label="Start taking photos">
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="h-24 w-24 rounded-full border-2 border-foreground/30 flex items-center justify-center transition-colors group-hover:border-foreground">
            <div className="h-16 w-16 rounded-full border-2 border-foreground flex items-center justify-center">
              <div className="h-6 w-6 rounded-full bg-foreground" />
            </div>
          </motion.div>
        </button>
        <p className="text-xs text-muted-foreground tracking-wide">Sentuh untuk mulai mengambil foto</p>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Screen 3 — Camera (framed per template)                            */
/* ------------------------------------------------------------------ */
function CameraScreen({ template, cameraSource = "webcam", onComplete, onCancel, countdown = 7 }: { template: FrameTemplate; cameraSource?: CameraSource; onComplete: (photos: string[]) => void; onCancel: () => void; countdown?: number }) {
  const [count, setCount] = useState(countdown);
  const [phase, setPhase] = useState<"countdown"|"capture"|"done">("countdown");
  const [photoIndex, setPhotoIndex] = useState(0);
  const [capturedSlots, setCapturedSlots] = useState<number[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [lvTick, setLvTick] = useState(0);
  const [dslrError, setDslrError] = useState(false);
  const capturedPhotosRef = useRef<string[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const totalPoses = template.poses;
  const countdownDuration = countdown;
  const isDslr = cameraSource !== "webcam";

  // Start webcam (skipped in DSLR mode) — request the highest resolution available
  useEffect(() => {
    if (isDslr) return;
    let stream: MediaStream | null = null;
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 2560 }, height: { ideal: 1440 } }
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch { /* proceed without camera */ }
    };
    startCamera();
    return () => { stream?.getTracks().forEach(t => t.stop()); };
  }, [isDslr]);

  // DSLR live view — refresh the preview frame periodically
  useEffect(() => {
    if (!isDslr) return;
    const id = setInterval(() => setLvTick(t => t + 1), 450);
    return () => clearInterval(id);
  }, [isDslr]);

  // Countdown logic
  useEffect(() => {
    if (phase === "countdown" && count > 0) {
      const id = setTimeout(() => setCount(c => c - 1), 1000);
      return () => clearTimeout(id);
    }
    if (phase === "countdown" && count === 0) {
      setPhase("capture");
    }
  }, [count, phase]);

  // Capture one photo — from the DSLR (via server) or the webcam video frame
  const capturePhoto = useCallback(async () => {
    if (isDslr) {
      try {
        const url = await dslrCapture();
        capturedPhotosRef.current = [...capturedPhotosRef.current, url];
        return;
      } catch {
        setDslrError(true);
        // fall through to webcam attempt below
      }
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) {
      capturedPhotosRef.current = [...capturedPhotosRef.current, ""];
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) { capturedPhotosRef.current = [...capturedPhotosRef.current, ""]; return; }
    // Capture the native webcam frame with NO stretching — the compositor
    // cover-crops it to each template slot, so faces keep natural proportions.
    const vw = video.videoWidth, vh = video.videoHeight;
    canvas.width = vw;
    canvas.height = vh;
    ctx.drawImage(video, 0, 0, vw, vh);
    capturedPhotosRef.current = [...capturedPhotosRef.current, canvas.toDataURL("image/jpeg", 0.95)];
  }, [isDslr]);

  // After the countdown, take the shot, mark the slot and advance
  useEffect(() => {
    if (phase !== "capture") return;
    let cancelled = false;
    (async () => {
      setCapturing(true);
      await capturePhoto();
      if (cancelled) return;
      setCapturing(false);
      setCapturedSlots(prev => [...prev, photoIndex]);
      await new Promise(r => setTimeout(r, isDslr ? 500 : 800));
      if (cancelled) return;
      const nextIndex = photoIndex + 1;
      if (nextIndex >= totalPoses) {
        setPhase("done");
        setTimeout(() => onComplete(capturedPhotosRef.current), 600);
      } else {
        setPhotoIndex(nextIndex);
        setCount(countdownDuration);
        setPhase("countdown");
      }
    })();
    return () => { cancelled = true; };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Progress percentage for circle
  const progress = phase === "countdown" ? 1 - (count / countdownDuration) : 1;
  const circumference = 2 * Math.PI * 44;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black z-50 flex flex-col select-none">
      {/* Close button */}
      <div className="absolute top-4 left-4 z-30">
        <button onClick={onCancel} className="h-12 w-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white transition-colors">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      {/* Full-screen camera viewfinder */}
      <div className="flex-1 relative overflow-hidden">
        {isDslr ? (
          // The frame is re-requested on every tick. EDSDK answers 503 for the
          // first few while the mirror flips up, so keep retrying and hide the
          // placeholder as soon as a frame decodes.
          <>
            <img src={`${liveviewUrl()}${lvTick}`} alt=""
              onError={() => setDslrError(true)} onLoad={() => setDslrError(false)}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity ${dslrError ? "opacity-0" : "opacity-100"}`} />
            {dslrError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/30">
                <Camera className="h-20 w-20" strokeWidth={1} />
                <span className="text-xs tracking-widest uppercase">Bersiap...</span>
              </div>
            )}
          </>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        )}

        {/* DSLR capture in progress */}
        {capturing && isDslr && (
          <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/40">
            <div className="flex flex-col items-center gap-3 text-white">
              <RefreshCw className="h-10 w-10 animate-spin" strokeWidth={1.5} />
              <span className="text-sm tracking-widest uppercase">Mengambil foto...</span>
            </div>
          </div>
        )}

        {/* Large circular countdown */}
        {phase === "countdown" && count > 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <div className="relative h-32 w-32">
              {/* Background circle */}
              <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="44" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                <circle cx="48" cy="48" r="44" fill="none" stroke="white" strokeWidth="3"
                  strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round" className="transition-all duration-1000 ease-linear" />
              </svg>
              {/* Number */}
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.span
                  key={count}
                  initial={{ opacity: 0, scale: 1.3 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className="text-7xl font-extralight text-white tabular-nums"
                >
                  {count}
                </motion.span>
              </div>
            </div>
          </div>
        )}

        {/* Capture flash */}
        <AnimatePresence>
          {phase === "capture" && (
            <motion.div initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 0.25 }} className="absolute inset-0 bg-white z-20" />
          )}
        </AnimatePresence>
      </div>

      {/* Bottom bar — Photo sequence (transparent overlay) */}
      <div className="absolute bottom-0 left-0 right-0 px-6 pb-8 pt-16 z-20 pointer-events-none bg-gradient-to-t from-black/50 via-transparent to-transparent">
        <div className="flex gap-4 justify-center max-w-sm mx-auto">
          {Array.from({ length: totalPoses }).map((_, i) => {
            const isCaptured = capturedSlots.includes(i);
            const isCurrent = i === photoIndex && phase !== "done";
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, duration: 0.3 }}
                className="flex-1 flex flex-col items-center gap-2"
              >
                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-light transition-all duration-300 ${
                  isCaptured ? "bg-white/25 backdrop-blur-sm border border-white/40 text-white" :
                  isCurrent ? "bg-white/15 backdrop-blur-sm border-2 border-white/70 text-white scale-110" :
                  "bg-white/5 backdrop-blur-sm border border-white/15 text-white/30"
                }`}>
                  {isCaptured ? (
                    <Check className="h-5 w-5 text-white" strokeWidth={2} />
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </motion.div>
  );
}


/* ------------------------------------------------------------------ */
/*  Screen 4 — Preview Results                                         */
/* ------------------------------------------------------------------ */
function PreviewScreen({ template, photos, onPrint, onNext, onBack }: { template: FrameTemplate; photos: string[]; onPrint: () => void; onNext: () => void; onBack: () => void }) {
  const [printing, setPrinting] = useState(false);
  const isStrip = template.size === "portrait", n = template.poses;

  const handlePrint = () => {
    setPrinting(true);
    setTimeout(() => { onPrint(); }, 1500);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between"><BackButton onClick={onBack} /><h2 className="text-sm font-medium tracking-widest uppercase text-muted-foreground">Hasil</h2><button onClick={onNext} className="text-xs tracking-wide uppercase bg-foreground text-primary-foreground px-4 py-1.5 rounded-full">Selesai</button></div>
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-3xl flex flex-col sm:flex-row gap-8 items-center">
          <div className={`${isStrip ? "flex gap-3" : ""}`}>
            {isStrip ? (
              [0,1].map(si => (
                <div key={si} className="w-28 border border-border rounded-sm overflow-hidden bg-black shadow-sm">
                  {Array.from({ length: n }).map((_, j) => (
                    <div key={j} className="w-full aspect-[2/3] bg-muted flex items-center justify-center overflow-hidden">{photos[j] ? <img src={photos[j]} alt={`Photo ${j+1}`} className="w-full h-full object-cover" /> : <Camera className="h-5 w-5 text-muted-foreground" strokeWidth={1} />}</div>
                  ))}
                  <div className="py-1.5 text-center text-[7px] text-white/40 font-cursive italic border-t border-border/30">Groom &amp; Bride</div>
                </div>
              ))
            ) : (
              <div className="w-64 border border-border rounded-sm overflow-hidden bg-black shadow-sm">
                <div className="grid grid-cols-2 gap-1 p-1.5">{Array.from({ length: n }).map((_, j) => <div key={j} className="aspect-[3/2] bg-muted flex items-center justify-center rounded-sm overflow-hidden">{photos[j] ? <img src={photos[j]} alt={`Photo ${j+1}`} className="w-full h-full object-cover" /> : <Camera className="h-5 w-5 text-muted-foreground" strokeWidth={1} />}</div>)}</div>
                <div className="py-1.5 text-center text-[8px] text-white/40 font-cursive italic">Groom &amp; Bride</div>
              </div>
            )}
          </div>
          <div className="space-y-4 flex-1">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Template</span><span className="font-medium">{template.name}</span></div>
              <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Ukuran</span><span className="font-medium">{template.size}</span></div>
              <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">Pose</span><span className="font-medium">{template.poses}</span></div>
              
              <div className="flex justify-between py-2 border-b border-border"><span className="text-muted-foreground">File Digital</span><span className="font-medium">Siap di download</span></div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={handlePrint} disabled={printing} className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-xs tracking-wide uppercase hover:bg-muted transition-colors disabled:opacity-50">{printing ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Mencetak...</> : <><Download className="h-3.5 w-3.5" />Cetak</>}</button>
              <button onClick={onNext} className="flex items-center gap-2 px-4 py-2 bg-foreground text-primary-foreground rounded-lg text-xs tracking-wide uppercase hover:opacity-90 transition-opacity">Selanjutnya →</button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Screen 5 — QR Download                                             */
/* ------------------------------------------------------------------ */
function DownloadScreen({ onNewPhoto, downloadUrl, canPrint, photoId }: { onNewPhoto: () => void; downloadUrl: string; canPrint: boolean; photoId: string }) {
  const url = downloadUrl;
  const [printing, setPrinting] = useState(false);
  const [printed, setPrinted] = useState(false);
  const handlePrint = useCallback(async () => {
    if (!photoId) return;
    setPrinting(true);
    try { await printPhoto(photoId); setPrinted(true); toast.success("Perintah cetak terkirim"); }
    catch (e) { toast.error("Gagal mencetak: " + (e as Error).message); }
    setPrinting(false);
  }, [photoId]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between"><button onClick={onNewPhoto} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"><ChevronLeft className="h-4 w-4" /><span>Kembali</span></button><h2 className="text-sm font-medium tracking-widest uppercase text-muted-foreground">Selesai</h2><div className="w-20" /></div>
      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8">
        <div className="text-center space-y-3"><h2 className="text-2xl font-light tracking-tight">Foto kamu siap!</h2><p className="text-sm text-muted-foreground">{url ? "Scan QR untuk download foto" : "Menyiapkan link download..."}</p></div>
        {url ? (
          <>
            <div className="bg-white p-6 rounded-lg border border-border"><QRCodeSVG value={url} size={160} bgColor="white" fgColor="#111111" /></div>
            <div className="text-center text-sm text-muted-foreground space-y-1"><p>Atau kunjungi:</p><p className="font-mono text-foreground break-all max-w-xs">{url}</p></div>
          </>
        ) : (
          <div className="h-[208px] flex items-center justify-center"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        )}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {canPrint && (
            <button onClick={handlePrint} disabled={printing || !photoId}
              className="flex items-center gap-2 px-6 py-3 border border-border rounded-lg text-sm tracking-wide uppercase hover:bg-muted transition-colors disabled:opacity-50">
              {printing ? <RefreshCw className="h-4 w-4 animate-spin" /> : printed ? <Check className="h-4 w-4" /> : <FileImage className="h-4 w-4" />}
              {printing ? "Mencetak..." : printed ? "Tercetak" : "Cetak Foto"}
            </button>
          )}
          <button onClick={onNewPhoto} className="flex items-center gap-2 px-6 py-3 bg-foreground text-primary-foreground rounded-lg text-sm tracking-wide uppercase hover:opacity-90 transition-opacity"><Camera className="h-4 w-4" />Foto Baru</button>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Screen — Payment (manual: tunai / QRIS)                            */
/* ------------------------------------------------------------------ */
function PaymentScreen({ amount, payment, onPaid, onBack }: { amount: number; payment: BoothConfig["payment"] | null; onPaid: () => void; onBack: () => void }) {
  const qrisPayload = payment?.qrisPayload?.trim() ?? "";
  const qrisImage = payment?.qrisImage ?? "";
  const hasQris = !!(qrisPayload || qrisImage);
  const [method, setMethod] = useState<"cash" | "qris">("cash");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-screen flex flex-col bg-background text-foreground">
      <div className="px-6 py-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"><ChevronLeft className="h-4 w-4" /><span>Kembali</span></button>
        <h2 className="text-sm font-medium tracking-widest uppercase text-muted-foreground">Pembayaran</h2>
        <div className="w-20" />
      </div>

      <div className="flex-1 flex flex-col items-center px-6 py-4 overflow-y-auto">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-1">
            <p className="text-xs tracking-widest uppercase text-muted-foreground">Total Pembayaran</p>
            <p className="text-4xl font-light tracking-tight">{formatRupiah(amount)}</p>
          </div>

          {/* method switch */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setMethod("cash")}
              className={`flex flex-col items-center gap-2 px-4 py-4 rounded-xl border-2 transition-all cursor-pointer ${method === "cash" ? "border-foreground" : "border-border hover:border-foreground/30"}`}>
              <Banknote className="h-6 w-6" strokeWidth={1.5} />
              <span className="text-xs font-medium">Tunai</span>
            </button>
            <button onClick={() => setMethod("qris")} disabled={!hasQris}
              className={`flex flex-col items-center gap-2 px-4 py-4 rounded-xl border-2 transition-all cursor-pointer disabled:opacity-40 ${method === "qris" ? "border-foreground" : "border-border hover:border-foreground/30"}`}>
              <QrCode className="h-6 w-6" strokeWidth={1.5} />
              <span className="text-xs font-medium">Scan QRIS</span>
            </button>
          </div>

          {method === "cash" ? (
            <div className="flex flex-col items-center gap-3 px-4 py-8 rounded-xl border border-border">
              <Banknote className="h-12 w-12 text-muted-foreground" strokeWidth={1} />
              <p className="text-sm text-center">Bayar tunai <span className="font-medium">{formatRupiah(amount)}</span> ke petugas.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              {qrisPayload ? (
                <div className="bg-white p-4 rounded-xl border border-border">
                  <QRCodeSVG value={qrisPayload} size={240} bgColor="white" fgColor="#111111" />
                </div>
              ) : qrisImage ? (
                <div className="bg-white p-4 rounded-xl border border-border">
                  <img src={qrisImage} alt="QRIS" className="w-72 h-72 object-contain" style={{ imageRendering: "crisp-edges" }} />
                </div>
              ) : (
                <div className="px-4 py-6 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
                  QRIS belum diupload. Atur di panel Operator → Pembayaran.
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center">Scan dengan GoPay / OVO / DANA / ShopeePay / m-banking</p>
            </div>
          )}

          {payment?.note && <p className="text-[11px] text-muted-foreground text-center">{payment.note}</p>}

          <button onClick={onPaid}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-foreground text-primary-foreground rounded-xl text-sm font-medium tracking-wide uppercase hover:opacity-90 transition-opacity">
            <Check className="h-4 w-4" />Sudah Bayar
          </button>
          <p className="text-[10px] text-muted-foreground/50 text-center">Tekan setelah pembayaran diterima petugas.</p>
        </div>
      </div>
    </motion.div>
  );
}


/* ------------------------------------------------------------------ */
/*  Settings Sub-panels                                                */
/* ------------------------------------------------------------------ */
function SettingToggle({ label, desc, value, set }: { label: string; desc: string; value: boolean; set: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-border">
      <div><p className="text-xs font-medium">{label}</p><p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p></div>
      <button onClick={() => set(!value)} className={`relative h-5 w-9 rounded-full transition-colors cursor-pointer ${value ? "bg-foreground" : "bg-border"}`}>
        <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${value ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

/** Local editable copy of a config section + a dirty flag (edits are not saved
 *  until the panel's "Simpan" button calls onConfigChange). */
function useDraft<T extends object>(source: T | undefined): [T | null, (patch: Partial<T>) => void, boolean] {
  const [draft, setDraft] = useState<T | null>(source ?? null);
  useEffect(() => { if (source && draft === null) setDraft(source); }, [source, draft]);
  const patch = (p: Partial<T>) => setDraft(d => ({ ...(d as T), ...p }));
  const dirty = !!draft && !!source && JSON.stringify(draft) !== JSON.stringify(source);
  return [draft, patch, dirty];
}

/** Sticky-ish save bar shown at the bottom of a settings panel. */
function SaveBar({ dirty, onSave }: { dirty: boolean; onSave: () => void }) {
  return (
    <div className="sticky bottom-0 -mx-1 px-1 pt-3 pb-1 bg-gradient-to-t from-background via-background flex items-center gap-3">
      <button onClick={onSave} disabled={!dirty}
        className="flex items-center gap-2 px-6 py-2.5 bg-foreground text-primary-foreground rounded-lg text-xs font-medium tracking-wide uppercase hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer">
        <Save className="h-3.5 w-3.5" />Simpan
      </button>
      {dirty
        ? <span className="text-[10px] text-amber-500">Ada perubahan belum disimpan</span>
        : <span className="text-[10px] text-muted-foreground/50">Tersimpan</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Camera Settings (DSLR / webcam)                                    */
/* ------------------------------------------------------------------ */
function CameraSettings({ config, onConfigChange }: { config: BoothConfig | null; onConfigChange: (patch: Partial<BoothConfig>) => void }) {
  const [cam, setCam, dirty] = useDraft(config?.camera);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<CameraStatus | null>(null);
  const [testShot, setTestShot] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);

  const timerOptions = [
    { value: 3, label: "3 detik" }, { value: 5, label: "5 detik" },
    { value: 7, label: "7 detik" }, { value: 10, label: "10 detik" }, { value: 15, label: "15 detik" },
  ];

  const sources: Array<{ id: CameraSource; label: string; desc: string }> = [
    { id: "webcam", label: "Webcam / Capture Card", desc: "Kamera browser (webcam, atau DSLR via HDMI capture card)" },
    { id: "dslr-edsdk", label: "DSLR Canon — EDSDK (langsung)", desc: "Canon EOS via kabel USB. Tanpa software tambahan — SDK sudah tertanam di aplikasi." },
    { id: "dslr-dcc", label: "DSLR — digiCamControl", desc: "Windows. DSLR via kabel USB + digiCamControl (web server aktif)" },
    { id: "dslr-gphoto2", label: "DSLR — gPhoto2", desc: "Linux / Mac. DSLR via kabel USB + gphoto2 terinstall" },
  ];

  const runTest = useCallback(async () => {
    if (dirty) { toast.error("Simpan pengaturan dulu sebelum test"); return; }
    setTesting(true); setStatus(null);
    try { setStatus(await cameraStatus()); } catch (e) { setStatus({ source: cam?.source ?? "webcam", reachable: false, error: String((e as Error).message) }); }
    setTesting(false);
  }, [cam?.source, dirty]);

  const runShot = useCallback(async () => {
    if (dirty) { toast.error("Simpan pengaturan dulu sebelum test"); return; }
    setShooting(true); setTestShot(null);
    try { setTestShot(await dslrCapture()); toast.success("Foto uji berhasil diambil"); }
    catch (e) { toast.error("Gagal ambil foto: " + (e as Error).message); }
    setShooting(false);
  }, [dirty]);

  if (!config || !cam) return <div className="flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" />Memuat konfigurasi...</div>;

  return (
    <div className="space-y-6">
      {/* Countdown */}
      <div className="space-y-3">
        <h4 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Countdown Timer</h4>
        <p className="text-[10px] text-muted-foreground/60">Hitung mundur sebelum tiap foto diambil</p>
        <div className="grid grid-cols-5 gap-2">
          {timerOptions.map(opt => (
            <button key={opt.value} onClick={() => setCam({ countdown: opt.value })}
              className={`flex flex-col items-center gap-1.5 px-3 py-4 rounded-lg border transition-all cursor-pointer ${cam?.countdown === opt.value ? "border-foreground bg-muted shadow-sm" : "border-border hover:border-foreground/30"}`}>
              <span className={`text-2xl font-light tabular-nums ${cam?.countdown === opt.value ? "text-foreground" : "text-muted-foreground"}`}>{opt.value}</span>
              <span className="text-[9px] text-muted-foreground">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="h-px bg-border" />

      {/* Source */}
      <div className="space-y-3">
        <h4 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Sumber Kamera</h4>
        <div className="space-y-2">
          {sources.map(s => (
            <button key={s.id} onClick={() => setCam({ source: s.id })}
              className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all cursor-pointer ${cam?.source === s.id ? "border-foreground" : "border-border hover:border-foreground/30"}`}>
              <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${cam?.source === s.id ? "border-foreground" : "border-muted-foreground/40"}`}>
                {cam?.source === s.id && <div className="h-2 w-2 rounded-full bg-foreground" />}
              </div>
              <div><p className="text-xs font-medium">{s.label}</p><p className="text-[10px] text-muted-foreground mt-0.5">{s.desc}</p></div>
            </button>
          ))}
        </div>

        {cam?.source === "dslr-edsdk" && (
          <div className="space-y-1.5 pt-1">
            <label className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">Path EDSDK (opsional)</label>
            <input type="text" value={cam.edsdkLib ?? ""} onChange={e => setCam({ edsdkLib: e.target.value })}
              placeholder="kosongkan = pakai SDK bawaan aplikasi"
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
            <p className="text-[9px] text-muted-foreground/50">Colok Canon EOS ke PC host pakai kabel USB, nyalakan kamera, mode M/Av/Tv (bukan video). Tutup EOS Utility / digiCamControl dulu — kamera cuma bisa dipakai satu aplikasi. Biarkan kosong kecuali kamu menaruh EDSDK.dll di lokasi lain.</p>
          </div>
        )}
        {cam?.source === "dslr-dcc" && (
          <div className="space-y-1.5 pt-1">
            <label className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">URL digiCamControl Web Server</label>
            <input type="text" value={cam.dccUrl} onChange={e => setCam({ dccUrl: e.target.value })}
              placeholder="http://localhost:5513"
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
            <p className="text-[9px] text-muted-foreground/50">Buka digiCamControl → File → Settings → Webserver → centang "Enable". Jika server di PC yang sama, biarkan localhost:5513.</p>
          </div>
        )}
        {cam?.source === "dslr-gphoto2" && (
          <div className="space-y-1.5 pt-1">
            <label className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">Path / perintah gphoto2</label>
            <input type="text" value={cam.gphoto2Bin} onChange={e => setCam({ gphoto2Bin: e.target.value })}
              placeholder="gphoto2"
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        )}
      </div>

      {/* Test */}
      <div className="flex flex-wrap gap-2">
        <button onClick={runTest} disabled={testing}
          className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-lg text-xs tracking-wide uppercase hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer">
          {testing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}Test Koneksi
        </button>
        {cam?.source !== "webcam" && (
          <button onClick={runShot} disabled={shooting}
            className="flex items-center gap-1.5 px-4 py-2 bg-foreground text-primary-foreground rounded-lg text-xs tracking-wide uppercase hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer">
            {shooting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Aperture className="h-3.5 w-3.5" />}Test Ambil Foto
          </button>
        )}
      </div>

      {status && (
        <div className={`flex items-start gap-2 px-4 py-3 rounded-lg border text-xs ${status.reachable ? "border-green-500/40 bg-green-500/5 text-green-600 dark:text-green-400" : "border-destructive/40 bg-destructive/5 text-destructive"}`}>
          {status.reachable ? <Check className="h-4 w-4 mt-0.5 flex-shrink-0" /> : <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />}
          <div className="space-y-1 min-w-0">
            <p className="font-medium">{status.reachable ? "Kamera siap" : "Tidak terhubung"}</p>
            {(status.info || status.error) && <pre className="text-[10px] whitespace-pre-wrap break-words opacity-80">{status.info || status.error}</pre>}
          </div>
        </div>
      )}
      {testShot && (
        <div className="space-y-2">
          <p className="text-[10px] tracking-widest uppercase text-muted-foreground">Hasil Foto Uji</p>
          <img src={testShot} alt="Test capture" className="max-h-56 rounded-lg border border-border" />
        </div>
      )}

      <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-muted/30 border border-border/50">
        <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-[10px] text-muted-foreground/60">
          Mode DSLR memerlukan server photobooth berjalan di PC yang tersambung ke kamera. Tablet cukup membuka alamat web PC tersebut. Jika kamera gagal saat sesi berlangsung, kiosk otomatis kembali ke webcam.
        </p>
      </div>

      <SaveBar dirty={dirty} onSave={() => onConfigChange({ camera: cam })} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Printer Settings                                                   */
/* ------------------------------------------------------------------ */
function PrinterSettings({ config, onConfigChange, printers, onRefreshPrinters, entries }: { config: BoothConfig | null; onConfigChange: (patch: Partial<BoothConfig>) => void; printers: string[]; onRefreshPrinters: () => void; entries: BookkeepingEntry[] }) {
  const [pr, setPr, dirty] = useDraft(config?.printer);
  const [testing, setTesting] = useState(false);
  const [showCmd, setShowCmd] = useState(false);

  const testPrint = useCallback(async () => {
    if (dirty) { toast.error("Simpan pengaturan dulu sebelum test"); return; }
    if (entries.length === 0) { toast.error("Belum ada foto untuk dicetak"); return; }
    setTesting(true);
    try { await printPhoto(entries[0].id); toast.success("Perintah cetak terkirim"); }
    catch (e) { toast.error("Gagal cetak: " + (e as Error).message); }
    setTesting(false);
  }, [entries, dirty]);

  if (!config || !pr) return <div className="flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" />Memuat konfigurasi...</div>;

  return (
    <div className="space-y-6">
      <SettingToggle label="Aktifkan Cetak" desc="Tampilkan tombol Cetak & aktifkan pencetakan lewat server" value={!!pr?.enabled} set={v => setPr({ enabled: v })} />

      {pr?.enabled && <>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">Printer</label>
            <button onClick={onRefreshPrinters} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <RefreshCw className="h-3 w-3" />Muat ulang
            </button>
          </div>
          <select value={pr?.name || ""} onChange={e => setPr({ name: e.target.value })}
            className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer">
            <option value="">Printer default sistem</option>
            {printers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {printers.length === 0 && <p className="text-[9px] text-muted-foreground/50">Tidak ada printer terdeteksi dari server. Pastikan printer terpasang di PC server.</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">Salinan</label>
            <div className="flex items-center gap-2">{[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => setPr({ copies: n })}
                className={`w-9 h-9 rounded-lg text-xs font-mono transition-colors cursor-pointer ${pr?.copies === n ? "bg-foreground text-primary-foreground" : "border border-border hover:bg-muted"}`}>{n}</button>
            ))}</div>
          </div>
        </div>

        <SettingToggle label="Auto-Print" desc="Otomatis cetak setiap foto setelah sesi selesai" value={!!pr?.autoPrint} set={v => setPr({ autoPrint: v })} />

        <div className="space-y-2">
          <button onClick={() => setShowCmd(!showCmd)} className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            <ChevronRight className={`h-3 w-3 transition-transform ${showCmd ? "rotate-90" : ""}`} />Perintah cetak kustom (lanjutan)
          </button>
          {showCmd && (
            <div className="space-y-1.5">
              <input type="text" value={pr?.command || ""} onChange={e => setPr({ command: e.target.value })}
                placeholder='kosong = default OS &nbsp; | &nbsp; contoh: mspaint /pt "{file}" "{printer}"'
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
              <p className="text-[9px] text-muted-foreground/50">Placeholder: <span className="font-mono">{"{file}"}</span> <span className="font-mono">{"{printer}"}</span> <span className="font-mono">{"{copies}"}</span>. Kosongkan untuk memakai default (Windows: mspaint /pt, Linux/Mac: lp).</p>
            </div>
          )}
        </div>

        <button onClick={testPrint} disabled={testing}
          className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-lg text-xs tracking-wide uppercase hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer">
          {testing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FileImage className="h-3.5 w-3.5" />}Test Print (foto terakhir)
        </button>
      </>}

      <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-muted/30 border border-border/50">
        <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-[10px] text-muted-foreground/60">
          Pencetakan dijalankan oleh server photobooth di PC yang tersambung ke printer. Atur ukuran kertas / borderless di preferensi printer Windows (default printer), lalu pilih printer itu di sini.
        </p>
      </div>

      <SaveBar dirty={dirty} onSave={() => onConfigChange({ printer: pr })} />
    </div>
  );
}


function StorageSettings({ publicLinks: propLinks, onPublicLinksChange, homeMode, onHomeModeChange, screensaverImage, onScreensaverChange }: { publicLinks: Array<{ id: string; name: string; url: string; folderId: string; isPublic: boolean; status: "active" | "expired" | "error"; createdAt: string; files: number; totalSize: string }>; onPublicLinksChange: (links: Array<{ id: string; name: string; url: string; folderId: string; isPublic: boolean; status: "active" | "expired" | "error"; createdAt: string; files: number; totalSize: string }>) => void; homeMode: "default"|"camera"|"screensaver"; onHomeModeChange: (m: "default"|"camera"|"screensaver") => void; screensaverImage: string; onScreensaverChange: (img: string) => void }) {
  const publicLinks = propLinks;


  const [gdriveConnected, setGdriveConnected] = useState(false);
  const [folderName, setFolderName] = useState("Photobooth Kiosk");
  const [autoUpload, setAutoUpload] = useState(true);
  const [originalQuality, setOriginalQuality] = useState(true);
  const [uploadSize, setUploadSize] = useState("0 MB");
  const [connecting, setConnecting] = useState(false);
  const [scanning, setScanning] = useState(false);


  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [showAddLink, setShowAddLink] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const connectGoogleDrive = useCallback(() => {
    setConnecting(true);
    setTimeout(() => { setGdriveConnected(true); setConnecting(false); }, 2500);
  }, []);

  const disconnectGoogleDrive = useCallback(() => {
    setGdriveConnected(false); setUploadSize("0 MB");
  }, []);

  const simulateUpload = useCallback(() => {
    setScanning(true);
    setTimeout(() => { setUploadSize("142.3 MB"); setScanning(false); }, 2000);
  }, []);

  const addPublicLink = useCallback(() => {
    if (!newLinkUrl.trim()) return;
    // Extract folder ID from Google Drive URL
    const match = newLinkUrl.match(/drive\.google\.com\/(?:drive\/folders\/|drive\/u\/\d+\/folders\/)([a-zA-Z0-9_-]+)/);
    const folderId = match ? match[1] : newLinkUrl.split("/").pop() || "unknown";
    const newLink = {
      id: `link-${Date.now()}`,
      name: newLinkName.trim() || `Folder ${publicLinks.length + 1}`,
      url: newLinkUrl.trim(),
      folderId,
      isPublic: true,
      status: "active" as const,
      createdAt: new Date().toISOString().split("T")[0],
      files: 0,
      totalSize: "0 MB",
    };
    onPublicLinksChange([...publicLinks, newLink]);
    setNewLinkName(""); setNewLinkUrl(""); setShowAddLink(false);
  }, [newLinkName, newLinkUrl, publicLinks.length]);

  const removeLink = useCallback((id: string) => {
    onPublicLinksChange(publicLinks.filter(l => l.id !== id));
  }, []);

  const toggleLinkPublic = useCallback((id: string) => {
    onPublicLinksChange(publicLinks.map(l => l.id === id ? { ...l, isPublic: !l.isPublic, status: l.isPublic ? "expired" : "active" } : l));
  }, []);

  const copyLink = useCallback((id: string, url: string) => {
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const extractFolderId = useCallback((url: string): string => {
    const match = url.match(/drive\.google\.com\/(?:drive\/folders\/|drive\/u\/\d+\/folders\/)([a-zA-Z0-9_-]+)/);
    return match ? match[1] : url.split("/").pop() || "";
  }, []);

  const Toggle = ({ label, desc, value, set }: { label: string; desc: string; value: boolean; set: (v: boolean) => void }) => (
    <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-border"><div><p className="text-xs font-medium">{label}</p><p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p></div><button onClick={()=>set(!value)} className={`relative h-5 w-9 rounded-full transition-colors ${value?"bg-foreground":"bg-border"}`}><div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${value?"left-[18px]":"left-0.5"}`} /></button></div>
  );

  return (
    <div className="space-y-6">
      {/* Google Drive Connection */}
      <div className="space-y-3">
        <h4 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Google Drive</h4>
        {gdriveConnected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border">
              <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center"><HardDrive className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} /></div>
              <div className="flex-1 min-w-0"><p className="text-xs font-medium">Google Drive</p><p className="text-[10px] text-muted-foreground truncate">{folderName} • {uploadSize} terupload</p></div>
              <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-green-500" /><span className="text-[10px] text-muted-foreground">Terhubung</span></div>
            </div>
            <div className="flex gap-2">
              <button onClick={simulateUpload} disabled={scanning} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-border rounded-lg text-xs hover:bg-muted transition-colors disabled:opacity-50">
                <Upload className={`h-3.5 w-3.5 ${scanning?"animate-pulse":""}`} />{scanning?"Uploading...":"Upload Sekarang"}
              </button>
              <button onClick={disconnectGoogleDrive} className="flex items-center justify-center gap-1.5 px-3 py-2 border border-border rounded-lg text-xs text-destructive hover:bg-destructive/5 transition-colors">
                Putuskan
              </button>
            </div>
          </div>
        ) : (
          <button onClick={connectGoogleDrive} disabled={connecting}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-border text-xs hover:bg-muted transition-colors disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${connecting?"animate-spin":""}`} />{connecting?"Menghubungkan...":"Hubungkan Google Drive"}
          </button>
        )}
      </div>

      {gdriveConnected && <>
        <div className="h-px bg-border" />
        <div className="space-y-4">
          <h4 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Pengaturan Folder</h4>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">Nama Folder</label>
            <div className="relative"><FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input type="text" value={folderName} onChange={e=>setFolderName(e.target.value)} className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>
        </div>
        <div className="h-px bg-border" />
        <div className="space-y-3">
          <h4 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Pengaturan Upload</h4>
          <Toggle label="Auto-Upload" desc="Upload foto otomatis setelah sesi selesai" value={autoUpload} set={setAutoUpload} />
          <Toggle label="Original Quality" desc="Upload dalam kualitas asli tanpa kompresi" value={originalQuality} set={setOriginalQuality} />
        </div>
      </>}

      <div className="h-px bg-border" />

      {/* Public Google Drive Links (No Login Required) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Link Publik Google Drive</h4>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">Tautan folder yang bisa diakses tanpa login — bagikan ke pelanggan</p>
          </div>
          <button onClick={() => setShowAddLink(!showAddLink)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-foreground text-primary-foreground rounded-lg hover:opacity-90 transition-opacity">
            <Plus className="h-3.5 w-3.5" />Tambah Link
          </button>
        </div>

        {/* Add Link Form */}
        {showAddLink && (
          <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">Nama Link</label>
              <input type="text" value={newLinkName} onChange={e => setNewLinkName(e.target.value)}
                placeholder="Contoh: Foto Pernikahan Budi & Ani"
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">URL Folder Google Drive</label>
              <input type="url" value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring" />
              <p className="text-[9px] text-muted-foreground/40">Buka folder di Google Drive → klik Bagikan → Ubah ke "Siapa saja yang memiliki link" → Salin link</p>
            </div>
            {newLinkUrl && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                <Check className="h-3.5 w-3.5 text-green-600" />
                <span className="text-[10px] text-green-700 dark:text-green-300">
                  Folder ID: <span className="font-mono">{extractFolderId(newLinkUrl)}</span>
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={addPublicLink} disabled={!newLinkUrl.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-foreground text-primary-foreground rounded-lg text-[11px] tracking-wide uppercase hover:opacity-90 transition-opacity disabled:opacity-50">
                <Check className="h-3 w-3" />Simpan Link
              </button>
              <button onClick={() => { setShowAddLink(false); setNewLinkName(""); setNewLinkUrl(""); }}
                className="px-4 py-2 border border-border rounded-lg text-[11px] tracking-wide uppercase hover:bg-muted transition-colors">
                Batal
              </button>
            </div>
          </div>
        )}

        {/* Links List */}
        <div className="space-y-2">
          {publicLinks.map(link => (
            <div key={link.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${link.isPublic ? "border-border" : "border-border/50 opacity-60"}`}>
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${link.isPublic ? "bg-blue-50 dark:bg-blue-950" : "bg-muted"}`}>
                <Globe className={`h-5 w-5 ${link.isPublic ? "text-blue-500" : "text-muted-foreground"}`} strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium truncate">{link.name}</p>
                  {link.isPublic ? (
                    <span className="text-[9px] px-1.5 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full">Publik</span>
                  ) : (
                    <span className="text-[9px] px-1.5 py-0.5 bg-muted rounded-full text-muted-foreground">Privat</span>
                  )}
                  {link.status === "active" && <div className="h-1.5 w-1.5 rounded-full bg-green-500" />}
                  {link.status === "expired" && <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />}
                </div>
                <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">{link.url}</p>
                <p className="text-[9px] text-muted-foreground/50 mt-0.5">{link.files} file • {link.totalSize} • Dibuat {link.createdAt}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => copyLink(link.id, link.url)} title="Salin link"
                  className={`h-8 w-8 flex items-center justify-center rounded-lg transition-colors ${copiedId === link.id ? "bg-green-100 dark:bg-green-900 text-green-600" : "hover:bg-muted text-muted-foreground"}`}>
                  {copiedId === link.id ? <Check className="h-3.5 w-3.5" /> : <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>}
                </button>
                <button onClick={() => toggleLinkPublic(link.id)} title={link.isPublic ? "Nonaktifkan" : "Aktifkan"}
                  className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors">
                  {link.isPublic ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button onClick={() => removeLink(link.id)} title="Hapus"
                  className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-destructive/5 text-destructive transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {publicLinks.length === 0 && !showAddLink && (
            <div className="flex flex-col items-center gap-3 py-8 rounded-xl border border-dashed border-border text-center">
              <Globe className="h-8 w-8 text-muted-foreground/30" strokeWidth={1} />
              <div>
                <p className="text-xs text-muted-foreground">Belum ada link publik</p>
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">Tambahkan link folder Google Drive untuk dibagikan ke pelanggan</p>
              </div>
            </div>
          )}
        </div>

        {/* Home Screen Mode */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Layar Beranda</h4>
          <p className="text-[10px] text-muted-foreground">Pilih tampilan layar beranda kiosk</p>
          <div className="grid grid-cols-3 gap-3">
            {([
              { id: "default" as const, label: "Default", desc: "Ikon & teks", icon: "📷" },
              { id: "camera" as const, label: "Live Kamera", desc: "Preview langsung", icon: "🎥" },
              { id: "screensaver" as const, label: "Screensaver", desc: "Gambar kustom", icon: "🖼️" },
            ]).map(mode => (
              <button key={mode.id} onClick={() => onHomeModeChange(mode.id)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${homeMode === mode.id ? "border-foreground shadow-md" : "border-border hover:border-foreground/30"}`}>
                <span className="text-2xl">{mode.icon}</span>
                <div className="text-center">
                  <p className="text-xs font-medium">{mode.label}</p>
                  <p className="text-[9px] text-muted-foreground">{mode.desc}</p>
                </div>
                {homeMode === mode.id && <Check className="h-4 w-4 text-foreground" />}
              </button>
            ))}
          </div>
        </div>

        {/* Screensaver Image Upload */}
        {homeMode === "screensaver" && (
          <div className="space-y-3">
            <h4 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Gambar Screensaver</h4>
            <div className="space-y-3">
              {screensaverImage ? (
                <div className="relative rounded-xl overflow-hidden border border-border">
                  <img src={screensaverImage} alt="Screensaver" className="w-full h-40 object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                    <p className="text-xs text-white/80">Screensaver aktif</p>
                    <button onClick={() => onScreensaverChange("")} className="text-xs text-red-400 hover:text-red-300 transition-colors">Hapus</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file"; input.accept = "image/*";
                  input.onchange = () => {
                    const file = input.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => onScreensaverChange(reader.result as string);
                    reader.readAsDataURL(file);
                  };
                  input.click();
                }} className="w-full h-40 rounded-xl border-2 border-dashed border-border hover:border-foreground/30 flex flex-col items-center justify-center gap-3 transition-colors">
                  <Upload className="h-8 w-8 text-muted-foreground/40" strokeWidth={1} />
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Klik untuk upload gambar</p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">JPG, PNG, atau GIF</p>
                  </div>
                </button>
              )}
            </div>
          </div>
        )}

{/* Info */}
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-muted/30 border border-border/50">
          <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="text-[10px] text-muted-foreground/60 space-y-1">
            <p><strong className="text-muted-foreground">Link Publik</strong> — Folder yang bisa diakses siapa saja tanpa login Google. Cocok untuk QR code download foto.</p>
            <p>Cara membuat: Buka folder di Drive → klik <strong className="text-muted-foreground">Bagikan</strong> → Ubah ke <strong className="text-muted-foreground">"Siapa saja yang memiliki link"</strong> → Salin URL.</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2"><button className="flex items-center gap-1.5 px-4 py-2 bg-foreground text-primary-foreground rounded-lg text-xs tracking-wide uppercase hover:opacity-90 transition-opacity"><Save className="h-3.5 w-3.5" />Simpan</button></div>
    </div>
  );
}

function TemplateSettings({ templates, onTemplatesChange, onEditTemplate }: { templates: FrameTemplate[]; onTemplatesChange: (t: FrameTemplate[]) => void; onEditTemplate: (t: FrameTemplate) => void }) {
  const [uploading, setUploading] = useState(false); const [newName, setNewName] = useState(""); const [editId, setEditId] = useState<string|null>(null);
  const handleUpload = useCallback(() => { const input = document.createElement("input"); input.type = "file"; input.accept = "image/*"; input.multiple = true; input.onchange = () => { const files = input.files; if (!files||files.length===0) return; setUploading(true); Array.from(files).forEach(file => { const reader = new FileReader(); reader.onload = () => { onTemplatesChange([...templates, { id:`tpl-${Date.now()}`, name:file.name.replace(/\.[^.]+$/,""), description:"Template kustom", thumbnail:reader.result as string, layoutType:"none", size:"portrait", poses:0, strips:0, isDefault:false}]); }; reader.readAsDataURL(file); }); setTimeout(()=>setUploading(false), 800); }; input.click(); }, [templates, onTemplatesChange]);
  const handleCreateBlank = useCallback(() => { onTemplatesChange([...templates, { id:`tpl-${Date.now()}`, name:newName.trim()||`Template ${templates.length+1}`, description:"Template kustom baru", thumbnail:"", layoutType:"none", size:"portrait", poses:0, strips:0, isDefault:false}]); setNewName(""); }, [newName, templates, onTemplatesChange]);
  const handleDelete = useCallback((id: string) => { onTemplatesChange(templates.filter(t=>t.id!==id)); }, [templates, onTemplatesChange]);
  const handleToggleDefault = useCallback((id: string) => { onTemplatesChange(templates.map(t=>t.id===id?{...t,isDefault:!t.isDefault}:t)); }, [templates, onTemplatesChange]);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h4 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Frame Templates</h4><button onClick={handleUpload} disabled={uploading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-foreground text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"><Upload className={`h-3.5 w-3.5 ${uploading?"animate-pulse":""}`} />{uploading?"Uploading...":"Upload Template"}</button></div>
      <div className="flex gap-2"><input type="text" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Nama template baru..." className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring" onKeyDown={e=>e.key==="Enter"&&handleCreateBlank()} /><button onClick={handleCreateBlank} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors"><Plus className="h-3.5 w-3.5" />Buat Baru</button></div>
      <div className="h-px bg-border" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {templates.map(tpl=>(
          <div key={tpl.id} className={`group border rounded-lg p-3 space-y-2 transition-all cursor-pointer hover:border-foreground/50 hover:shadow-md ${editId===tpl.id?"border-foreground":"border-border"}`}>
            <div onClick={()=>onEditTemplate(tpl)} className="h-28 rounded-md bg-white border border-border/50 flex items-center justify-center overflow-hidden hover:bg-muted/20 transition-colors">{tpl.thumbnail?<img src={tpl.thumbnail} alt={tpl.name} className="w-full h-full object-contain" />:tpl.layoutType==="none"?<Image className="h-8 w-8 text-muted-foreground/30" strokeWidth={1} />:<TemplatePreviewSmall template={tpl} />}</div>
            <div onClick={()=>setEditId(editId===tpl.id?null:tpl.id)}><p className="text-xs font-medium truncate">{tpl.name}</p><p className="text-[10px] text-muted-foreground truncate">{tpl.description}</p></div>
            
            <div className="flex items-center justify-between"><button onClick={(e)=>{e.stopPropagation();handleToggleDefault(tpl.id)}} className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${tpl.isDefault?"bg-foreground text-primary-foreground":"border border-border text-muted-foreground hover:bg-muted"}`}>{tpl.isDefault?"Default":"Set Default"}</button><div className="flex items-center gap-1"><button onClick={()=>onEditTemplate(tpl)} className="flex items-center gap-1 px-2 py-1 text-[9px] bg-foreground text-primary-foreground rounded hover:opacity-80 transition-opacity"><Edit className="h-2.5 w-2.5" />Edit</button>{!tpl.isDefault&&<button onClick={(e)=>{e.stopPropagation();handleDelete(tpl.id)}} className="p-1 hover:bg-muted rounded transition-colors"><Trash2 className="h-3 w-3 text-destructive" /></button>}</div></div>
            {editId===tpl.id&&<div className="space-y-2 pt-2 border-t border-border">
              <input type="text" value={tpl.name} onChange={e=>onTemplatesChange(templates.map(t=>t.id===tpl.id?{...t,name:e.target.value}:t))} className="w-full h-8 px-2 rounded border border-border bg-background text-[10px] focus:outline-none focus:ring-1 focus:ring-ring" placeholder="Nama" />
              <div className="space-y-1"><label className="text-[9px] uppercase text-muted-foreground">Layout</label><div className="flex flex-wrap gap-1">{(["none","layout-elegant","layout-minimal","layout-floral","layout-retro","layout-polaroid","layout-cinema","layout-modern","layout-romantic","layout-bold"] as const).map(v=><button key={v} onClick={()=>onTemplatesChange(templates.map(t=>t.id===tpl.id?{...t,layoutType:v}:t))} className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors ${tpl.layoutType===v?"bg-foreground text-primary-foreground":"border border-border hover:bg-muted"}`}>{v==="none"?"None":v.replace("layout-","").toUpperCase()}</button>)}</div></div>
              <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><label className="text-[9px] uppercase text-muted-foreground">Ukuran</label><div className="flex gap-1"><span className="text-[9px] px-2 py-0.5 bg-foreground text-primary-foreground rounded">4R Portrait</span></div></div><div className="space-y-1"><label className="text-[9px] uppercase text-muted-foreground">Pose</label><div className="flex gap-1">{[1,2,3,4].map(v=><button key={v} onClick={()=>onTemplatesChange(templates.map(t=>t.id===tpl.id?{...t,poses:v}:t))} className={`w-6 h-5 rounded text-[9px] transition-colors ${tpl.poses===v?"bg-foreground text-primary-foreground":"border border-border hover:bg-muted"}`}>{v}</button>)}</div></div>
              </div>
            </div>}
          </div>
        ))}
      </div>
      <div className="flex justify-end pt-2"><button className="flex items-center gap-1.5 px-4 py-2 bg-foreground text-primary-foreground rounded-lg text-xs tracking-wide uppercase hover:opacity-90 transition-opacity"><Save className="h-3.5 w-3.5" />Simpan</button></div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/*  Bookkeeping Settings                                               */
/* ------------------------------------------------------------------ */
function BookkeepingSettings({ entries, onReset, sessionPrice, onPriceChange }: { entries: BookkeepingEntry[]; onReset: () => void; sessionPrice: number; onPriceChange: (v: number) => void }) {
  const today = getTodayDate();
  const todayEntries = entries.filter(e => e.date === today);
  const todayRevenue = todayEntries.reduce((sum, e) => sum + e.price, 0);
  const allTimeRevenue = entries.reduce((sum, e) => sum + e.price, 0);
  const [confirmReset, setConfirmReset] = useState(false);
  const [priceInput, setPriceInput] = useState(String(sessionPrice));
  useEffect(() => { setPriceInput(String(sessionPrice)); }, [sessionPrice]);

  const handleExport = useCallback(() => {
    if (todayEntries.length === 0) return;
    const csv = exportBookkeepingToCSV(todayEntries);
    downloadCSV(csv, `pembukuan-${today}.csv`);
  }, [todayEntries, today]);

  const handleExportAll = useCallback(() => {
    if (entries.length === 0) return;
    const csv = exportBookkeepingToCSV(entries);
    downloadCSV(csv, `pembukuan-semua-${today}.csv`);
  }, [entries, today]);

  const handleReset = useCallback(() => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 5000);
      return;
    }
    onReset();
    setConfirmReset(false);
  }, [confirmReset, onReset]);

  const groupedByDate = entries.reduce<Record<string, BookkeepingEntry[]>>((acc, e) => {
    if (!acc[e.date]) acc[e.date] = [];
    acc[e.date].push(e);
    return acc;
  }, {});
  const dates = Object.keys(groupedByDate).sort().reverse();

  return (
    <div className="space-y-6">
      {/* Harga per sesi */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Harga per Sesi</h4>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rp</span>
          <input type="number" value={priceInput} onChange={e => setPriceInput(e.target.value)}
            onBlur={() => onPriceChange(Math.max(0, Math.round(Number(priceInput) || 0)))}
            className="w-40 h-9 px-3 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
          <button onClick={() => onPriceChange(Math.max(0, Math.round(Number(priceInput) || 0)))}
            className="flex items-center gap-1.5 px-3 py-2 bg-foreground text-primary-foreground rounded-lg text-[11px] tracking-wide uppercase hover:opacity-90 transition-opacity cursor-pointer">
            <Save className="h-3.5 w-3.5" />Simpan
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground/50">Dipakai untuk mencatat pemasukan setiap sesi foto.</p>
      </div>
      <div className="h-px bg-border" />
      <div className="grid grid-cols-3 gap-4">
        <div className="border border-border rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground"><DollarSign className="h-4 w-4" strokeWidth={1.5} /><span className="text-[10px] tracking-widest uppercase">Hari Ini</span></div>
          <p className="text-2xl font-light tracking-tight">{formatRupiah(todayRevenue)}</p>
          <p className="text-[10px] text-muted-foreground">{todayEntries.length} transaksi</p>
        </div>
        <div className="border border-border rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground"><TrendingUp className="h-4 w-4" strokeWidth={1.5} /><span className="text-[10px] tracking-widest uppercase">Total Semua</span></div>
          <p className="text-2xl font-light tracking-tight">{formatRupiah(allTimeRevenue)}</p>
          <p className="text-[10px] text-muted-foreground">{entries.length} transaksi</p>
        </div>
        <div className="border border-border rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground"><Clock className="h-4 w-4" strokeWidth={1.5} /><span className="text-[10px] tracking-widest uppercase">Rata-rata</span></div>
          <p className="text-2xl font-light tracking-tight">{formatRupiah(todayEntries.length > 0 ? Math.round(todayRevenue / todayEntries.length) : 0)}</p>
          <p className="text-[10px] text-muted-foreground">per sesi</p>
        </div>
      </div>
      <div className="h-px bg-border" />
      <div className="space-y-3">
        <h4 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Transaksi Hari Ini</h4>
        {todayEntries.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-6 rounded-lg border border-border text-xs text-muted-foreground justify-center">
            <Calendar className="h-4 w-4" />Belum ada transaksi hari ini
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2 font-medium tracking-widest uppercase text-[10px] text-muted-foreground">Waktu</th>
                  <th className="text-left px-4 py-2 font-medium tracking-widest uppercase text-[10px] text-muted-foreground">Template</th>
                  <th className="text-right px-4 py-2 font-medium tracking-widest uppercase text-[10px] text-muted-foreground">Harga</th>
                </tr>
              </thead>
              <tbody>
                {todayEntries.sort((a, b) => b.timestamp - a.timestamp).map(e => (
                  <tr key={e.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">{new Date(e.timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-4 py-2.5">{e.templateName}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatRupiah(e.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="flex gap-3">
        <button onClick={handleExport} disabled={todayEntries.length === 0} className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-lg text-xs tracking-wide uppercase hover:bg-muted transition-colors disabled:opacity-40">
          <FileSpreadsheet className="h-3.5 w-3.5" />Export Hari Ini
        </button>
        <button onClick={handleExportAll} disabled={entries.length === 0} className="flex items-center gap-1.5 px-4 py-2 border border-border rounded-lg text-xs tracking-wide uppercase hover:bg-muted transition-colors disabled:opacity-40">
          <Download className="h-3.5 w-3.5" />Export Semua
        </button>
        <div className="flex-1" />
        <button onClick={handleReset} disabled={entries.length === 0} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs tracking-wide uppercase transition-colors ${confirmReset ? "bg-destructive text-destructive-foreground" : "border border-destructive text-destructive hover:bg-destructive/5"}`}>
          <Trash2 className="h-3.5 w-3.5" />{confirmReset ? "Konfirmasi Reset?" : "Reset Hari"}
        </button>
      </div>
      {dates.length > 1 && (
        <>
          <div className="h-px bg-border" />
          <div className="space-y-3">
            <h4 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Riwayat</h4>
            <div className="space-y-2">
              {dates.slice(1, 8).map(date => {
                const dayEntries = groupedByDate[date];
                const dayRevenue = dayEntries.reduce((sum, e) => sum + e.price, 0);
                return (
                  <div key={date} className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <p className="text-xs font-medium">{new Date(date + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" })}</p>
                        <p className="text-[10px] text-muted-foreground">{dayEntries.length} transaksi</p>
                      </div>
                    </div>
                    <p className="text-sm font-medium">{formatRupiah(dayRevenue)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/*  Screen 6 — Settings (Operator)                                     */
/* ------------------------------------------------------------------ */
function ThemeSettings({ theme, onThemeChange }: { theme: "light"|"dark"|"warm"; onThemeChange: (t: "light"|"dark"|"warm") => void }) {
  const themes = [
    { id: "light" as const, name: "Light", desc: "Tema terang — Minimalism", colors: ["#fafafa", "#111111", "#ffffff"], icon: "☀️" },
    { id: "dark" as const, name: "Dark", desc: "Tema gelap — Minimalism", colors: ["#0a0a0a", "#ededed", "#141414"], icon: "🌙" },
    { id: "warm" as const, name: "Warm", desc: "Tema hangat — earthy tones", colors: ["#1a1410", "#e8d5c0", "#2a2018"], icon: "🔥" },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h4 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Tema Aplikasi</h4>
        <p className="text-[10px] text-muted-foreground">Pilih tema untuk semua menu dan tampilan kiosk</p>
      </div>
      <div className="space-y-3">
        {themes.map(t => (
          <button key={t.id} onClick={() => onThemeChange(t.id)}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${theme === t.id ? "border-foreground shadow-md" : "border-border hover:border-foreground/30"}`}>
            <span className="text-2xl">{t.icon}</span>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium">{t.name}</p>
              <p className="text-[10px] text-muted-foreground">{t.desc}</p>
            </div>
            {/* Color swatches */}
            <div className="flex gap-1.5">
              {t.colors.map((c, i) => (
                <div key={i} className="w-5 h-5 rounded-full border border-border/50" style={{ backgroundColor: c }} />
              ))}
            </div>
            {theme === t.id && (
              <div className="h-6 w-6 rounded-full bg-foreground flex items-center justify-center">
                <Check className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
            )}
          </button>
        ))}
      </div>
      <div className="h-px bg-border" />
      <div className="space-y-3">
        <h4 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">Preview</h4>
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center"><Camera className="h-4 w-4" /></div>
              <div className="flex-1"><div className="h-2.5 w-24 bg-muted rounded" /><div className="h-1.5 w-16 bg-muted/50 rounded mt-1" /></div>
            </div>
            <div className="h-px bg-border" />
            <div className="grid grid-cols-3 gap-2">
              {[1,2,3].map(i => <div key={i} className="h-16 rounded-lg bg-muted" />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Payment Settings (manual: tunai / QRIS)                            */
/* ------------------------------------------------------------------ */
function PaymentSettings({ config, onConfigChange }: { config: BoothConfig | null; onConfigChange: (patch: Partial<BoothConfig>) => void }) {
  const [pay, setPay, dirty] = useDraft(config?.payment);

  const uploadQris = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setPay({ qrisImage: reader.result as string });
      reader.readAsDataURL(file);
    };
    input.click();
  };

  if (!config || !pay) return <div className="flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" />Memuat konfigurasi...</div>;
  return (
    <div className="space-y-6">
      <SettingToggle label="Aktifkan Pembayaran" desc="Tampilkan layar bayar (Tunai / QRIS) setelah pelanggan melihat hasil foto, sebelum cetak/download" value={!!pay?.enabled} set={v => setPay({ enabled: v })} />

      <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border">
        <Banknote className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <p className="text-xs text-muted-foreground"><span className="text-foreground font-medium">Tunai</span> selalu tersedia — pelanggan bayar ke petugas, lalu petugas tekan "Sudah Bayar".</p>
      </div>

      {/* QRIS */}
      <div className="space-y-3">
        <h4 className="text-xs font-medium tracking-widest uppercase text-muted-foreground">QRIS (opsional)</h4>
        <p className="text-[10px] text-muted-foreground/60">Screenshot QR <strong>QRIS / "Terima Uang"</strong> dari SeaBank / DANA / GoPay / OVO / ShopeePay (atau QRIS merchant). <strong>Crop sampai hanya QR-nya</strong> yang kelihatan, jangan ada tampilan aplikasi di sekitarnya — biar tidak buram saat di-scan.</p>
        {pay?.qrisImage ? (
          <div className="flex items-center gap-4">
            <img src={pay.qrisImage} alt="QRIS" className="w-28 h-28 object-contain rounded-lg border border-border bg-white p-1" />
            <div className="flex flex-col gap-2">
              <button onClick={uploadQris} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer"><Upload className="h-3.5 w-3.5" />Ganti</button>
              <button onClick={() => setPay({ qrisImage: "" })} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/5 rounded-lg transition-colors cursor-pointer"><Trash2 className="h-3.5 w-3.5" />Hapus</button>
            </div>
          </div>
        ) : (
          <button onClick={uploadQris} className="w-full h-28 rounded-xl border-2 border-dashed border-border hover:border-foreground/30 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer">
            <Upload className="h-6 w-6 text-muted-foreground/40" strokeWidth={1} />
            <span className="text-xs text-muted-foreground">Upload gambar QRIS</span>
          </button>
        )}
        {!pay?.qrisImage && <p className="text-[10px] text-muted-foreground/50">Jika belum diupload, di layar bayar hanya muncul pilihan Tunai.</p>}
      </div>
      <div className="h-px bg-border" />

      <div className="space-y-1.5">
        <label className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">Catatan (opsional)</label>
        <input value={pay?.note || ""} onChange={e => setPay({ note: e.target.value })} placeholder="Contoh: Bayar ke petugas di meja kasir" className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>

      <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-muted/30 border border-border/50">
        <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-[10px] text-muted-foreground/60">
          Verifikasi manual — tidak ada auto-cek pembayaran. Petugas memastikan tunai diterima / QRIS terbayar, lalu tekan "Sudah Bayar" di layar. Harga sesi diatur di tab Pembukuan.
        </p>
      </div>

      <SaveBar dirty={dirty} onSave={() => onConfigChange({ payment: pay })} />
    </div>
  );
}

function SettingsPanel({ templates, onTemplatesChange, onEditTemplate, onBack, bookkeeping, onResetBookkeeping, config, onConfigChange, serverOk, printers, onRefreshPrinters, publicLinks, onPublicLinksChange, theme, onThemeChange, homeMode, onHomeModeChange, screensaverImage, onScreensaverChange }: { templates: FrameTemplate[]; onTemplatesChange: (t: FrameTemplate[]) => void; onEditTemplate: (t: FrameTemplate) => void; onBack: () => void; bookkeeping: BookkeepingEntry[]; onResetBookkeeping: () => void; config: BoothConfig | null; onConfigChange: (patch: Partial<BoothConfig>) => void; serverOk: boolean; printers: string[]; onRefreshPrinters: () => void; publicLinks: Array<{ id: string; name: string; url: string; folderId: string; isPublic: boolean; status: "active" | "expired" | "error"; createdAt: string; files: number; totalSize: string }>; onPublicLinksChange: (links: Array<{ id: string; name: string; url: string; folderId: string; isPublic: boolean; status: "active" | "expired" | "error"; createdAt: string; files: number; totalSize: string }>) => void; theme: "light"|"dark"|"warm"; onThemeChange: (t: "light"|"dark"|"warm") => void; homeMode: "default"|"camera"|"screensaver"; onHomeModeChange: (m: "default"|"camera"|"screensaver") => void; screensaverImage: string; onScreensaverChange: (img: string) => void }) {
  const [activeTab, setActiveTab] = useState("templates");
  const tabs = [
    { id: "templates", label: "Frame Template", icon: Image },
    { id: "camera", label: "Kamera", icon: Camera },
    { id: "printer", label: "Printer", icon: FileImage },
    { id: "payment", label: "Pembayaran", icon: CreditCard },
    { id: "storage", label: "Penyimpanan", icon: HardDrive },
    { id: "bookkeeping", label: "Pembukuan", icon: DollarSign },
    { id: "theme", label: "Tema", icon: Sun },
  ];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between"><BackButton onClick={onBack} /><h2 className="text-sm font-medium tracking-widest uppercase flex items-center gap-2"><Settings className="h-4 w-4" strokeWidth={1.5} />Settings</h2><div className="w-20" /></div>
      {!serverOk && (
        <div className="mx-6 mb-3 flex items-start gap-2 px-4 py-3 rounded-lg border border-amber-500/40 bg-amber-500/5 text-amber-600 dark:text-amber-400 text-xs">
          <WifiOff className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div className="space-y-0.5">
            <p className="font-medium">Server photobooth tidak terhubung</p>
            <p className="text-[11px] opacity-80">Pengaturan & template hanya tersimpan di browser ini. Foto, cetak, DSLR, dan QR download <strong>tidak berfungsi</strong> tanpa server berjalan di PC booth. Deploy Netlify hanya untuk frontend — jalankan <span className="font-mono">npm run dev</span> di PC booth.</p>
          </div>
        </div>
      )}
      <div className="flex-1 flex flex-col sm:flex-row px-6 pb-6 gap-6 overflow-y-auto">
        <nav className="sm:w-48 flex-shrink-0 space-y-1">{tabs.map(tab=><button key={tab.id} onClick={()=>setActiveTab(tab.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs tracking-wide transition-colors ${activeTab===tab.id?"bg-foreground text-primary-foreground":"text-muted-foreground hover:bg-muted"}`}><tab.icon className="h-4 w-4" strokeWidth={1.5} />{tab.label}</button>)}</nav>
        <div className="flex-1 min-h-0">
          {activeTab==="templates"&&<TemplateSettings templates={templates} onTemplatesChange={onTemplatesChange} onEditTemplate={onEditTemplate} />}
          {activeTab==="camera"&&<CameraSettings config={config} onConfigChange={onConfigChange} />}
          {activeTab==="printer"&&<PrinterSettings config={config} onConfigChange={onConfigChange} printers={printers} onRefreshPrinters={onRefreshPrinters} entries={bookkeeping} />}
          {activeTab==="payment"&&<PaymentSettings config={config} onConfigChange={onConfigChange} />}
          {activeTab==="storage"&&<StorageSettings publicLinks={publicLinks} onPublicLinksChange={onPublicLinksChange} homeMode={homeMode} onHomeModeChange={onHomeModeChange} screensaverImage={screensaverImage} onScreensaverChange={onScreensaverChange} />}
          {activeTab==="theme"&&<ThemeSettings theme={theme} onThemeChange={onThemeChange} />}
          {activeTab==="bookkeeping"&&<BookkeepingSettings entries={bookkeeping} onReset={onResetBookkeeping} sessionPrice={config?.pricing.sessionPrice ?? 25000} onPriceChange={(v)=>onConfigChange({ pricing: { sessionPrice: v } })} />}
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main KioskApp                                                      */
/* ------------------------------------------------------------------ */
export default function KioskApp() {
  const [screen, setScreen] = useState<KioskScreen>("home");
  const [selectedTemplate, setSelectedTemplate] = useState<FrameTemplate|null>(null);
  const [editingTemplate, setEditingTemplate] = useState<FrameTemplate|null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [templates, setTemplatesState] = useState<FrameTemplate[]>(DEFAULT_TEMPLATES);
  const [bookkeeping, setBookkeeping] = useState<BookkeepingEntry[]>([]);
  const [config, setConfig] = useState<BoothConfig | null>(null);
  const [serverOk, setServerOk] = useState(true);
  const [printers, setPrinters] = useState<string[]>([]);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [uploadedId, setUploadedId] = useState("");

  const countdownDuration = config?.camera.countdown ?? 7;
  const sessionPrice = config?.pricing.sessionPrice ?? 25000;
  const cameraSource: CameraSource = config?.camera.source ?? "webcam";

  // Persist template changes (server + localStorage fallback)
  const setTemplates = useCallback((next: FrameTemplate[]) => {
    setTemplatesState(next);
    saveTemplates(next)
      .then(({ synced }) => toast.success(synced ? "Template tersimpan" : "Template tersimpan di perangkat ini (server offline)"))
      .catch(() => {});
  }, []);

  // Persist a config patch and confirm with a toast.
  const updateConfig = useCallback((patch: Partial<BoothConfig>) => {
    setConfig((prev) => {
      const base = prev ?? ({} as BoothConfig);
      return {
        ...base, ...patch,
        camera: { ...base.camera, ...(patch.camera || {}) },
        printer: { ...base.printer, ...(patch.printer || {}) },
        pricing: { ...base.pricing, ...(patch.pricing || {}) },
        payment: { ...base.payment, ...(patch.payment || {}) },
      };
    });
    apiSaveConfig(patch)
      .then(({ config: next, synced }) => {
        setConfig(next);
        setServerOk(synced);
        toast.success(synced ? "Pengaturan tersimpan" : "Tersimpan di perangkat ini — server tidak terhubung");
      })
      .catch(() => toast.error("Gagal menyimpan pengaturan"));
  }, []);
  const [theme, setTheme] = useState<"light"|"dark"|"warm">(() => {
    try { return (localStorage.getItem("kiosk-theme") as "light"|"dark"|"warm") || "dark"; } catch { return "dark"; }
  });
  const [homeMode, setHomeMode] = useState<"default"|"camera"|"screensaver">(() => {
    try { return (localStorage.getItem("kiosk-homemode") as "default"|"camera"|"screensaver") || "default"; } catch { return "default"; }
  });
  const [screensaverImage, setScreensaverImage] = useState<string>(() => {
    try { return localStorage.getItem("kiosk-screensaver") || ""; } catch { return ""; }
  });
  const [publicLinks, setPublicLinks] = useState<Array<{
    id: string; name: string; url: string; folderId: string;
    isPublic: boolean; status: "active" | "expired" | "error";
    createdAt: string; files: number; totalSize: string;
  }>>([
    { id: "link-1", name: "Foto Hari Ini", url: "https://drive.google.com/drive/folders/1ABCdef123", folderId: "1ABCdef123", isPublic: true, status: "active", createdAt: "2026-08-25", files: 24, totalSize: "156 MB" },
  ]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark", "warm");
    root.classList.add(theme);
    root.setAttribute("data-theme", theme);
    try { localStorage.setItem("kiosk-theme", theme); } catch {}
  }, [theme]);

  useEffect(() => { const h = () => setIsOnline(true); const o = () => setIsOnline(false); window.addEventListener("online", h); window.addEventListener("offline", o); return () => { window.removeEventListener("online", h); window.removeEventListener("offline", o); }; }, []);

  // Load bookkeeping from the local server (survives restarts)
  useEffect(() => { listPhotos().then(setBookkeeping).catch(() => {}); }, []);

  // Load operator config + templates + printer list (server, or localStorage fallback)
  useEffect(() => {
    getConfig().then((c) => { setConfig(c); setServerOk(apiServerOnline); });
    listTemplates().then((t) => {
      if (t.length > 0) setTemplatesState(t);
      else saveTemplates(DEFAULT_TEMPLATES).catch(() => {});
    }).catch(() => {});
    listPrinters().then(setPrinters).catch(() => {});
  }, []);

  const goToHome = () => { setScreen("home"); setSelectedTemplate(null); setEditingTemplate(null); setDownloadUrl(""); setUploadedId(""); };
  const resetBookkeeping = () => { clearPhotos().catch(() => {}); setBookkeeping([]); };
  const goBack = useCallback(() => { const backMap: Record<string, string> = { templates:"home", ready:"templates", camera:"ready", preview:"camera", payment:"preview", download:"home", settings:"home", editor:"settings", home:"home" }; setScreen(c=>backMap[c] as KioskScreen); }, []);
  const paymentEnabled = !!config?.payment.enabled;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {screen !== "camera" && screen !== "editor" && <StatusBar isOnline={isOnline} />}
      <AnimatePresence mode="wait">
        {screen==="home"&&<HomeScreen key="home" onNavigate={setScreen} homeMode={homeMode} screensaverImage={screensaverImage} />}
        {screen==="templates"&&<TemplateSelectionScreen key="templates" templates={templates} selectedId={selectedTemplate?.id??templates.find(t=>t.isDefault)?.id??""} onSelect={t=>{setSelectedTemplate(t);setScreen("ready")}} onBack={goToHome} />}
        {screen==="ready"&&selectedTemplate&&<CameraReadyScreen key="ready" template={selectedTemplate} onStart={()=>setScreen("camera")} onCancel={goToHome} />}
        {screen==="camera"&&selectedTemplate&&<CameraScreen key="camera" template={selectedTemplate} cameraSource={cameraSource} onComplete={(photos)=>{setCapturedPhotos(photos);setScreen("preview")}} onCancel={goToHome} countdown={countdownDuration} />}
        {screen==="preview"&&selectedTemplate&&<FrameCompositor key="preview" template={selectedTemplate} photos={capturedPhotos} theme={theme} price={sessionPrice} canPrint={!!config?.printer.enabled} paymentEnabled={paymentEnabled} onUploaded={(entry)=>{setDownloadUrl(entry.downloadUrl);setUploadedId(entry.id);setBookkeeping(prev=>[entry,...prev.filter(e=>e.id!==entry.id)]);}} onNext={()=>setScreen(paymentEnabled?"payment":"download")} onBack={goToHome} />}
        {screen==="payment"&&<PaymentScreen key="payment" amount={sessionPrice} payment={config?.payment ?? null} onPaid={()=>setScreen("download")} onBack={()=>setScreen("preview")} />}
        {screen==="download"&&<DownloadScreen key="download" onNewPhoto={goToHome} downloadUrl={downloadUrl} canPrint={!!config?.printer.enabled} photoId={uploadedId} />}
        {screen==="settings"&&<SettingsPanel key="settings" templates={templates} onTemplatesChange={setTemplates} onEditTemplate={t=>{setEditingTemplate(t);setScreen("editor")}} onBack={goToHome} bookkeeping={bookkeeping} onResetBookkeeping={resetBookkeeping} config={config} onConfigChange={updateConfig} serverOk={serverOk} printers={printers} onRefreshPrinters={()=>listPrinters().then(setPrinters).catch(()=>{})} publicLinks={publicLinks} onPublicLinksChange={setPublicLinks} theme={theme} onThemeChange={setTheme} homeMode={homeMode} onHomeModeChange={(m)=>{setHomeMode(m);try{localStorage.setItem("kiosk-homemode",m)}catch{}}} screensaverImage={screensaverImage} onScreensaverChange={(img)=>{setScreensaverImage(img);try{localStorage.setItem("kiosk-screensaver",img)}catch{}}} />}
      {screen==="editor"&&editingTemplate&&<TemplateEditor key="editor" template={editingTemplate} onSave={(t)=>{setTemplates(templates.map(x=>x.id===t.id?t:x));setScreen("settings")}} onBack={goBack} />}
      </AnimatePresence>
    </div>
  );
}
