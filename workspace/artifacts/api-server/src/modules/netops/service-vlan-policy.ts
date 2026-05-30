export const DEFAULT_VLAN_ID = 1;
export const MIN_SERVICE_VLAN_ID = 2;
export const MAX_SERVICE_VLAN_ID = 4094;

export function normalizeServiceVlanId(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const vlan = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(vlan)) return null;
  if (vlan < MIN_SERVICE_VLAN_ID || vlan > MAX_SERVICE_VLAN_ID) return null;
  return vlan;
}

export function isIgnoredServiceVlan(value: number | string | null | undefined): boolean {
  const vlan = typeof value === "number" ? value : Number(value);
  return Number.isInteger(vlan) && vlan === DEFAULT_VLAN_ID;
}

export function isDefaultVlanInterface(name: string): boolean {
  return /^Vlanif1$/i.test(name) || /\.\s*1$/.test(name);
}
