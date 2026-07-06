import type { TranslationParams } from "@/i18n/types";

export type InterfaceKind = "physical" | "aggregate" | "subinterface" | "vlanif" | "loopback" | "tunnel" | "virtual_template" | "null" | "other";

export type TranslateFn = (key: string, params?: TranslationParams) => string;

const INTERFACE_KIND_KEYS: Record<InterfaceKind, string> = {
  physical: "interfaces.netopsKinds.physical",
  aggregate: "interfaces.netopsKinds.aggregate",
  subinterface: "interfaces.netopsKinds.subinterface",
  loopback: "interfaces.netopsKinds.loopback",
  tunnel: "interfaces.netopsKinds.tunnel",
  virtual_template: "interfaces.netopsKinds.virtualTemplate",
  vlanif: "interfaces.netopsKinds.vlanif",
  null: "interfaces.netopsKinds.null",
  other: "interfaces.netopsKinds.other",
};

export function getInterfaceKindLabel(kind: InterfaceKind | undefined, t: TranslateFn): string {
  return kind ? t(INTERFACE_KIND_KEYS[kind]) : t("common.unknown");
}

export type DeviceKind = "router" | "switch" | "unknown";

function baseFilterOptions(t: TranslateFn): Array<{ value: InterfaceKind | "all"; label: string }> {
  return [
    { value: "all", label: t("interfaces.filterOptions.all") },
    { value: "physical", label: t("interfaces.filterOptions.physical") },
    { value: "aggregate", label: t("interfaces.filterOptions.aggregate") },
  ];
}

export function getInterfaceFilterOptions(
  deviceKind: DeviceKind | undefined,
  t: TranslateFn,
): Array<{ value: InterfaceKind | "all"; label: string }> {
  const baseOptions = baseFilterOptions(t);

  const routerOptions: Array<{ value: InterfaceKind | "all"; label: string }> = [
    ...baseOptions,
    { value: "subinterface", label: t("interfaces.filterOptions.subinterfaces") },
    { value: "loopback", label: t("interfaces.filterOptions.loopbacks") },
    { value: "tunnel", label: t("interfaces.filterOptions.tunnels") },
    { value: "virtual_template", label: t("interfaces.filterOptions.virtualTemplate") },
    { value: "vlanif", label: t("interfaces.netopsKinds.vlanif") },
    { value: "other", label: t("interfaces.filterOptions.other") },
  ];

  const switchOptions: Array<{ value: InterfaceKind | "all"; label: string }> = [
    ...baseOptions,
    { value: "vlanif", label: t("interfaces.netopsKinds.vlanif") },
    { value: "subinterface", label: t("interfaces.filterOptions.subinterfaces") },
    { value: "other", label: t("interfaces.filterOptions.other") },
  ];

  const unknownOptions: Array<{ value: InterfaceKind | "all"; label: string }> = [
    ...baseOptions,
    { value: "subinterface", label: t("interfaces.filterOptions.subinterfaces") },
    { value: "loopback", label: t("interfaces.filterOptions.loopbacks") },
    { value: "tunnel", label: t("interfaces.filterOptions.tunnels") },
    { value: "vlanif", label: t("interfaces.netopsKinds.vlanif") },
    { value: "other", label: t("interfaces.filterOptions.other") },
  ];

  if (deviceKind === "router") return routerOptions;
  if (deviceKind === "switch") return switchOptions;
  return unknownOptions;
}
