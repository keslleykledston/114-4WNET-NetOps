export type SnmpCredentialSource =
  | "device"
  | "device_profile"
  | "tenant_profile"
  | "env"
  | "none";

export type SnmpCredentialErrorCode =
  | "SNMP_CREDENTIAL_NOT_CONFIGURED"
  | "SNMP_CREDENTIAL_PROFILE_NOT_FOUND"
  | "SNMP_CREDENTIAL_DISABLED";

export type SnmpCredentialResolution = {
  source: SnmpCredentialSource;
  available: boolean;
  length: number;
  value?: string; // uso interno somente; nunca expor via API/log
  errorCode?: SnmpCredentialErrorCode;
};

export type SnmpCredentialProfile = {
  id: number;
  enabled: boolean;
  // segredo real só existe aqui em memória durante resolução; nunca logar/persistir.
  snmpCommunity?: string | null;
};

export type ResolveSnmpCredentialInput = {
  device: {
    snmpCommunity?: string | null;
    snmpProfileId?: number | null;
  };
  tenant?: {
    snmpProfileId?: number | null;
  };
  profiles?: {
    // qualquer estrutura de suporte: map por id ou array.
    credentialProfilesById?: Record<string, SnmpCredentialProfile | undefined>;
    credentialProfiles?: SnmpCredentialProfile[];
  };
  env?: {
    snmpCommunity?: string | null;
    labFallbackAllowed?: boolean;
  };
  nodeEnv?: string;
};

function trimNonEmpty(value: string | null | undefined): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  return v.length > 0 ? v : null;
}

function isEnvFallbackAllowed(input: ResolveSnmpCredentialInput): boolean {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV ?? "production";
  if (nodeEnv !== "production") return true;
  if (input.env?.labFallbackAllowed) return true;
  return String(process.env["SNMP_CREDENTIALS_LAB_FALLBACK"] ?? "").toLowerCase() === "true";
}

function findProfileById(input: ResolveSnmpCredentialInput, profileId: number): SnmpCredentialProfile | null {
  const byId = input.profiles?.credentialProfilesById;
  if (byId) {
    const found = byId[String(profileId)];
    return found ? found : null;
  }
  const list = input.profiles?.credentialProfiles ?? [];
  const found = list.find((p) => p.id === profileId);
  return found ?? null;
}

export function resolveSnmpCredential(input: ResolveSnmpCredentialInput): SnmpCredentialResolution {
  // 1) device.snmp_community
  const deviceCommunity = trimNonEmpty(input.device.snmpCommunity);
  if (deviceCommunity) {
    return { source: "device", available: true, length: deviceCommunity.length, value: deviceCommunity };
  }

  // 2) device.snmp_profile_id
  const deviceProfileId = input.device.snmpProfileId ?? null;
  if (deviceProfileId != null) {
    const profile = findProfileById(input, deviceProfileId);
    if (!profile) {
      return {
        source: "device_profile",
        available: false,
        length: 0,
        errorCode: "SNMP_CREDENTIAL_PROFILE_NOT_FOUND",
      };
    }
    if (!profile.enabled) {
      return {
        source: "device_profile",
        available: false,
        length: 0,
        errorCode: "SNMP_CREDENTIAL_DISABLED",
      };
    }
    const community = trimNonEmpty(profile.snmpCommunity ?? null);
    if (!community) {
      return {
        source: "device_profile",
        available: false,
        length: 0,
        errorCode: "SNMP_CREDENTIAL_DISABLED",
      };
    }
    return { source: "device_profile", available: true, length: community.length, value: community };
  }

  // 3) tenant.snmp_profile_id
  const tenantProfileId = input.tenant?.snmpProfileId ?? null;
  if (tenantProfileId != null) {
    const profile = findProfileById(input, tenantProfileId);
    if (!profile) {
      return {
        source: "tenant_profile",
        available: false,
        length: 0,
        errorCode: "SNMP_CREDENTIAL_PROFILE_NOT_FOUND",
      };
    }
    if (!profile.enabled) {
      return {
        source: "tenant_profile",
        available: false,
        length: 0,
        errorCode: "SNMP_CREDENTIAL_DISABLED",
      };
    }
    const community = trimNonEmpty(profile.snmpCommunity ?? null);
    if (!community) {
      return {
        source: "tenant_profile",
        available: false,
        length: 0,
        errorCode: "SNMP_CREDENTIAL_DISABLED",
      };
    }
    return { source: "tenant_profile", available: true, length: community.length, value: community };
  }

  // 4) env fallback (lab only)
  const envCommunity = trimNonEmpty(input.env?.snmpCommunity ?? null);
  if (envCommunity && isEnvFallbackAllowed(input)) {
    return { source: "env", available: true, length: envCommunity.length, value: envCommunity };
  }

  // 5) nothing resolved
  return {
    source: "none",
    available: false,
    length: 0,
    errorCode: "SNMP_CREDENTIAL_NOT_CONFIGURED",
  };
}

export function describeSnmpCredentialResolution(result: SnmpCredentialResolution): {
  source: SnmpCredentialSource;
  available: boolean;
  length: number;
  errorCode?: SnmpCredentialErrorCode;
} {
  return {
    source: result.source,
    available: result.available,
    length: result.length,
    errorCode: result.errorCode,
  };
}
