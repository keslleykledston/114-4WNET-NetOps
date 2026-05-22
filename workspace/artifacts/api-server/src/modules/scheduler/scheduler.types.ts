export const scheduledJobTypes = ["discovery", "compliance", "health_check"] as const;
export type ScheduledJobType = (typeof scheduledJobTypes)[number];

export const scheduledJobTargetTypes = ["device", "device_group", "all_devices"] as const;
export type ScheduledJobTargetType = (typeof scheduledJobTargetTypes)[number];

export const scheduledJobRunStatuses = ["pending", "running", "completed", "failed", "partial", "cancelled"] as const;
export type ScheduledJobRunStatus = (typeof scheduledJobRunStatuses)[number];

export const scheduledJobRunItemStatuses = ["pending", "running", "completed", "failed", "skipped"] as const;
export type ScheduledJobRunItemStatus = (typeof scheduledJobRunItemStatuses)[number];

export const scheduledJobTriggerTypes = ["scheduler", "manual"] as const;
export type ScheduledJobTriggerType = (typeof scheduledJobTriggerTypes)[number];

export type ScheduledJobContexts = string[];

export interface ScheduledJobFilters {
  enabled?: boolean;
}
