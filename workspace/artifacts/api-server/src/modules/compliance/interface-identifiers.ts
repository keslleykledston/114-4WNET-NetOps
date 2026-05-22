import { isIP } from "node:net";

const HUAWEI_INTERFACE_RE = /^(?:Eth-Trunk\d+|GigabitEthernet\d+(?:\/\d+){2}|XGigabitEthernet\d+(?:\/\d+){2}|(?:10|25|40|100)GE\d+(?:\/\d+){2}|LoopBack\d+|Vlanif\d+|NULL0)(?:\.\d{1,4})?$/i;
const HUAWEI_SUBINTERFACE_RE = /^(?:Eth-Trunk\d+|GigabitEthernet\d+(?:\/\d+){2}|XGigabitEthernet\d+(?:\/\d+){2}|(?:10|25|40|100)GE\d+(?:\/\d+){2})\.\d{1,4}$/i;

export function isIpv4Address(value: string): boolean {
  return isIP(value.trim()) === 4;
}

export function isIpv6Address(value: string): boolean {
  return isIP(value.trim()) === 6;
}

export function isIpAddress(value: string): boolean {
  return isIP(value.trim()) !== 0;
}

export function isHuaweiInterfaceName(value: string): boolean {
  const normalized = value.trim();
  if (!normalized || isIpAddress(normalized)) return false;
  return HUAWEI_INTERFACE_RE.test(normalized);
}

export function isHuaweiSubinterfaceName(value: string): boolean {
  const normalized = value.trim();
  if (!normalized || isIpAddress(normalized)) return false;
  return HUAWEI_SUBINTERFACE_RE.test(normalized);
}
