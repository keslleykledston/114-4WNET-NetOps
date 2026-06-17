import {
  diffConfigGenerator as diffConfigGeneratorRequest,
  diffConfigGeneratorRun as diffConfigGeneratorRunRequest,
  getConfigGeneratorFeature,
  getConfigGeneratorRun,
  getConfigGeneratorRunArtifacts,
  getConfigGeneratorSuggestionDeviceContext,
  getConfigGeneratorSuggestionServiceContext,
  renderConfigGenerator as renderConfigGeneratorRequest,
  listConfigGeneratorSuggestionDevices,
  listConfigGeneratorSuggestionScope,
  listConfigGeneratorSuggestionTemplates,
  saveConfigGeneratorRun as saveConfigGeneratorRunRequest,
  useGetConfigGeneratorFeature,
  useGetConfigGeneratorRun,
  useGetConfigGeneratorRunArtifacts,
  useDiffConfigGenerator,
  useDiffConfigGeneratorRun,
  useGetConfigGeneratorSuggestionDeviceContext,
  useGetConfigGeneratorSuggestionServiceContext,
  useGetConfigGeneratorTemplateSchema,
  useListConfigGeneratorSuggestionDevices,
  useListConfigGeneratorSuggestionScope,
  useListConfigGeneratorSuggestionTemplates,
  useListConfigGeneratorRuns,
  useListConfigGeneratorTemplates,
  useRenderConfigGenerator,
  useSaveConfigGeneratorRun,
  useValidateConfigGenerator,
  useGetConfigGeneratorChangeRequestPreview,
  useGenerateConfigGeneratorChangeRequestPreview,
  validateConfigGenerator as validateConfigGeneratorRequest,
  type ConfigGeneratorChangeRequestPreview,
  type ConfigGeneratorChangeRequestPreviewEnvelope,
  type ConfigGeneratorChangeRequestPreviewResponse,
  type ConfigGeneratorArtifactResponse,
  type ConfigGeneratorBlockSchema,
  type ConfigGeneratorChangeRequest,
  type ConfigGeneratorDiffBaseline,
  type ConfigGeneratorDiffBlock,
  type ConfigGeneratorDiffLine,
  type ConfigGeneratorDiffLineStatus,
  type ConfigGeneratorDiffResponse,
  type ConfigGeneratorDiffSummary,
  type ConfigGeneratorErrorResponse,
  type ConfigGeneratorFeatureResponse,
  type ConfigGeneratorFieldSchema,
  type ConfigGeneratorFieldOrigins,
  type ConfigGeneratorScopeDevice,
  type ConfigGeneratorScopeResponse,
  type ConfigGeneratorRenderResponse,
  type ConfigGeneratorRunDetail,
  type ConfigGeneratorRunListItem,
  type ConfigGeneratorRunRequest,
  type ConfigGeneratorRunSaveResponse,
  type ConfigGeneratorTemplateSchemaResponse,
  type ConfigGeneratorTemplateSummary,
  type ConfigGeneratorValidationSummary,
  type ConfigGeneratorWriteDisabledResponse,
  type ListConfigGeneratorRunsParams,
  type ValidateConfigGenerator200,
} from "@workspace/api-client-react";
import type { UseQueryResult } from "@tanstack/react-query";

type ConfigGeneratorApiError = Error & {
  data?: {
    code?: string;
    error?: string;
    reason?: string;
  };
};

export type {
  ConfigGeneratorArtifactResponse,
  ConfigGeneratorBlockSchema,
  ConfigGeneratorChangeRequest,
  ConfigGeneratorDiffBaseline,
  ConfigGeneratorDiffBlock,
  ConfigGeneratorDiffLine,
  ConfigGeneratorDiffLineStatus,
  ConfigGeneratorDiffResponse,
  ConfigGeneratorDiffSummary,
  ConfigGeneratorErrorResponse,
  ConfigGeneratorFeatureResponse,
  ConfigGeneratorFieldSchema,
  ConfigGeneratorFieldOrigins,
  ConfigGeneratorScopeDevice,
  ConfigGeneratorScopeResponse,
  ConfigGeneratorRenderResponse,
  ConfigGeneratorRunDetail,
  ConfigGeneratorRunListItem,
  ConfigGeneratorRunRequest,
  ConfigGeneratorRunSaveResponse,
  ConfigGeneratorTemplateSchemaResponse,
  ConfigGeneratorTemplateSummary,
  ConfigGeneratorValidationSummary,
  ConfigGeneratorWriteDisabledResponse,
  ListConfigGeneratorRunsParams,
  ValidateConfigGenerator200,
  ConfigGeneratorChangeRequestPreview,
  ConfigGeneratorChangeRequestPreviewEnvelope,
  ConfigGeneratorChangeRequestPreviewResponse,
} from "@workspace/api-client-react";

export function useConfigGeneratorFeature(): UseQueryResult<boolean, ConfigGeneratorApiError> {
  return useGetConfigGeneratorFeature({
    query: {
      queryKey: ["config-generator", "feature"],
      select: (data) => data.enabled,
    },
  }) as UseQueryResult<boolean, ConfigGeneratorApiError>;
}

export function useConfigGeneratorTemplates(enabled = true) {
  return useListConfigGeneratorTemplates({
    query: {
      enabled,
      queryKey: ["config-generator", "templates"],
    },
  });
}

export function useConfigGeneratorSuggestionScope(enabled = true) {
  return useListConfigGeneratorSuggestionScope({
    query: {
      enabled,
      queryKey: ["config-generator", "suggestions", "scope"],
    },
  });
}

export function useConfigGeneratorSuggestionDevices(tenantId: number | null, enabled = true) {
  return useListConfigGeneratorSuggestionDevices(
    { tenantId: tenantId ?? 0 },
    { query: { enabled: enabled && tenantId != null, queryKey: ["config-generator", "suggestions", "devices", tenantId] } },
  );
}

export function useConfigGeneratorSuggestionDeviceContext(tenantId: number | null, deviceId: number | null, enabled = true) {
  return useGetConfigGeneratorSuggestionDeviceContext(
    { tenantId: tenantId ?? 0, deviceId: deviceId ?? 0 },
    { query: { enabled: enabled && tenantId != null && deviceId != null, queryKey: ["config-generator", "suggestions", "device-context", tenantId, deviceId] } },
  );
}

export function useConfigGeneratorSuggestionTemplates(tenantId: number | null, deviceId: number | null, serviceType: string | null, enabled = true) {
  return useListConfigGeneratorSuggestionTemplates(
    tenantId != null || deviceId != null || serviceType != null ? { ...(tenantId != null ? { tenantId } : {}), ...(deviceId != null ? { deviceId } : {}), ...(serviceType != null ? { serviceType } : {}) } : undefined,
    { query: { enabled: enabled && tenantId != null && deviceId != null, queryKey: ["config-generator", "suggestions", "templates", tenantId, deviceId, serviceType] } },
  );
}

export function useConfigGeneratorSuggestionServiceContext(tenantId: number | null, deviceId: number | null, serviceType: string | null, ref: string | null, enabled = true) {
  return useGetConfigGeneratorSuggestionServiceContext(
    { tenantId: tenantId ?? 0, deviceId: deviceId ?? 0, serviceType: serviceType ?? "", ...(ref ? { ref } : {}) },
    { query: { enabled: enabled && tenantId != null && deviceId != null && serviceType != null, queryKey: ["config-generator", "suggestions", "service-context", tenantId, deviceId, serviceType, ref] } },
  );
}

export function useConfigGeneratorTemplateSchema(templateId: number | null) {
  return useGetConfigGeneratorTemplateSchema(templateId ?? 0, {
    query: {
      queryKey: ["config-generator", "templates", templateId, "schema"],
      enabled: templateId != null,
    },
  });
}

export function useConfigGeneratorRuns(tenantId: number | null, deviceId: number | null, enabled = true) {
  const params: ListConfigGeneratorRunsParams | undefined = tenantId != null || deviceId != null
    ? {
        ...(tenantId != null ? { tenantId } : {}),
        ...(deviceId != null ? { deviceId } : {}),
        limit: 10,
      }
    : undefined;
  return useListConfigGeneratorRuns(params, {
    query: {
      queryKey: ["config-generator", "runs", tenantId, deviceId],
      enabled: enabled && Boolean(tenantId && deviceId),
    },
  });
}

export const fetchConfigGeneratorRun = getConfigGeneratorRun;
export const fetchConfigGeneratorRunArtifacts = getConfigGeneratorRunArtifacts;
export const validateConfigGenerator = validateConfigGeneratorRequest;
export const renderConfigGenerator = renderConfigGeneratorRequest;
export const saveConfigGeneratorRun = saveConfigGeneratorRunRequest;
export const fetchConfigGeneratorFeatureEnabled = async (): Promise<boolean> => (await getConfigGeneratorFeature()).enabled;
export const diffConfigGenerator = diffConfigGeneratorRequest;
export const diffConfigGeneratorRun = diffConfigGeneratorRunRequest;

export const useConfigGeneratorRun = useGetConfigGeneratorRun;
export const useConfigGeneratorRunArtifacts = useGetConfigGeneratorRunArtifacts;
export const useConfigGeneratorDiff = useDiffConfigGenerator;
export const useConfigGeneratorDiffRun = useDiffConfigGeneratorRun;
export const useValidateConfigGeneratorMutation = useValidateConfigGenerator;
export const useRenderConfigGeneratorMutation = useRenderConfigGenerator;
export const useSaveConfigGeneratorRunMutation = useSaveConfigGeneratorRun;

export function useConfigGeneratorChangeRequestPreview(runId: number | null, enabled = true) {
  return useGetConfigGeneratorChangeRequestPreview(runId ?? 0, {
    query: {
      enabled: enabled && runId != null,
      queryKey: ["config-generator", "change-request-preview", runId],
      retry: false,
    },
  });
}

export const useGenerateConfigGeneratorChangeRequestPreviewMutation = useGenerateConfigGeneratorChangeRequestPreview;
