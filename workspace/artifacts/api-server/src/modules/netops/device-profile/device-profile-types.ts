export type DeviceKind = "router" | "switch" | "unknown";

export interface DeviceProfile {
  kind: DeviceKind;
  vendor: string;
  family: string;
  models: string[];
}

export interface DeviceProfileLibrary {
  [key: string]: DeviceProfile;
}
