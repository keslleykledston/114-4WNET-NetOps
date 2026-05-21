import type { DeviceProfileLibrary } from "./device-profile-types.js";

export const DEVICE_PROFILE_LIBRARY: DeviceProfileLibrary = {
  // Huawei Routers
  "huawei-ne8000": {
    kind: "router",
    vendor: "Huawei",
    family: "NE8000",
    models: ["NE8000"],
  },
  "huawei-ne40": {
    kind: "router",
    vendor: "Huawei",
    family: "NE40",
    models: ["NE40E", "NE40X", "NE40"],
  },
  "huawei-ne20": {
    kind: "router",
    vendor: "Huawei",
    family: "NE20",
    models: ["NE20E", "NE20"],
  },
  "huawei-ne5000": {
    kind: "router",
    vendor: "Huawei",
    family: "NE5000",
    models: ["NE5000"],
  },

  // Huawei Switches
  "huawei-s6730": {
    kind: "switch",
    vendor: "Huawei",
    family: "S6730",
    models: ["S6730H", "S6730S", "S6730-30X40G", "S6730-54X40G"],
  },
  "huawei-s6720": {
    kind: "switch",
    vendor: "Huawei",
    family: "S6720",
    models: ["S6720-30C", "S6720-54C", "S6720-EI"],
  },
  "huawei-s5700": {
    kind: "switch",
    vendor: "Huawei",
    family: "S5700",
    models: ["S5700-28C", "S5700-52C"],
  },
  "huawei-s5735": {
    kind: "switch",
    vendor: "Huawei",
    family: "S5735",
    models: ["S5735-L24LP4X-A", "S5735-L48LP4X-A"],
  },
  "huawei-ce": {
    kind: "switch",
    vendor: "Huawei",
    family: "CloudEngine",
    models: ["CE5800", "CE6800", "CE7000", "CE12800"],
  },

  // Cisco Routers
  "cisco-asr": {
    kind: "router",
    vendor: "Cisco",
    family: "ASR",
    models: ["ASR1000", "ASR1001", "ASR1002", "ASR1004"],
  },
  "cisco-isr": {
    kind: "router",
    vendor: "Cisco",
    family: "ISR",
    models: ["ISR2900", "ISR4300", "ISR4400"],
  },

  // Juniper Routers
  "juniper-mx": {
    kind: "router",
    vendor: "Juniper",
    family: "MX",
    models: ["MX960", "MX480", "MX240", "MX204"],
  },

  // Datacom Switches
  "datacom-dm": {
    kind: "switch",
    vendor: "Datacom",
    family: "DM",
    models: ["DM4100", "DM4200", "DM4300"],
  },
};
