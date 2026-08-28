import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Camera, Image, Type, Square, Palette, QrCode, User, ChevronLeft,
  ChevronRight, Undo2, Redo2, Trash2, Download, Upload, Save,
  RotateCcw, AlignCenterHorizontal, AlignCenterVertical, AlignStartHorizontal,
  AlignStartVertical, AlignEndHorizontal, AlignEndVertical, Lock, Unlock,
  Eye, EyeOff, Plus, Layers, ZoomIn, ZoomOut, Grid3X3, Move,
} from "lucide-react";
import type { FrameTemplate, EditorElement } from "@/types/kiosk";

interface TemplateEditorProps {
  template: FrameTemplate;
  onSave: (template: FrameTemplate) => void;
  onBack: () => void;
}

/* ------------------------------------------------------------------ */
/*  Default canvas elements based on template                          */
/* ------------------------------------------------------------------ */
function getDefaultElements(template: FrameTemplate): EditorElement[] {
  const isStrip = template.size === "portrait";
  const cw = isStrip ? 472 : 709;
  const ch = isStrip ? 709 : 472;
  const elements: EditorElement[] = [];

  elements.push({
    id: "bg", type: "background", label: "Background",
    x: 0, y: 0, w: cw, h: ch, rotation: 0, locked: false, visible: true, zIndex: 0,
    bgColor: "#111111",
  });

  if (template.layoutType === "none") {
    elements.push({
      id: "photo-1", type: "photo", label: "Photo 1",
      x: 20, y: 20, w: cw - 40, h: ch - 40, rotation: 0, locked: false, visible: true, zIndex: 1,
      photoIndex: 0, bgColor: "#333333",
    });
    return elements;
  }

  if (isStrip) {
    const cols = 2;
    const colW = (cw - 60) / cols;
    const pad = 15;
    const gap = 10;
    const headerH = 30;
    const footerH = 40;
    const availH = ch - headerH - footerH - pad * 2;
    const slotH = (availH - gap * (template.poses - 1)) / template.poses;

    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < template.poses; row++) {
        const idx = col * template.poses + row;
        elements.push({
          id: `photo-${idx + 1}`, type: "photo", label: `Photo ${idx + 1}`,
          x: pad + col * (colW + gap),
          y: headerH + pad + row * (slotH + gap),
          w: colW, h: slotH, rotation: 0, locked: false, visible: true, zIndex: 1,
          photoIndex: idx, bgColor: "#333333",
        });
      }
    }

    elements.push({
      id: "footer-text", type: "text", label: "Footer Text",
      x: 0, y: ch - footerH - 5, w: cw, h: footerH,
      rotation: 0, locked: false, visible: true, zIndex: 2,
      text: "Groom & Bride", fontSize: 24, fontFamily: "cursive",
      color: "#666666",
    });
  } else {
    const pad = 30;
    const gap = 15;
    const n = template.poses;

    if (n <= 2) {
      const slotW = (cw - pad * 2 - gap) / 2;
      const slotH = ch * 0.7;
      for (let i = 0; i < n; i++) {
        elements.push({
          id: `photo-${i + 1}`, type: "photo", label: `Photo ${i + 1}`,
          x: pad + i * (slotW + gap), y: pad,
          w: slotW, h: slotH, rotation: 0, locked: false, visible: true, zIndex: 1,
          photoIndex: i, bgColor: "#333333",
        });
      }
    } else if (n === 3) {
      const leftW = (cw - pad * 3 - gap) * 0.5;
      const rightW = cw - pad * 2 - gap - leftW;
      const leftSlotH = (ch - pad * 2 - gap) / 2;
      const rightSlotH = ch - pad * 2;
      elements.push({ id: "photo-1", type: "photo", label: "Photo 1", x: pad, y: pad, w: leftW, h: leftSlotH, rotation: 0, locked: false, visible: true, zIndex: 1, photoIndex: 0, bgColor: "#333333" });
      elements.push({ id: "photo-2", type: "photo", label: "Photo 2", x: pad, y: pad + leftSlotH + gap, w: leftW, h: leftSlotH, rotation: 0, locked: false, visible: true, zIndex: 1, photoIndex: 1, bgColor: "#333333" });
      elements.push({ id: "photo-3", type: "photo", label: "Photo 3", x: pad + leftW + gap, y: pad, w: rightW, h: rightSlotH, rotation: 0, locked: false, visible: true, zIndex: 1, photoIndex: 2, bgColor: "#333333" });
    } else {
      const slotW = (cw - pad * 2 - gap) / 2;
      const slotH = (ch - pad * 2 - gap) / 2;
      for (let i = 0; i < Math.min(n, 4); i++) {
        elements.push({
          id: `photo-${i + 1}`, type: "photo", label: `Photo ${i + 1}`,
          x: pad + (i % 2) * (slotW + gap), y: pad + Math.floor(i / 2) * (slotH + gap),
          w: slotW, h: slotH, rotation: 0, locked: false, visible: true, zIndex: 1,
          photoIndex: i, bgColor: "#333333",
        });
      }
    }

    const isHeader = template.layoutType === "layout-elegant" || template.layoutType === "layout-floral";
    elements.push({
      id: isHeader ? "header-text" : "footer-text", type: "text",
      label: isHeader ? "Header Text" : "Footer Text",
      x: 0, y: isHeader ? 5 : ch - 50, w: cw, h: 40,
      rotation: 0, locked: false, visible: true, zIndex: 2,
      text: "Groom & Bride", fontSize: 28, fontFamily: "cursive",
      color: "#aaaaaa",
    });
  }

  return elements;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const ADD_TOOLS = [
  { id: "photo", icon: Camera, label: "Photo From Booth" },
  { id: "image", icon: Image, label: "Image" },
  { id: "text", icon: Type, label: "Text" },
  { id: "shape", icon: Square, label: "Shape" },
  { id: "background", icon: Palette, label: "Background Color" },
  { id: "qr", icon: QrCode, label: "QR Code" },
  { id: "session", icon: User, label: "Session Data" },
];

const FONT_OPTIONS = ["sans-serif", "serif", "cursive", "monospace", "Georgia", "Times New Roman", "Courier New", "Arial", "Helvetica"];

/* ------------------------------------------------------------------ */
/*  Main TemplateEditor Component                                      */
/* ------------------------------------------------------------------ */
export default function TemplateEditor({ template, onSave, onBack }: TemplateEditorProps) {
  const [elements, setElements] = useState<EditorElement[]>(() => (template.editorElements && template.editorElements.length > 0 ? template.editorElements : getDefaultElements(template)));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [history, setHistory] = useState<EditorElement[][]>([elements]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [zoom, setZoom] = useState(0.5);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [gridSize] = useState(10);
  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ id: string; startX: number; startY: number; elX: number; elY: number } | null>(null);
  const resizing = useRef<{ id: string; startX: number; startY: number; elX: number; elY: number; elW: number; elH: number; corner: string } | null>(null);
  const didDrag = useRef(false);
  const clickedElement = useRef(false);

  const isStrip = template.size === "portrait";
  const canvasW = isStrip ? 472 : 709;
  const canvasH = isStrip ? 709 : 472;
  const selected = elements.find(e => e.id === selectedId);

  const snap = (v: number) => snapToGrid ? Math.round(v / gridSize) * gridSize : v;

  const pushHistory = useCallback((newElements: EditorElement[]) => {
    setHistory(prev => [...prev.slice(0, historyIdx + 1), newElements]);
    setHistoryIdx(prev => prev + 1);
    setElements(newElements);
  }, [historyIdx]);

  const undo = useCallback(() => {
    if (historyIdx > 0) {
      setHistoryIdx(historyIdx - 1);
      setElements(history[historyIdx - 1]);
    }
  }, [historyIdx, history]);

  const redo = useCallback(() => {
    if (historyIdx < history.length - 1) {
      setHistoryIdx(historyIdx + 1);
      setElements(history[historyIdx + 1]);
    }
  }, [historyIdx, history]);

  const updateElement = useCallback((id: string, updates: Partial<EditorElement>) => {
    pushHistory(elements.map(e => e.id === id ? { ...e, ...updates } : e));
  }, [elements, pushHistory]);

  const addElement = useCallback((type: EditorElement["type"]) => {
    const newEl: EditorElement = {
      id: `${type}-${Date.now()}`, type, label: `${type.charAt(0).toUpperCase() + type.slice(1)} ${elements.filter(e => e.type === type).length + 1}`,
      x: snap(canvasW / 2 - 100), y: snap(canvasH / 2 - 50), w: 200, h: 100, rotation: 0, locked: false, visible: true,
      zIndex: elements.length,
      ...(type === "text" ? { text: "Text", fontSize: 24, color: "#ffffff", fontFamily: "sans-serif" } : {}),
      ...(type === "shape" ? { bgColor: "#555555", borderRadius: 0 } : {}),
      ...(type === "photo" ? { photoIndex: elements.filter(e => e.type === "photo").length, bgColor: "#333333" } : {}),
      ...(type === "qr" ? { bgColor: "#ffffff", w: 120, h: 120 } : {}),
      ...(type === "image" ? { w: 200, h: 200 } : {}),
      ...(type === "session" ? { w: 200, h: 60 } : {}),
    };
    pushHistory([...elements, newEl]);
    setSelectedId(newEl.id);
  }, [elements, pushHistory, canvasW, canvasH, snap]);

  const deleteElement = useCallback((id: string) => {
    pushHistory(elements.filter(e => e.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [elements, selectedId, pushHistory]);

  const toggleVisible = useCallback((id: string) => {
    updateElement(id, { visible: !elements.find(e => e.id === id)?.visible });
  }, [elements, updateElement]);

  const toggleLock = useCallback((id: string) => {
    updateElement(id, { locked: !elements.find(e => e.id === id)?.locked });
  }, [elements, updateElement]);

  const bringForward = useCallback((id: string) => {
    const maxZ = Math.max(...elements.map(e => e.zIndex));
    updateElement(id, { zIndex: maxZ + 1 });
  }, [elements, updateElement]);

  const sendBackward = useCallback((id: string) => {
    const minZ = Math.min(...elements.map(e => e.zIndex));
    updateElement(id, { zIndex: minZ - 1 });
  }, [elements, updateElement]);

  const duplicateElement = useCallback((id: string) => {
    const el = elements.find(e => e.id === id);
    if (!el) return;
    const newEl = { ...el, id: `${el.type}-${Date.now()}`, label: `${el.label} Copy`, x: el.x + 20, y: el.y + 20, zIndex: elements.length };
    pushHistory([...elements, newEl]);
    setSelectedId(newEl.id);
  }, [elements, pushHistory]);

  const handleImageUpload = useCallback((id: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => updateElement(id, { imageData: reader.result as string });
      reader.readAsDataURL(file);
    };
    input.click();
  }, [updateElement]);

  // Drag handling — click selects, drag moves (with 3px threshold)
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent, el: EditorElement) => {
    clickedElement.current = true;
    if (el.locked) { setSelectedId(el.id); return; }
    e.stopPropagation();
    setSelectedId(el.id);
    didDrag.current = false;
    dragging.current = { id: el.id, startX: e.clientX, startY: e.clientY, elX: el.x, elY: el.y };
  }, []);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging.current) {
      const rawDx = e.clientX - dragging.current.startX;
      const rawDy = e.clientY - dragging.current.startY;
      if (!didDrag.current && Math.abs(rawDx) < 3 && Math.abs(rawDy) < 3) return;
      didDrag.current = true;
      const dx = rawDx / zoom;
      const dy = rawDy / zoom;
      const newX = snap(dragging.current.elX + dx);
      const newY = snap(dragging.current.elY + dy);
      setElements(prev => prev.map(el => el.id === dragging.current!.id ? { ...el, x: newX, y: newY } : el));
    }
    if (resizing.current) {
      const dx = (e.clientX - resizing.current.startX) / zoom;
      const dy = (e.clientY - resizing.current.startY) / zoom;
      const { corner } = resizing.current;
      let newX = resizing.current.elX, newY = resizing.current.elY;
      let newW = resizing.current.elW, newH = resizing.current.elH;
      if (corner.includes("e")) newW = snap(Math.max(20, resizing.current.elW + dx));
      if (corner.includes("w")) { newW = snap(Math.max(20, resizing.current.elW - dx)); newX = snap(resizing.current.elX + dx); }
      if (corner.includes("s")) newH = snap(Math.max(20, resizing.current.elH + dy));
      if (corner.includes("n")) { newH = snap(Math.max(20, resizing.current.elH - dy)); newY = snap(resizing.current.elY + dy); }
      setElements(prev => prev.map(el => el.id === resizing.current!.id ? { ...el, x: newX, y: newY, w: newW, h: newH } : el));
    }
  }, [zoom, snap]);

  const handleCanvasMouseUp = useCallback(() => {
    if (dragging.current) {
      if (didDrag.current) pushHistory([...elements]);
      dragging.current = null;
      didDrag.current = false;
    }
    if (resizing.current) {
      pushHistory([...elements]);
      resizing.current = null;
    }
  }, [elements, pushHistory]);

  const handleResizeStart = useCallback((e: React.MouseEvent, el: EditorElement, corner: string) => {
    e.stopPropagation();
    resizing.current = { id: el.id, startX: e.clientX, startY: e.clientY, elX: el.x, elY: el.y, elW: el.w, elH: el.h, corner };
  }, []);

  // Zoom with mouse wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(z => Math.min(2, Math.max(0.1, z - e.deltaY * 0.001)));
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      if (e.key === "Delete" || e.key === "Backspace") { if (selectedId) { e.preventDefault(); deleteElement(selectedId); } }
      if ((e.ctrlKey || e.metaKey) && e.key === "d") { if (selectedId) { e.preventDefault(); duplicateElement(selectedId); } }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [undo, redo, selectedId, deleteElement, duplicateElement]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col bg-background overflow-hidden">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" />Kembali
          </button>
          <div className="h-4 w-px bg-border" />
          <h2 className="text-sm font-medium tracking-wide">Print Layout Editor</h2>
          <span className="text-[10px] text-muted-foreground tracking-wider uppercase bg-muted px-2 py-0.5 rounded">{template.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <ToolBtn icon={<Grid3X3 className="h-3.5 w-3.5" />} label="Grid" onClick={() => setShowGrid(!showGrid)} active={showGrid} />
          <ToolBtn icon={<Move className="h-3.5 w-3.5" />} label="Snap" onClick={() => setSnapToGrid(!snapToGrid)} active={snapToGrid} />
          <div className="h-4 w-px bg-border mx-1" />
          <ToolBtn icon={<ZoomOut className="h-3.5 w-3.5" />} label="-" onClick={() => setZoom(z => Math.max(0.1, z - 0.1))} />
          <span className="text-[10px] font-mono text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
          <ToolBtn icon={<ZoomIn className="h-3.5 w-3.5" />} label="+" onClick={() => setZoom(z => Math.min(2, z + 0.1))} />
          <div className="h-4 w-px bg-border mx-1" />
          <ToolBtn icon={<Undo2 className="h-3.5 w-3.5" />} label="Undo" onClick={undo} disabled={historyIdx === 0} />
          <ToolBtn icon={<Redo2 className="h-3.5 w-3.5" />} label="Redo" onClick={redo} disabled={historyIdx === history.length - 1} />
          <div className="h-4 w-px bg-border mx-1" />
          {selected && <>
            <ToolBtn icon={<ChevronRight className="h-3.5 w-3.5 rotate-[-90deg]" />} label="Forward" onClick={() => bringForward(selected.id)} />
            <ToolBtn icon={<ChevronLeft className="h-3.5 w-3.5 rotate-[-90deg]" />} label="Backward" onClick={() => sendBackward(selected.id)} />
            <div className="h-4 w-px bg-border mx-1" />
          </>}
          <ToolBtn icon={<Save className="h-3.5 w-3.5" />} label="Save" onClick={() => onSave({ ...template, editorElements: elements })} primary />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden" onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp} onMouseLeave={handleCanvasMouseUp}>
        {/* Left Panel — Add Elements */}
        {showLeftPanel && (
          <div className="w-52 border-r border-border bg-card flex flex-col overflow-y-auto flex-shrink-0">
            <div className="px-3 py-2.5 border-b border-border">
              <h3 className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">Add Elements</h3>
            </div>
            <div className="p-2 space-y-0.5">
              {ADD_TOOLS.map(tool => (
                <button key={tool.id} onClick={() => addElement(tool.id as EditorElement["type"])}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  <tool.icon className="h-4 w-4" strokeWidth={1.5} />
                  {tool.label}
                </button>
              ))}
            </div>
            <div className="px-3 py-2.5 border-t border-border mt-auto space-y-2">
              <h3 className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">Layout Info</h3>
              <div className="space-y-1 text-[10px] text-muted-foreground">
                <div className="flex justify-between"><span>Canvas</span><span className="font-mono">{canvasW} × {canvasH}</span></div>
                <div className="flex justify-between"><span>Elements</span><span className="font-mono">{elements.length}</span></div>
                <div className="flex justify-between"><span>Template</span><span className="font-mono">{template.size}</span></div>
                <div className="flex justify-between"><span>Grid</span><span className="font-mono">{gridSize}px</span></div>
              </div>
            </div>
          </div>
        )}

        {/* Canvas Area */}
        <div ref={containerRef} className="flex-1 overflow-auto flex items-center justify-center bg-muted/20 p-8" onWheel={handleWheel}>
          <div ref={canvasRef} className="relative shadow-2xl border border-border/50"
            style={{ width: canvasW, height: canvasH, transform: `scale(${zoom})`, transformOrigin: "center" }}
            onClick={() => { if (!clickedElement.current) setSelectedId(null); clickedElement.current = false; }}>

            {/* Grid overlay */}
            {showGrid && (
              <svg className="absolute inset-0 pointer-events-none z-40" width={canvasW} height={canvasH}>
                <defs>
                  <pattern id="grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
                    <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            )}

            {/* Render elements sorted by zIndex */}
            {[...elements].sort((a, b) => a.zIndex - b.zIndex).map(el => {
              if (!el.visible) return null;
              const isSelected = el.id === selectedId;
              return (
                <div key={el.id}
                  onMouseDown={(e) => handleCanvasMouseDown(e, el)}
                  className={`absolute ${el.locked ? "cursor-default" : "cursor-move"} ${isSelected ? "ring-2 ring-blue-500 z-50" : ""}`}
                  style={{ left: el.x, top: el.y, width: el.w, height: el.h, transform: `rotate(${el.rotation}deg)` }}>

                  {el.type === "background" && <div className="w-full h-full" style={{ backgroundColor: el.bgColor || "#111111" }} />}
                  {el.type === "photo" && (
                    <div className="w-full h-full flex items-center justify-center border-2 border-dashed border-white/20 rounded-sm relative" style={{ backgroundColor: el.bgColor || "#333333" }}>
                      <span className="text-white/40 text-2xl font-light">{(el.photoIndex ?? 0) + 1}</span>
                      <span className="absolute bottom-1 right-1.5 text-[8px] text-white/20 font-mono">Photo {(el.photoIndex ?? 0) + 1}</span>
                    </div>
                  )}
                  {el.type === "text" && (
                    <div className="w-full h-full flex items-center justify-center select-none" style={{ color: el.color || "#ffffff", fontSize: el.fontSize || 16, fontFamily: el.fontFamily || "sans-serif" }}>
                      {el.text || "Text"}
                    </div>
                  )}
                  {el.type === "shape" && (
                    <div className="w-full h-full" style={{ backgroundColor: el.bgColor || "#555555", borderRadius: el.borderRadius || 0 }} />
                  )}
                  {el.type === "qr" && (
                    <div className="w-full h-full flex items-center justify-center bg-white rounded-sm">
                      <QrCode className="h-8 w-8 text-gray-300" />
                    </div>
                  )}
                  {el.type === "image" && (
                    <div className="w-full h-full flex items-center justify-center border border-white/20 rounded-sm bg-white/5 overflow-hidden">
                      {el.imageData ? <img src={el.imageData} alt="" className="w-full h-full object-cover" /> : <Image className="h-8 w-8 text-white/20" strokeWidth={1} />}
                    </div>
                  )}
                  {el.type === "session" && (
                    <div className="w-full h-full flex items-center justify-center border border-white/20 rounded-sm bg-white/5">
                      <span className="text-white/30 text-xs">Session Data</span>
                    </div>
                  )}

                  {/* Selection handles */}
                  {isSelected && !el.locked && (
                    <>
                      <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-blue-500 rounded-sm cursor-nw-resize border border-white" onMouseDown={(e) => handleResizeStart(e, el, "nw")} />
                      <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-blue-500 rounded-sm cursor-ne-resize border border-white" onMouseDown={(e) => handleResizeStart(e, el, "ne")} />
                      <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-blue-500 rounded-sm cursor-sw-resize border border-white" onMouseDown={(e) => handleResizeStart(e, el, "sw")} />
                      <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-blue-500 rounded-sm cursor-se-resize border border-white" onMouseDown={(e) => handleResizeStart(e, el, "se")} />
                      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 rounded-sm cursor-n-resize border border-white" onMouseDown={(e) => handleResizeStart(e, el, "n")} />
                      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 rounded-sm cursor-s-resize border border-white" onMouseDown={(e) => handleResizeStart(e, el, "s")} />
                      <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 bg-blue-500 rounded-sm cursor-w-resize border border-white" onMouseDown={(e) => handleResizeStart(e, el, "w")} />
                      <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-blue-500 rounded-sm cursor-e-resize border border-white" onMouseDown={(e) => handleResizeStart(e, el, "e")} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel — Properties */}
        {showRightPanel && (
          <div className="w-56 border-l border-border bg-card flex flex-col overflow-y-auto flex-shrink-0">
            {selected ? (
              <>
                <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
                  <h3 className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground">Properties</h3>
                  <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{selected.type}</span>
                </div>

                {/* Position & Size */}
                <div className="p-3 space-y-3 border-b border-border">
                  <h4 className="text-[9px] font-medium tracking-widest uppercase text-muted-foreground">Position & Size</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <PropInput label="X" value={selected.x} onChange={v => updateElement(selected.id, { x: Number(v) })} />
                    <PropInput label="Y" value={selected.y} onChange={v => updateElement(selected.id, { y: Number(v) })} />
                    <PropInput label="W" value={selected.w} onChange={v => updateElement(selected.id, { w: Number(v) })} />
                    <PropInput label="H" value={selected.h} onChange={v => updateElement(selected.id, { h: Number(v) })} />
                  </div>
                  <PropInput label="°" value={selected.rotation} onChange={v => updateElement(selected.id, { rotation: Number(v) })} />
                </div>

                {/* Text Properties */}
                {selected.type === "text" && (
                  <div className="p-3 space-y-3 border-b border-border">
                    <h4 className="text-[9px] font-medium tracking-widest uppercase text-muted-foreground">Text</h4>
                    <input type="text" value={selected.text || ""} onChange={e => updateElement(selected.id, { text: e.target.value })}
                      className="w-full h-8 px-2 rounded border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring" placeholder="Text content..." />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[9px] text-muted-foreground">Size</label>
                        <input type="number" value={selected.fontSize || 16} onChange={e => updateElement(selected.id, { fontSize: Number(e.target.value) })}
                          className="w-full h-7 px-2 rounded border border-border bg-background text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] text-muted-foreground">Color</label>
                        <input type="color" value={selected.color || "#ffffff"} onChange={e => updateElement(selected.id, { color: e.target.value })}
                          className="w-full h-7 rounded border border-border cursor-pointer" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-muted-foreground">Font</label>
                      <select value={selected.fontFamily || "sans-serif"} onChange={e => updateElement(selected.id, { fontFamily: e.target.value })}
                        className="w-full h-7 px-2 rounded border border-border bg-background text-[10px] focus:outline-none focus:ring-1 focus:ring-ring">
                        {FONT_OPTIONS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {/* Shape Properties */}
                {selected.type === "shape" && (
                  <div className="p-3 space-y-3 border-b border-border">
                    <h4 className="text-[9px] font-medium tracking-widest uppercase text-muted-foreground">Shape</h4>
                    <div className="space-y-1">
                      <label className="text-[9px] text-muted-foreground">Fill Color</label>
                      <input type="color" value={selected.bgColor || "#555555"} onChange={e => updateElement(selected.id, { bgColor: e.target.value })}
                        className="w-full h-7 rounded border border-border cursor-pointer" />
                    </div>
                    <PropInput label="R" value={selected.borderRadius || 0} onChange={v => updateElement(selected.id, { borderRadius: Number(v) })} />
                  </div>
                )}

                {/* Photo Properties */}
                {selected.type === "photo" && (
                  <div className="p-3 space-y-3 border-b border-border">
                    <h4 className="text-[9px] font-medium tracking-widest uppercase text-muted-foreground">Photo Slot</h4>
                    <PropInput label="#" value={(selected.photoIndex ?? 0) + 1} onChange={v => updateElement(selected.id, { photoIndex: Math.max(0, Number(v) - 1) })} />
                  </div>
                )}

                {/* Image Properties */}
                {selected.type === "image" && (
                  <div className="p-3 space-y-3 border-b border-border">
                    <h4 className="text-[9px] font-medium tracking-widest uppercase text-muted-foreground">Image</h4>
                    <button onClick={() => handleImageUpload(selected.id)}
                      className="w-full h-8 flex items-center justify-center gap-1.5 rounded border border-border text-[10px] text-muted-foreground hover:bg-muted transition-colors">
                      <Upload className="h-3 w-3" />Upload Image
                    </button>
                    {selected.imageData && (
                      <button onClick={() => updateElement(selected.id, { imageData: undefined })}
                        className="w-full h-7 flex items-center justify-center gap-1 rounded text-[10px] text-destructive hover:bg-destructive/5 transition-colors">
                        Remove Image
                      </button>
                    )}
                  </div>
                )}

                {/* Background Properties */}
                {selected.type === "background" && (
                  <div className="p-3 space-y-3 border-b border-border">
                    <h4 className="text-[9px] font-medium tracking-widest uppercase text-muted-foreground">Background</h4>
                    <div className="space-y-1">
                      <label className="text-[9px] text-muted-foreground">Color</label>
                      <input type="color" value={selected.bgColor || "#111111"} onChange={e => updateElement(selected.id, { bgColor: e.target.value })}
                        className="w-full h-7 rounded border border-border cursor-pointer" />
                    </div>
                  </div>
                )}

                {/* Alignment */}
                <div className="px-3 py-2.5 border-b border-border">
                  <h4 className="text-[9px] font-medium tracking-widest uppercase text-muted-foreground mb-2">Alignment</h4>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { icon: AlignStartHorizontal, tip: "Left", action: () => updateElement(selected.id, { x: 0 }) },
                      { icon: AlignCenterHorizontal, tip: "Center H", action: () => updateElement(selected.id, { x: (canvasW - selected.w) / 2 }) },
                      { icon: AlignEndHorizontal, tip: "Right", action: () => updateElement(selected.id, { x: canvasW - selected.w }) },
                      { icon: AlignStartVertical, tip: "Top", action: () => updateElement(selected.id, { y: 0 }) },
                      { icon: AlignCenterVertical, tip: "Center V", action: () => updateElement(selected.id, { y: (canvasH - selected.h) / 2 }) },
                      { icon: AlignEndVertical, tip: "Bottom", action: () => updateElement(selected.id, { y: canvasH - selected.h }) },
                    ].map((a, i) => (
                      <button key={i} onClick={a.action} title={a.tip}
                        className="h-7 w-full flex items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                        <a.icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="p-3 space-y-2">
                  <div className="flex gap-1">
                    <button onClick={() => toggleVisible(selected.id)} title={selected.visible ? "Hide" : "Show"}
                      className="flex-1 h-7 flex items-center justify-center gap-1 rounded border border-border text-[10px] text-muted-foreground hover:bg-muted transition-colors">
                      {selected.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    </button>
                    <button onClick={() => toggleLock(selected.id)} title={selected.locked ? "Unlock" : "Lock"}
                      className="flex-1 h-7 flex items-center justify-center gap-1 rounded border border-border text-[10px] text-muted-foreground hover:bg-muted transition-colors">
                      {selected.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                    </button>
                    <button onClick={() => duplicateElement(selected.id)} title="Duplicate"
                      className="flex-1 h-7 flex items-center justify-center gap-1 rounded border border-border text-[10px] text-muted-foreground hover:bg-muted transition-colors">
                      <Plus className="h-3 w-3" />
                    </button>
                    <button onClick={() => deleteElement(selected.id)} title="Delete"
                      className="flex-1 h-7 flex items-center justify-center gap-1 rounded border border-border text-[10px] text-destructive hover:bg-destructive/5 transition-colors">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-3">
                <h3 className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground mb-2">No Selection</h3>
                <p className="text-[10px] text-muted-foreground/50 leading-relaxed">Click an element on the canvas to edit its properties, or add new elements from the left panel.</p>
                <div className="mt-4 space-y-1.5">
                  <h4 className="text-[9px] font-medium tracking-widest uppercase text-muted-foreground">Shortcuts</h4>
                  <div className="text-[9px] text-muted-foreground/40 space-y-1">
                    <p><kbd className="font-mono bg-muted px-1 rounded">Ctrl+Z</kbd> Undo</p>
                    <p><kbd className="font-mono bg-muted px-1 rounded">Ctrl+D</kbd> Duplicate</p>
                    <p><kbd className="font-mono bg-muted px-1 rounded">Delete</kbd> Remove</p>
                    <p><kbd className="font-mono bg-muted px-1 rounded">Ctrl+Scroll</kbd> Zoom</p>
                  </div>
                </div>
              </div>
            )}

            {/* Layers */}
            <div className="mt-auto border-t border-border">
              <div className="px-3 py-2.5 flex items-center justify-between">
                <h3 className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground flex items-center gap-1.5"><Layers className="h-3 w-3" />Layers ({elements.length})</h3>
              </div>
              <div className="px-2 pb-2 space-y-0.5 max-h-48 overflow-y-auto">
                {[...elements].sort((a, b) => b.zIndex - a.zIndex).map(el => (
                  <button key={el.id} onClick={() => setSelectedId(el.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[10px] transition-colors ${selectedId === el.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}>
                    {el.type === "photo" && <Camera className="h-3 w-3" />}
                    {el.type === "text" && <Type className="h-3 w-3" />}
                    {el.type === "shape" && <Square className="h-3 w-3" />}
                    {el.type === "background" && <Palette className="h-3 w-3" />}
                    {el.type === "image" && <Image className="h-3 w-3" />}
                    {el.type === "qr" && <QrCode className="h-3 w-3" />}
                    {el.type === "session" && <User className="h-3 w-3" />}
                    <span className="truncate flex-1 text-left">{el.label}</span>
                    {!el.visible && <EyeOff className="h-3 w-3 opacity-40" />}
                    {el.locked && <Lock className="h-3 w-3 opacity-40" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helper Components                                                  */
/* ------------------------------------------------------------------ */
function ToolBtn({ icon, label, onClick, disabled, primary, active }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; primary?: boolean; active?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={label}
      className={`h-7 px-2 flex items-center gap-1.5 rounded text-[10px] transition-colors disabled:opacity-40 ${
        primary ? "bg-foreground text-primary-foreground hover:opacity-90" :
        active ? "bg-muted text-foreground" :
        "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}>
      {icon}<span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function PropInput({ label, value, onChange }: { label: string; value: number; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground w-3 text-right">{label}</span>
      <input type="number" value={Math.round(value)} onChange={e => onChange(e.target.value)}
        className="flex-1 h-7 px-2 rounded border border-border bg-background text-[10px] font-mono text-right focus:outline-none focus:ring-1 focus:ring-ring" />
    </div>
  );
}
