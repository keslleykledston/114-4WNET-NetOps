export type InterfaceKind = "physical" | "aggregate" | "subinterface" | "vlanif" | "loopback" | "tunnel" | "virtual_template" | "null" | "other";

export const interfaceKindLabel: Record<InterfaceKind, string> = {
  physical: "Física",
  aggregate: "Agregada",
  subinterface: "Subinterface",
  loopback: "Loopback",
  tunnel: "Túnel",
  virtual_template: "Virtual Template",
  vlanif: "VLANIF",
  null: "Null",
  other: "Outro",
};

export function getInterfaceKindLabel(kind: InterfaceKind | undefined): string {
  return kind ? interfaceKindLabel[kind] : "Desconhecido";
}

export type DeviceKind = "router" | "switch" | "unknown";

export function getInterfaceFilterOptions(deviceKind: DeviceKind | undefined): Array<{ value: InterfaceKind | "all"; label: string }> {
  const baseOptions: Array<{ value: InterfaceKind | "all"; label: string }> = [
    { value: "all", label: "Todas" },
    { value: "physical", label: "Físicas" },
    { value: "aggregate", label: "Agregadas" },
  ];

  const routerOptions: Array<{ value: InterfaceKind | "all"; label: string }> = [
    ...baseOptions,
    { value: "subinterface", label: "Subinterfaces" },
    { value: "loopback", label: "Loopbacks" },
    { value: "tunnel", label: "Túneis" },
    { value: "virtual_template", label: "Virtual Template" },
    { value: "vlanif", label: "VLANIF" },
    { value: "other", label: "Outros" },
  ];

  const switchOptions: Array<{ value: InterfaceKind | "all"; label: string }> = [
    ...baseOptions,
    { value: "vlanif", label: "VLANIF" },
    { value: "subinterface", label: "Subinterfaces" },
    { value: "other", label: "Outros" },
  ];

  const unknownOptions: Array<{ value: InterfaceKind | "all"; label: string }> = [
    ...baseOptions,
    { value: "subinterface", label: "Subinterfaces" },
    { value: "loopback", label: "Loopbacks" },
    { value: "tunnel", label: "Túneis" },
    { value: "vlanif", label: "VLANIF" },
    { value: "other", label: "Outros" },
  ];

  if (deviceKind === "router") return routerOptions;
  if (deviceKind === "switch") return switchOptions;
  return unknownOptions;
}
