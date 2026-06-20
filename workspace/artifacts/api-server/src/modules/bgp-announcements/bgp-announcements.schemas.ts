export type AnnouncementMatrixCellInput = {
  circuitId: string;
  upstreamName: string;
  state: string;
  community?: string | null;
  actionCode?: string | null;
  note?: string | null;
};

export type AnnouncementMatrixRowInput = {
  routePolicyName: string;
  targetType: string;
  family: string;
  prefixScope: string[];
  affectedPrefixes: string[];
  cells: AnnouncementMatrixCellInput[];
  risk: string;
};

export const announcementMatrixCellSchema = { name: "announcementMatrixCellSchema" } as const;
export const announcementMatrixRowSchema = { name: "announcementMatrixRowSchema" } as const;
export const announcementMatrixPayloadSchema = { name: "announcementMatrixPayloadSchema" } as const;
export const announcementMatrixSummarySchema = { name: "announcementMatrixSummarySchema" } as const;
