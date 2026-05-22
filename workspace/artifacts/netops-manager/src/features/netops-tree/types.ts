import type { Device } from "@workspace/api-client-react";

export type NetopsTreeView =
  | "device"
  | "interfaces"
  | "bgp"
  | "bgp-providers"
  | "bgp-customers"
  | "bgp-cdn"
  | "bgp-ix"
  | "bgp-cdn-ix"
  | "bgp-ibgp"
  | "filters"
  | "communities";

export interface NetopsTreeSelection {
  device: Device;
  view: NetopsTreeView;
}

export function viewLabel(view: NetopsTreeView): string {
  switch (view) {
    case "device":
      return "Device";
    case "interfaces":
      return "Interfaces";
    case "bgp":
      return "BGP";
    case "bgp-providers":
      return "Operadoras";
    case "bgp-customers":
      return "Clientes";
    case "bgp-cdn":
      return "CDN";
    case "bgp-ix":
      return "IX";
    case "bgp-cdn-ix":
      return "CDN/IX";
    case "bgp-ibgp":
      return "iBGP";
    case "filters":
      return "Filters";
    case "communities":
      return "Communities";
  }
}
