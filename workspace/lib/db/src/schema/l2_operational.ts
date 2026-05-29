import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { devicesTable } from "./devices";

export const l2DeviceOperationalTable = pgTable("l2_device_operational", {
  deviceId: integer("device_id")
    .primaryKey()
    .references(() => devicesTable.id, { onDelete: "cascade" }),
  lastRefreshAt: timestamp("last_refresh_at"),
  freshness: text("freshness").notNull().default("unknown"),
  operationalState: jsonb("operational_state").default({}).notNull(),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type L2DeviceOperational = typeof l2DeviceOperationalTable.$inferSelect;
export type InsertL2DeviceOperational = typeof l2DeviceOperationalTable.$inferInsert;
