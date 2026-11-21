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
    colorMode: text("color_mode").notNull().default("dark"), // light | dark | system (new accounts start in dark mode; existing accounts keep their choice)
    monthlyProfitGoal: numeric("monthly_profit_goal", { precision: 10, scale: 2 }),
    staleAfterDays: integer("stale_after_days").notNull().default(30),
    // Null = signed up themselves and hasn't confirmed their email yet (accounts made by the admin are confirmed on creation)
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    // Billing. None of this is enforced unless BILLING_ENABLED=true in Vercel.
    // "Free forever" accounts (e.g. the first testers) are never locked.
    billingExempt: boolean("billing_exempt").notNull().default(false),
    // End of the free trial (set at sign-up). Null falls back to created_at + the trial length.
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    // Mirrors Stripe's subscription status: active, past_due, canceled, unpaid, ...
    subscriptionStatus: text("subscription_status"),
    subscriptionPeriodEnd: timestamp("subscription_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    // Set when a payment fails, cleared when it succeeds: drives the short grace period
    paymentFailedAt: timestamp("payment_failed_at", { withTimezone: true }),
    trialReminder7SentAt: timestamp("trial_reminder_7_sent_at", { withTimezone: true }),
    trialReminder1SentAt: timestamp("trial_reminder_1_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email), index("users_stripe_customer_idx").on(t.stripeCustomerId)],
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

/** People who asked for an invite on the public landing page. */
export const waitlist = pgTable(
  "waitlist",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("waitlist_email_idx").on(t.email)],
);

export type WaitlistEntry = typeof waitlist.$inferSelect;

export const tokenKindEnum = pgEnum("token_kind", ["verify_email", "reset_password", "change_email"]);

/** One-time links sent by email (confirm your email, reset your password, confirm a new email). Only a hash of the token is stored. */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: tokenKindEnum("kind").notNull(),
    tokenHash: text("token_hash").notNull(),
    payload: text("payload"), // extra data carried by the link, e.g. the new email address for change_email
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("auth_tokens_hash_idx").on(t.tokenHash), index("auth_tokens_user_idx").on(t.userId, t.kind)],
);

/** Stripe webhook events we've already handled (Stripe can send the same event more than once). */
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
