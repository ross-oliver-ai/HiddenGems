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
import { sql } from "drizzle-orm";

export const roleEnum = pgEnum("role", ["admin", "seller"]);

export const itemStatusEnum = pgEnum("item_status", [
  "bought", // bought, not yet listed
  "listed", // live for sale
  "sold", // sold, not yet posted
  "posted", // posted to buyer
  "completed", // buyer confirmed, money received
  "returned", // sold then returned/refunded
  "unsold", // gave up on selling
  "donated", // donated back
]);

// How a sold item got to the buyer
export const handoverEnum = pgEnum("handover_method", [
  "posted", // sent through a postal service
  "collected", // the buyer came and collected it
  "delivered", // the seller delivered it by hand
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
    // First-run checklist on Home. New accounts see it until they hide it or finish it; the migration that added this hid it for
    // every account that already existed. feesReviewedAt is set whenever the selling-fees form is saved (a 0% fee is a valid answer).
    checklistHidden: boolean("checklist_hidden").notNull().default(false),
    feesReviewedAt: timestamp("fees_reviewed_at", { withTimezone: true }),
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

/** Places an item can be sold: Vinted, eBay, Depop, … One list per user, like shops and postal services. */
export const platforms = pgTable(
  "platforms",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    archived: boolean("archived").notNull().default(false),
    // Optional selling fee as a percentage of the sold price. 0 = none. Only used to pre-fill the fee on a sale.
    feePercent: numeric("fee_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  },
  (t) => [index("platforms_user_idx").on(t.userId)],
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
    // listedAt / listPrice summarise the item's live listings (earliest date, first listing's price) and are kept in step by the code.
    // The real per-platform data lives in `listings`. vinted_url is no longer written (kept: migrations are additive only).
    listPrice: numeric("list_price", { precision: 10, scale: 2 }),
    vintedUrl: text("vinted_url"),

    // sold
    soldAt: date("sold_at"),
    soldPrice: numeric("sold_price", { precision: 10, scale: 2 }),
    postalServiceId: integer("postal_service_id").references(() => postalServices.id, {
      onDelete: "set null",
    }),
    postedAt: date("posted_at"), // when it was posted, or handed over for collected/delivered items
    soldPlatformId: integer("sold_platform_id").references(() => platforms.id, { onDelete: "set null" }),
    handover: handoverEnum("handover"),
    // What the sale cost the seller: platform fees (a £ amount fixed at the sale) and postage/delivery they paid. 0 = none.
    fees: numeric("fees", { precision: 10, scale: 2 }).notNull().default("0"),
    postagePaid: numeric("postage_paid", { precision: 10, scale: 2 }).notNull().default("0"),

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

/** One row per platform an item has been listed on. endedAt is null while the listing is live. */
export const listings = pgTable(
  "listings",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    platformId: integer("platform_id")
      .notNull()
      .references(() => platforms.id, { onDelete: "cascade" }),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    url: text("url"),
    listedAt: date("listed_at").notNull(),
    endedAt: date("ended_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("listings_item_idx").on(t.itemId),
    index("listings_platform_idx").on(t.platformId),
    // An item can only be live once on each platform
    uniqueIndex("listings_live_unique").on(t.itemId, t.platformId).where(sql`${t.endedAt} is null`),
  ],
);

// Each time the asking price is reduced
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
    listingId: integer("listing_id").references(() => listings.id, { onDelete: "set null" }),
  },
  (t) => [index("price_changes_item_idx").on(t.itemId)],
);

export type User = typeof users.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Platform = typeof platforms.$inferSelect;
export type Listing = typeof listings.$inferSelect;
export type Handover = (typeof handoverEnum.enumValues)[number];
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

/** Failed (or in-progress) sign-in attempts, kept only long enough to slow down password guessing. Cleared on a successful sign-in and purged after a day. */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(), // as typed, lower-cased; may not belong to a real account
    ip: text("ip"), // null when the address can't be read
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_email_idx").on(t.email, t.createdAt), index("login_attempts_ip_idx").on(t.ip, t.createdAt), index("login_attempts_created_idx").on(t.createdAt)],
);

/**
 * Things that went wrong on the server, one row per distinct problem (same place, same kind of error), so the admin can be told
 * once rather than once per customer. Only a scrubbed summary is stored: no stack traces, query values, emails or tokens.
 * Rows are purged after 30 days without the problem recurring.
 */
export const errorAlerts = pgTable(
  "error_alerts",
  {
    signature: text("signature").primaryKey(), // source + place + kind of error, with numbers and ids flattened
    source: text("source").notNull(), // e.g. "render", "action", "route", "Stripe webhook"
    route: text("route"), // the page or route pattern, without query strings
    message: text("message").notNull(), // scrubbed and shortened
    digest: text("digest"), // Next.js's short id, to find the full log line in Vercel
    count: integer("count").notNull().default(1),
    isTest: boolean("is_test").notNull().default(false),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastEmailedAt: timestamp("last_emailed_at", { withTimezone: true }), // null: never emailed (or held back by the daily cap)
  },
  (t) => [index("error_alerts_last_seen_idx").on(t.lastSeenAt)],
);
