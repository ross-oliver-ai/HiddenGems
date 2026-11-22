CREATE TYPE "public"."handover_method" AS ENUM('posted', 'collected', 'delivered');--> statement-breakpoint
CREATE TABLE "listings" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"platform_id" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"url" text,
	"listed_at" date NOT NULL,
	"ended_at" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platforms" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "sold_platform_id" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "handover" "handover_method";--> statement-breakpoint
ALTER TABLE "price_changes" ADD COLUMN "listing_id" integer;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platforms" ADD CONSTRAINT "platforms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listings_item_idx" ON "listings" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "listings_platform_idx" ON "listings" USING btree ("platform_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listings_live_unique" ON "listings" USING btree ("item_id","platform_id") WHERE "listings"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "platforms_user_idx" ON "platforms" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_sold_platform_id_platforms_id_fk" FOREIGN KEY ("sold_platform_id") REFERENCES "public"."platforms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- ===== Copy existing data into the new structure (nothing is changed or removed in the old columns) =====
-- 1. Every existing account gets the default platforms, Vinted first (so it has the lowest id and sorts first).
INSERT INTO "platforms" ("user_id", "name")
SELECT u."id", p."name"
FROM "users" u
CROSS JOIN (VALUES (1, 'Vinted'), (2, 'eBay'), (3, 'Depop'), (4, 'Facebook Marketplace'), (5, 'Gumtree')) AS p("ord", "name")
ORDER BY u."id", p."ord";--> statement-breakpoint
-- 2. Every item that was ever listed becomes a Vinted listing. Items still listed stay live; the rest end on the day they sold
--    (or, for items given up on, the day they were last changed).
INSERT INTO "listings" ("item_id", "platform_id", "price", "url", "listed_at", "ended_at")
SELECT i."id", pl."id", COALESCE(i."list_price", i."sold_price", 0), NULLIF(i."vinted_url", ''), i."listed_at",
  CASE
    WHEN i."status" = 'listed' THEN NULL
    WHEN i."sold_at" IS NOT NULL THEN i."sold_at"
    ELSE (i."updated_at" AT TIME ZONE 'Europe/London')::date
  END
FROM "items" i
JOIN "platforms" pl ON pl."user_id" = i."user_id" AND pl."name" = 'Vinted'
WHERE i."listed_at" IS NOT NULL;--> statement-breakpoint
-- 3. Every existing sale was a Vinted sale that was posted.
UPDATE "items" i
SET "sold_platform_id" = pl."id", "handover" = 'posted'
FROM "platforms" pl
WHERE pl."user_id" = i."user_id" AND pl."name" = 'Vinted' AND i."sold_at" IS NOT NULL;--> statement-breakpoint
-- 4. Price drops belong to that item's (only) listing.
UPDATE "price_changes" pc
SET "listing_id" = l."id"
FROM "listings" l
WHERE l."item_id" = pc."item_id";
