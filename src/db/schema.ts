import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  date,
  numeric,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "seller"]);

export const itemStatusEnum = pgEnum("item_status", [
  "bought", // bought, not yet on Vinted
  "listed", // live on Vinted
  "sold", // sold, not yet posted
  "posted", // posted to buyer
  "completed", // buyer confirmed, money received
  "returned", // sold then returned/refunded
  "unsold", // gave up on selling
  "donated", // donated back
]);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("seller"),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    disabled: boolean("disabled").notNull().default(false),
    // per-user settings
    theme: text("theme").notNull().default("blossom"),
    colorMode: text("color_mode").notNull().default("system"), // light | dark | system
    monthlyProfitGoal: numeric("monthly_profit_goal", { precision: 10, scale: 2 }),
    staleAfterDays: integer("stale_after_days").notNull().default(30),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const shops = pgTable(
  "shops",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [index("shops_user_idx").on(t.userId)],
);

export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [index("categories_user_idx").on(t.userId)],
);

export const postalServices = pgTable(
  "postal_services",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [index("postal_user_idx").on(t.userId)],
);

export const items = pgTable(
  "items",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    brand: text("brand"),
    size: text("size"),
    condition: text("condition"),
    notes: text("notes"),
    photoUrl: text("photo_url"),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    status: itemStatusEnum("status").notNull().default("bought"),

    // bought
    shopId: integer("shop_id").references(() => shops.id, { onDelete: "set null" }),
    boughtAt: date("bought_at").notNull(),
    buyPrice: numeric("buy_price", { precision: 10, scale: 2 }).notNull().default("0"),

    // listed
    listedAt: date("listed_at"),
    listPrice: numeric("list_price", { precision: 10, scale: 2 }),
    vintedUrl: text("vinted_url"),

    // sold
    soldAt: date("sold_at"),
    soldPrice: numeric("sold_price", { precision: 10, scale: 2 }),
    postalServiceId: integer("postal_service_id").references(() => postalServices.id, {
      onDelete: "set null",
    }),
    postedAt: date("posted_at"),

    // returned / refunded
    returnedAt: date("returned_at"),
    refundAmount: numeric("refund_amount", { precision: 10, scale: 2 }),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("items_user_status_idx").on(t.userId, t.status),
    index("items_user_bought_idx").on(t.userId, t.boughtAt),
    index("items_user_sold_idx").on(t.userId, t.soldAt),
  ],
);

// Each time the asking price is reduced on Vinted
export const priceChanges = pgTable(
  "price_changes",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    changedAt: date("changed_at").notNull(),
    oldPrice: numeric("old_price", { precision: 10, scale: 2 }).notNull(),
    newPrice: numeric("new_price", { precision: 10, scale: 2 }).notNull(),
  },
  (t) => [index("price_changes_item_idx").on(t.itemId)],
);

export type User = typeof users.$inferSelect;
export type Item = typeof items.$inferSelect;
export type ItemStatus = (typeof itemStatusEnum.enumValues)[number];
