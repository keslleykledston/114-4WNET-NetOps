export const VENDOR_OPTIONS = [
  { value: "cisco", label: "Cisco" },
  { value: "juniper", label: "Juniper" },
  { value: "huawei", label: "Huawei" },
  { value: "nokia", label: "Nokia" },
  { value: "raisecom", label: "Raisecom" },
  { value: "datacom", label: "Datacom" },
  { value: "zte", label: "ZTE" },
] as const;

export const PLATFORM_OPTIONS: Array<{ value: string; label: string; vendors: string[] }> = [
  { value: "ios", label: "IOS", vendors: ["cisco"] },
  { value: "ios-xe", label: "IOS-XE", vendors: ["cisco"] },
  { value: "ios-xr", label: "IOS-XR", vendors: ["cisco"] },
  { value: "junos", label: "Junos", vendors: ["juniper"] },
  { value: "vrp", label: "VRP", vendors: ["huawei"] },
  { value: "sros", label: "SR-OS", vendors: ["nokia"] },
  { value: "ros", label: "ROS", vendors: ["raisecom"] },
  { value: "dmos", label: "DMOS", vendors: ["datacom"] },
  { value: "zxros", label: "ZXROS", vendors: ["zte"] },
];

export function platformOptionsForVendor(vendor: string) {
  return PLATFORM_OPTIONS.filter((option) => option.vendors.includes(vendor));
}
