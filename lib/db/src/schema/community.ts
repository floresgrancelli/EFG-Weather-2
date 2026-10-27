import { pgTable, text, timestamp, uuid, doublePrecision, integer, date, boolean, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const communityReports = pgTable("community_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorHash: text("actor_hash").notNull(),
  category: text("category").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  area: text("area").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, table => [
  index("community_reports_expiry_idx").on(table.expiresAt),
  index("community_reports_order_idx").on(table.observedAt, table.id),
  index("community_reports_actor_idx").on(table.actorHash, table.expiresAt),
]);
export const insertCommunityReportSchema = createInsertSchema(communityReports).omit({ id: true, createdAt: true });
export type CommunityReportRow = typeof communityReports.$inferSelect;

export const communityConfirmations = pgTable("community_confirmations", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id").notNull().references(() => communityReports.id, { onDelete: "cascade" }),
  actorHash: text("actor_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("community_confirmation_once").on(table.reportId, table.actorHash)]);

export const fragranceChoices = pgTable("fragrance_choices", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorHash: text("actor_hash").notNull(),
  day: date("day", { mode: "string" }).notNull(),
  perfume: text("perfume").notNull(),
  normalizedPerfume: text("normalized_perfume").notNull(),
  occasion: text("occasion"),
  city: text("city"),
  weatherAvailable: boolean("weather_available").notNull().default(false),
  weather: jsonb("weather"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("fragrance_choice_per_day").on(table.actorHash, table.day), index("fragrance_choices_day_idx").on(table.day)]);
export const insertFragranceChoiceSchema = createInsertSchema(fragranceChoices).omit({ id: true, createdAt: true, updatedAt: true });

export const communityRateLimits = pgTable("community_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(1),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, table => [index("community_rate_limits_expiry_idx").on(table.expiresAt)]);
