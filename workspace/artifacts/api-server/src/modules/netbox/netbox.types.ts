export type NetBoxConfig = {
  enabled: boolean;
  baseUrl: string | null;
  tokenConfigured: boolean;
  skipTlsVerify: boolean;
  timeoutMs: number;
  pageSize: number;
  readiness: "disabled" | "partial" | "ready";
  lastConnectionStatus: string | null;
  lastConnectionAt: string | null;
  baseUrlConfigured: boolean;
};

export type NetBoxStatusResponse = NetBoxConfig;

export type NetBoxConnectionTestResponse = {
  status: "disabled" | "missing_config" | "ok" | "error";
  message: string;
  readiness: NetBoxConfig["readiness"];
  baseUrlConfigured: boolean;
  tokenConfigured: boolean;
  skipTlsVerify: boolean;
  testedAt: string;
  version?: string | null;
};

export type NetBoxListResponse<T> = {
  count: number;
  items: T[];
  next: string | null;
  previous: string | null;
};

export type NetBoxDevice = {
  id: number;
  name: string;
  displayName: string;
  ipAddress: string | null;
  siteId: number | null;
  siteName: string | null;
  tenantId: number | null;
  tenantName: string | null;
  roleId: number | null;
  roleName: string | null;
  vendor: string | null;
  platform: string | null;
  status: string | null;
  description: string | null;
  comments: string | null;
};

export type NetBoxSimpleItem = {
  id: number;
  name: string;
  slug: string | null;
  displayName: string;
};

export type NetBoxSyncPreviewRequest = {
  pageSize?: number;
};

export type NetBoxSyncPreviewItem = {
  netboxDeviceId: number;
  hostname: string;
  ipAddress: string | null;
  site: string | null;
  role: string | null;
  vendor: string | null;
  platform: string | null;
  action: "create" | "update" | "skip";
  matchedLocalDeviceId: number | null;
  warnings: string[];
};

export type NetBoxSyncPreviewResponse = {
  summary: {
    totalFromNetBox: number;
    matchedByNetboxId: number;
    matchedByHostname: number;
    toCreate: number;
    toUpdate: number;
    toSkip: number;
    warnings: number;
  };
  items: NetBoxSyncPreviewItem[];
};

export type NetBoxSyncResult = NetBoxSyncPreviewResponse & {
  durationMs: number;
  created: number;
  updated: number;
  skipped: number;
  warningsList: string[];
};
