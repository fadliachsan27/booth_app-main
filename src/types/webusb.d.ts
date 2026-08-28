/* WebUSB API type declarations */
interface USBDevice {
  readonly vendorId: number;
  readonly productId: number;
  readonly deviceVersionMajor: number;
  readonly deviceVersionMinor: number;
  readonly deviceVersionSubminor: number;
  readonly manufacturerName: string | null;
  readonly productName: string | null;
  readonly serialNumber: string | null;
  readonly configuration: USBConfiguration | null;
  readonly configurations: USBConfiguration[];
  opened: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<USBIsochronousOutTransferResult>;
  transferIn(endpointNumber: number, length: number): Promise<USBIsochronousInTransferResult>;
  selectAlternateInterface(interfaceNumber: number, alternateSetting: number): Promise<void>;
  clearHalt(direction: USBDirection, endpointNumber: number): Promise<void>;
  reset(): Promise<void>;
  forget(): Promise<void>;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

interface USBConfiguration {
  readonly configurationValue: number;
  readonly configurationName: string | null;
  readonly interfaces: USBInterface[];
}

interface USBInterface {
  readonly interfaceNumber: number;
  readonly alternate: USBAlternateInterface;
  readonly alternates: USBAlternateInterface[];
}

interface USBAlternateInterface {
  readonly alternateSetting: number;
  readonly interfaceClass: number;
  readonly interfaceSubclass: number;
  readonly interfaceProtocol: number;
  readonly interfaceName: string | null;
  readonly endpoints: USBEndpoint[];
}

interface USBEndpoint {
  readonly endpointNumber: number;
  readonly direction: USBDirection;
  readonly type: USBEndpointType;
  readonly packetSize: number;
  readonly interval: number;
}

type USBDirection = "in" | "out";
type USBEndpointType = "bulk" | "interrupt" | "isochronous";

interface USBIsochronousInTransferResult {
  readonly data: DataView;
  readonly status: USBTransferStatus;
}

interface USBIsochronousOutTransferResult {
  readonly status: USBTransferStatus;
}

type USBTransferStatus = "ok" | "stall" | "babble";

interface USBDeviceFilter {
  vendorId?: number;
  productId?: number;
  serialNumber?: string;
  classCode?: number;
  subclassCode?: number;
  protocolCode?: number;
}

interface Navigator {
  usb?: {
    getDevices(options?: { filters?: USBDeviceFilter[] }): Promise<USBDevice[]>;
    requestDevice(options: { filters: USBDeviceFilter[] }): Promise<USBDevice>;
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
  };
}
