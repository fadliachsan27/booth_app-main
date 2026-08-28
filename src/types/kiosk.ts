export type KioskScreen =
  | "home"
  | "templates"
  | "ready"
  | "camera"
  | "preview"
  | "payment"
  | "download"
  | "settings"
  | "editor";

export interface EditorElement {
  id: string;
  type: "photo" | "image" | "text" | "shape" | "qr" | "background" | "session";
  label: string;
  x: number; y: number; w: number; h: number;
  rotation: number; locked: boolean; visible: boolean; zIndex: number;
  text?: string; fontSize?: number; fontFamily?: string; color?: string;
  bgColor?: string; borderRadius?: number; strokeWidth?: number; strokeColor?: string;
  photoIndex?: number; imageData?: string;
}

export interface FrameTemplate {
  id: string;
  name: string;
  description: string;
  thumbnail: string; // data URL for custom uploads
  layoutType: "layout-elegant" | "layout-minimal" | "layout-floral" | "layout-retro" | "layout-polaroid" | "layout-cinema" | "layout-modern" | "layout-romantic" | "layout-bold" | "none";
  size: "portrait";
  poses: number;
  strips: number;
  isDefault: boolean;
  editorElements?: EditorElement[];
}

export const DEFAULT_TEMPLATES: FrameTemplate[] = [
  {
    id: "tpl-elegant",
    name: "Elegant",
    description: "4R — 4 Pose, border emas dengan ornamen",
    thumbnail: "",
    layoutType: "layout-elegant",
    size: "portrait",
    poses: 4,
    strips: 1,
    isDefault: true,
  },
  {
    id: "tpl-minimal",
    name: "Minimal",
    description: "4R — 4 Pose, desain bersih & modern",
    thumbnail: "",
    layoutType: "layout-minimal",
    size: "portrait",
    poses: 4,
    strips: 1,
    isDefault: false,
  },
  {
    id: "tpl-floral",
    name: "Floral",
    description: "4R — 4 Pose, bunga & garis lembut",
    thumbnail: "",
    layoutType: "layout-floral",
    size: "portrait",
    poses: 4,
    strips: 1,
    isDefault: false,
  },
  {
    id: "tpl-retro",
    name: "Retro",
    description: "4R — 3 Pose, gaya vintage polaroid",
    thumbnail: "",
    layoutType: "layout-retro",
    size: "portrait",
    poses: 3,
    strips: 1,
    isDefault: false,
  },
  {
    id: "tpl-polaroid",
    name: "Polaroid",
    description: "4R — 3 Pose, bingkai polaroid klasik",
    thumbnail: "",
    layoutType: "layout-polaroid",
    size: "portrait",
    poses: 3,
    strips: 1,
    isDefault: false,
  },
  {
    id: "tpl-cinema",
    name: "Cinema",
    description: "4R — 2 Pose, gaya film bioskop",
    thumbnail: "",
    layoutType: "layout-cinema",
    size: "portrait",
    poses: 2,
    strips: 1,
    isDefault: false,
  },
  {
    id: "tpl-modern",
    name: "Modern",
    description: "4R — 4 Pose, grid asimetris",
    thumbnail: "",
    layoutType: "layout-modern",
    size: "portrait",
    poses: 4,
    strips: 1,
    isDefault: false,
  },
  {
    id: "tpl-romantic",
    name: "Romantic",
    description: "4R — 3 Pose, tema romantis hati",
    thumbnail: "",
    layoutType: "layout-romantic",
    size: "portrait",
    poses: 3,
    strips: 1,
    isDefault: false,
  },
  {
    id: "tpl-bold",
    name: "Bold",
    description: "4R — 4 Pose, kontras tinggi dramatis",
    thumbnail: "",
    layoutType: "layout-bold",
    size: "portrait",
    poses: 4,
    strips: 1,
    isDefault: false,
  },
  {
    id: "tpl-none",
    name: "Tanpa Frame",
    description: "Foto tanpa frame",
    thumbnail: "",
    layoutType: "none",
    size: "portrait",
    poses: 0,
    strips: 0,
    isDefault: false,
  },
];

export function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

export interface BookkeepingEntry {
  id: string;
  templateId: string;
  templateName: string;
  price: number;
  timestamp: number;
  date: string; // YYYY-MM-DD
}

export function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

export function exportBookkeepingToCSV(entries: BookkeepingEntry[]): string {
  const header = "ID,Template,Harga,Waktu,Tanggal\n";
  const rows = entries.map(e => {
    const time = new Date(e.timestamp).toLocaleTimeString("id-ID");
    return `${e.id},${e.templateName},${e.price},${time},${e.date}`;
  }).join("\n");
  return header + rows;
}

export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Professional Camera Types (DSLR / SLR / Mirrorless)                */
/* ------------------------------------------------------------------ */

export type CameraBrand = "canon" | "nikon" | "sony" | "fuji" | "olympus" | "panasonic" | "pentax" | "leica" | "hasselblad" | "gopro" | "other";
export type CameraConnectionType = "usb-ptp" | "usb-uccp" | "wifi" | "webcam" | "builtin";
export interface ProfessionalCamera {
  id: string;
  name: string;
  brand: CameraBrand;
  model: string;
  connectionType: CameraConnectionType;
  isConnected: boolean;
  isTethered: boolean;
  hasLiveView: boolean;
  batteryLevel: number; // 0-100
  storageFree: string;
  firmwareVersion: string;
  serialNumber: string;
}

export interface CameraSettings {
  iso: number;
  aperture: string;
  shutterSpeed: string;
  whiteBalance: string;
  exposureComp: number; // -3 to +3 in 1/3 steps
  focusMode: string;
  meteringMode: string;
  driveMode: string;
  imageQuality: string;
  colorSpace: string;
  pictureStyle: string;
}

export interface CameraPreset {
  id: string;
  name: string;
  brand: CameraBrand;
  connectionType: CameraConnectionType;
  usbVendorId: number;
  usbProductId: number[];
  protocols: string[];
}

// Well-known DSLR/SLR camera USB IDs (PTP protocol)
export const CAMERA_PRESETS: CameraPreset[] = [
  // Canon
  { id: "canon-7d", name: "Canon EOS 7D", brand: "canon", connectionType: "usb-ptp", usbVendorId: 0x04A9, usbProductId: [0x3185], protocols: ["PTP", "Canon UTI"] },
  { id: "canon-7d-ii", name: "Canon EOS 7D Mark II", brand: "canon", connectionType: "usb-ptp", usbVendorId: 0x04A9, usbProductId: [0x3260], protocols: ["PTP", "Canon UTI"] },
  { id: "canon-5d-iv", name: "Canon EOS 5D Mark IV", brand: "canon", connectionType: "usb-ptp", usbVendorId: 0x04A9, usbProductId: [0x3211, 0x3212], protocols: ["PTP", "Canon UTI"] },
  { id: "canon-r5", name: "Canon EOS R5", brand: "canon", connectionType: "usb-ptp", usbVendorId: 0x04A9, usbProductId: [0x3279], protocols: ["PTP", "Canon UTI"] },
  { id: "canon-r6", name: "Canon EOS R6", brand: "canon", connectionType: "usb-ptp", usbVendorId: 0x04A9, usbProductId: [0x327A], protocols: ["PTP", "Canon UTI"] },
  { id: "canon-r6ii", name: "Canon EOS R6 Mark II", brand: "canon", connectionType: "usb-ptp", usbVendorId: 0x04A9, usbProductId: [0x32CB], protocols: ["PTP", "Canon UTI"] },
  { id: "canon-r7", name: "Canon EOS R7", brand: "canon", connectionType: "usb-ptp", usbVendorId: 0x04A9, usbProductId: [0x32C3], protocols: ["PTP", "Canon UTI"] },
  { id: "canon-r10", name: "Canon EOS R10", brand: "canon", connectionType: "usb-ptp", usbVendorId: 0x04A9, usbProductId: [0x32C4], protocols: ["PTP", "Canon UTI"] },
  { id: "canon-90d", name: "Canon EOS 90D", brand: "canon", connectionType: "usb-ptp", usbVendorId: 0x04A9, usbProductId: [0x32DA], protocols: ["PTP", "Canon UTI"] },
  { id: "canon-m50", name: "Canon EOS M50 Mark II", brand: "canon", connectionType: "usb-ptp", usbVendorId: 0x04A9, usbProductId: [0x3285], protocols: ["PTP", "Canon UTI"] },
  { id: "canon-selphy", name: "Canon SELPHY Series", brand: "canon", connectionType: "usb-ptp", usbVendorId: 0x04A9, usbProductId: [0x10A0, 0x10A1, 0x10A2, 0x10A3], protocols: ["PTP"] },
  // Nikon
  { id: "nikon-d850", name: "Nikon D850", brand: "nikon", connectionType: "usb-ptp", usbVendorId: 0x04B0, usbProductId: [0x0433, 0x0434], protocols: ["PTP", "Nikon MTP"] },
  { id: "nikon-z6iii", name: "Nikon Z6 III", brand: "nikon", connectionType: "usb-ptp", usbVendorId: 0x04B0, usbProductId: [0x0468], protocols: ["PTP", "Nikon MTP"] },
  { id: "nikon-z7ii", name: "Nikon Z7 II", brand: "nikon", connectionType: "usb-ptp", usbVendorId: 0x04B0, usbProductId: [0x0466], protocols: ["PTP", "Nikon MTP"] },
  { id: "nikon-z8", name: "Nikon Z8", brand: "nikon", connectionType: "usb-ptp", usbVendorId: 0x04B0, usbProductId: [0x0479], protocols: ["PTP", "Nikon MTP"] },
  { id: "nikon-z9", name: "Nikon Z9", brand: "nikon", connectionType: "usb-ptp", usbVendorId: 0x04B0, usbProductId: [0x0469], protocols: ["PTP", "Nikon MTP"] },
  { id: "nikon-d780", name: "Nikon D780", brand: "nikon", connectionType: "usb-ptp", usbVendorId: 0x04B0, usbProductId: [0x043A], protocols: ["PTP", "Nikon MTP"] },
  // Sony
  { id: "sony-a7iv", name: "Sony A7 IV", brand: "sony", connectionType: "usb-ptp", usbVendorId: 0x054C, usbProductId: [0x0CE7, 0x0CE8], protocols: ["PTP", "MTP"] },
  { id: "sony-a7rv", name: "Sony A7R V", brand: "sony", connectionType: "usb-ptp", usbVendorId: 0x054C, usbProductId: [0x0D6D], protocols: ["PTP", "MTP"] },
  { id: "sony-a7siii", name: "Sony A7S III", brand: "sony", connectionType: "usb-ptp", usbVendorId: 0x054C, usbProductId: [0x0CE5], protocols: ["PTP", "MTP"] },
  { id: "sony-a6700", name: "Sony A6700", brand: "sony", connectionType: "usb-ptp", usbVendorId: 0x054C, usbProductId: [0x0D6E], protocols: ["PTP", "MTP"] },
  { id: "sony-zv-e10", name: "Sony ZV-E10 II", brand: "sony", connectionType: "usb-ptp", usbVendorId: 0x054C, usbProductId: [0x0D6F], protocols: ["PTP", "MTP"] },
  // Fujifilm
  { id: "fuji-x-t5", name: "Fujifilm X-T5", brand: "fuji", connectionType: "usb-ptp", usbVendorId: 0x04CB, usbProductId: [0x01E8], protocols: ["PTP"] },
  { id: "fuji-x-h2", name: "Fujifilm X-H2S", brand: "fuji", connectionType: "usb-ptp", usbVendorId: 0x04CB, usbProductId: [0x01DF], protocols: ["PTP"] },
  { id: "fuji-x100vi", name: "Fujifilm X100VI", brand: "fuji", connectionType: "usb-ptp", usbVendorId: 0x04CB, usbProductId: [0x01F2], protocols: ["PTP"] },
  // Olympus / OM System
  { id: "olympus-om1ii", name: "OM System OM-1 Mark II", brand: "olympus", connectionType: "usb-ptp", usbVendorId: 0x07B4, usbProductId: [0x0234, 0x0235], protocols: ["PTP"] },
  // Panasonic
  { id: "panasonic-s5ii", name: "Panasonic LUMIX S5 II", brand: "panasonic", connectionType: "usb-ptp", usbVendorId: 0x0525, usbProductId: [0xA4A8], protocols: ["PTP", "MTP"] },
  { id: "panasonic-gh6", name: "Panasonic LUMIX GH6", brand: "panasonic", connectionType: "usb-ptp", usbVendorId: 0x0525, usbProductId: [0xA4A5], protocols: ["PTP", "MTP"] },
  // GoPro
  { id: "gopro-hero12", name: "GoPro HERO12 Black", brand: "gopro", connectionType: "wifi", usbVendorId: 0x0BDA, usbProductId: [0x0316], protocols: ["HTTP API"] },
];

// Default camera settings
export const DEFAULT_CAMERA_SETTINGS: CameraSettings = {
  iso: 400,
  aperture: "f/2.8",
  shutterSpeed: "1/125",
  whiteBalance: "Auto",
  exposureComp: 0,
  focusMode: "AF-S",
  meteringMode: "Matrix",
  driveMode: "Single",
  imageQuality: "RAW + JPEG",
  colorSpace: "sRGB",
  pictureStyle: "Standard",
};

export const ISO_OPTIONS = [100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600];
export const APERTURE_OPTIONS = ["f/1.2", "f/1.4", "f/1.8", "f/2.0", "f/2.8", "f/4.0", "f/5.6", "f/8.0", "f/11", "f/16", "f/22"];
export const SHUTTER_OPTIONS = ["30\"", "15\"", "8\"", "4\"", "2\"", "1\"", "1/2", "1/4", "1/8", "1/15", "1/30", "1/60", "1/125", "1/250", "1/500", "1/1000", "1/2000", "1/4000", "1/8000"];
export const WHITE_BALANCE_OPTIONS = ["Auto", "Daylight", "Shade", "Cloudy", "Tungsten", "Fluorescent", "Flash", "K Custom"];
export const FOCUS_MODE_OPTIONS = ["AF-S", "AF-C", "AF-A", "AF-F", "MF", "DMF"];
export const METERING_OPTIONS = ["Matrix", "Center-weighted", "Spot", "Highlight-weighted"];
export const DRIVE_MODE_OPTIONS = ["Single", "Continuous Low", "Continuous High", "Self-timer 2s", "Self-timer 10s", "Bracketing"];
export const IMAGE_QUALITY_OPTIONS = ["RAW", "RAW + JPEG Fine", "RAW + JPEG Normal", "JPEG Fine", "JPEG Normal", "JPEG Basic"];
export const COLOR_SPACE_OPTIONS = ["sRGB", "Adobe RGB"];
export const PICTURE_STYLE_OPTIONS = ["Standard", "Portrait", "Landscape", "Neutral", "Faithful", "Monochrome", "Fine Detail"];
export const EXPO_COMP_OPTIONS = [-3, -2.7, -2.3, -2, -1.7, -1.3, -1, -0.7, -0.3, 0, 0.3, 0.7, 1, 1.3, 1.7, 2, 2.3, 2.7, 3];

/* ------------------------------------------------------------------ */
/*  Universal Printer Types                                            */
/* ------------------------------------------------------------------ */

export type PrinterBrand = "canon" | "epson" | "hp" | "brother" | "dymo" | "zebra" | "citizen" | "sharp" | "oki" | "samsung" | "xerox" | "ricoh" | "other";
export type PrinterConnectionType = "usb" | "network-ipp" | "network-airprint" | "wifi-direct" | "bluetooth" | "serial";
export type PrinterProtocol = "ipp" | "ipps" | "airprint" | "esc-pos" | "pcl" | "postscript" | "gdi" | "xps";

export interface UniversalPrinter {
  id: string;
  name: string;
  brand: PrinterBrand;
  model: string;
  connectionType: PrinterConnectionType;
  protocol: PrinterProtocol;
  isConnected: boolean;
  status: "ready" | "busy" | "error" | "offline" | "no-paper" | "low-ink";
  hasDuplex: boolean;
  hasBorderless: boolean;
  maxDpi: number;
  supportedPaperSizes: string[];
  inkLevels: { cyan: number; magenta: number; yellow: number; black: number } | null;
  temperature?: string;
  ipAddress?: string;
  port?: string;
}

export interface PrintJob {
  id: string;
  printerId: string;
  status: "queued" | "printing" | "completed" | "error";
  copies: number;
  paperSize: string;
  quality: string;
  timestamp: number;
  error?: string;
}

export const PRINTER_PROTOCOLS: { id: PrinterProtocol; label: string; desc: string; brands: string[] }[] = [
  { id: "ipp", label: "IPP", desc: "Internet Printing Protocol — universal standard", brands: ["canon", "epson", "hp", "brother", "samsung", "xerox", "ricoh"] },
  { id: "ipps", label: "IPPS", desc: "Secure IPP over HTTPS", brands: ["canon", "epson", "hp", "brother"] },
  { id: "airprint", label: "AirPrint", desc: "Apple AirPrint — driverless printing", brands: ["canon", "epson", "hp", "brother"] },
  { id: "esc-pos", label: "ESC/POS", desc: "Epson ESC/POS — receipt & label printers", brands: ["epson", "citizen", "sharp"] },
  { id: "pcl", label: "PCL", desc: "Printer Command Language — HP compatible", brands: ["hp", "xerox", "ricoh", "samsung"] },
  { id: "postscript", label: "PostScript", desc: "Adobe PostScript — professional print quality", brands: ["canon", "hp", "xerox", "ricoh"] },
  { id: "gdi", label: "GDI", desc: "Windows GDI — host-based printing", brands: ["canon", "epson", "hp", "brother"] },
  { id: "xps", label: "XPS", desc: "XML Paper Specification", brands: ["xerox", "ricoh", "samsung"] },
];

// Well-known photobooth / thermal printer USB IDs
export const PRINTER_PRESETS: { id: string; name: string; brand: PrinterBrand; connectionType: PrinterConnectionType; protocol: PrinterProtocol; usbVendorId: number; usbProductIds: number[] }[] = [
  // Canon SELPHY series
  { id: "canon-selphy-cp1500", name: "Canon SELPHY CP1500", brand: "canon", connectionType: "usb", protocol: "gdi", usbVendorId: 0x04A9, usbProductIds: [0x10A0, 0x10A1] },
  { id: "canon-selphy-cp1300", name: "Canon SELPHY CP1300", brand: "canon", connectionType: "usb", protocol: "gdi", usbVendorId: 0x04A9, usbProductIds: [0x10A2, 0x10A3] },
  { id: "canon-selphy-cp1200", name: "Canon SELPHY CP1200", brand: "canon", connectionType: "usb", protocol: "gdi", usbVendorId: 0x04A9, usbProductIds: [0x10A4] },
  { id: "canon-selphy-es40", name: "Canon SELPHY ES40", brand: "canon", connectionType: "usb", protocol: "gdi", usbVendorId: 0x04A9, usbProductIds: [0x109B] },
  // Epson PictureMate / DNP
  { id: "epson-l8050", name: "Epson L8050", brand: "epson", connectionType: "wifi-direct", protocol: "airprint", usbVendorId: 0x04B8, usbProductIds: [0x11B0] },
  { id: "epson-l805", name: "Epson L805", brand: "epson", connectionType: "wifi-direct", protocol: "airprint", usbVendorId: 0x04B8, usbProductIds: [0x0885] },
  { id: "epson-l810", name: "Epson L810", brand: "epson", connectionType: "wifi-direct", protocol: "airprint", usbVendorId: 0x04B8, usbProductIds: [0x0870] },
  { id: "epson-l850", name: "Epson L850", brand: "epson", connectionType: "wifi-direct", protocol: "airprint", usbVendorId: 0x04B8, usbProductIds: [0x0888] },
  { id: "epson-pm-525", name: "Epson PictureMate PM-525", brand: "epson", connectionType: "usb", protocol: "esc-pos", usbVendorId: 0x04B8, usbProductIds: [0x0862] },
  { id: "epson-pm-400", name: "Epson PictureMate PM-400", brand: "epson", connectionType: "usb", protocol: "esc-pos", usbVendorId: 0x04B8, usbProductIds: [0x0852] },
  { id: "epson-p600", name: "Epson SureColor P600", brand: "epson", connectionType: "usb", protocol: "esc-pos", usbVendorId: 0x04B8, usbProductIds: [0x083D] },
  { id: "epson-p700", name: "Epson SureColor P700", brand: "epson", connectionType: "usb", protocol: "esc-pos", usbVendorId: 0x04B8, usbProductIds: [0x0866] },
  { id: "epson-p900", name: "Epson SureColor P900", brand: "epson", connectionType: "usb", protocol: "esc-pos", usbVendorId: 0x04B8, usbProductIds: [0x0867] },
  // DNP printers (photobooth industry standard)
  { id: "dnp-ds620a", name: "DNP DS620A", brand: "other", connectionType: "usb", protocol: "gdi", usbVendorId: 0x1452, usbProductIds: [0x8C01] },
  { id: "dnp-ds820a", name: "DNP DS820A", brand: "other", connectionType: "usb", protocol: "gdi", usbVendorId: 0x1452, usbProductIds: [0x8C02] },
  { id: "dnp-dsrx1", name: "DNP DS-RX1HS", brand: "other", connectionType: "usb", protocol: "gdi", usbVendorId: 0x1452, usbProductIds: [0x8C03] },
  // Mitsubishi (photobooth)
  { id: "mitsubishi-cp-d90dw", name: "Mitsubishi CP-D90DW", brand: "other", connectionType: "usb", protocol: "gdi", usbVendorId: 0x06D3, usbProductIds: [0x03A4] },
  { id: "mitsubishi-cp-k60dw", name: "Mitsubishi CP-K60DW", brand: "other", connectionType: "usb", protocol: "gdi", usbVendorId: 0x06D3, usbProductIds: [0x03A5] },
  // Citizen (photobooth)
  { id: "citizen-cx02w", name: "Citizen CX-02W", brand: "citizen", connectionType: "usb", protocol: "gdi", usbVendorId: 0x1343, usbProductIds: [0x0004] },
  { id: "citizen-quiris", name: "Citizen CY-01", brand: "citizen", connectionType: "usb", protocol: "gdi", usbVendorId: 0x1343, usbProductIds: [0x0005] },
  // HP
  { id: "hp-deskjet-2700", name: "HP DeskJet 2700", brand: "hp", connectionType: "usb", protocol: "pcl", usbVendorId: 0x03F0, usbProductIds: [0x004A, 0x004B] },
  { id: "hp-envy-6055", name: "HP ENVY 6055", brand: "hp", connectionType: "usb", protocol: "airprint", usbVendorId: 0x03F0, usbProductIds: [0x5D11] },
  { id: "hp-laserjet-m232", name: "HP LaserJet MFP M232dwc", brand: "hp", connectionType: "usb", protocol: "pcl", usbVendorId: 0x03F0, usbProductIds: [0x4C17] },
  // Brother
  { id: "brother-hl-l2370", name: "Brother HL-L2370DW", brand: "brother", connectionType: "usb", protocol: "gdi", usbVendorId: 0x04F9, usbProductIds: [0x0300] },
  // Zebra (label printers)
  { id: "zebra-zd410", name: "Zebra ZD410", brand: "zebra", connectionType: "usb", protocol: "esc-pos", usbVendorId: 0x0A5F, usbProductIds: [0x006E] },
  { id: "zebra-zd420", name: "Zebra ZD420", brand: "zebra", connectionType: "usb", protocol: "esc-pos", usbVendorId: 0x0A5F, usbProductIds: [0x0080] },
  // DYMO
  { id: "dymo-labelwriter-450", name: "DYMO LabelWriter 450", brand: "dymo", connectionType: "usb", protocol: "esc-pos", usbVendorId: 0x0922, usbProductIds: [0x0020] },
];

export const PRINTER_PAPER_SIZES = [
  { id: "10x15", label: "10×15 cm", desc: "Photo strip / standard photo" },
  { id: "15x20", label: "15×20 cm", desc: "Medium print" },
  { id: "4R", label: "4R (10.2×15.2)", desc: "Standard photo" },
  { id: "5R", label: "5R (12.7×17.8)", desc: "Large photo" },
  { id: "A6", label: "A6 (10.5×14.8)", desc: "Postcard" },
  { id: "A5", label: "A5 (14.8×21)", desc: "Half A4" },
  { id: "A4", label: "A4 (21×29.7)", desc: "Full sheet" },
  { id: "A3", label: "A3 (29.7×42)", desc: "Large format" },
  { id: "B7", label: "B7 (88×125mm)", desc: "Photobooth strip" },
  { id: "2x6", label: "2×6 inch", desc: "Photobooth strip" },
  { id: "4x6", label: "4×6 inch", desc: "Standard photo" },
  { id: "5x7", label: "5×7 inch", desc: "Large photo" },
  { id: "8x10", label: "8×10 inch", desc: "Portrait print" },
  { id: "letter", label: "Letter (8.5×11)", desc: "US standard" },
];

export const PRINTER_QUALITY_OPTIONS = [
  { id: "draft", label: "Draft", desc: "Fastest, lowest quality" },
  { id: "normal", label: "Normal", desc: "Balanced speed and quality" },
  { id: "high", label: "High", desc: "Best for photos" },
  { id: "best", label: "Best", desc: "Maximum quality, slowest" },
];

export interface PrinterSettingsState {
  paperSize: string;
  orientation: string;
  quality: string;
  dpi: string;
  colorMode: string;
  copies: number;
  autoCut: boolean;
  borderless: boolean;
  mirrorPrint: boolean;
  dryTime: string;
  layoutPreset: string;
}
