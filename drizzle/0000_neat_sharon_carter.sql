CREATE TYPE "public"."item_status" AS ENUM('bought', 'listed', 'sold', 'posted', 'completed', 'returned', 'unsold', 'donated');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'seller');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"size" text,
	"condition" text,
	"notes" text,
	"photo_url" text,
	"category_id" integer,
	"status" "item_status" DEFAULT 'bought' NOT NULL,
	"shop_id" integer,
	"bought_at" date NOT NULL,
	"buy_price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"listed_at" date,
	"list_price" numeric(10, 2),
	"vinted_url" text,
	"sold_at" date,
	"sold_price" numeric(10, 2),
	"postal_service_id" integer,
	"posted_at" date,
	"returned_at" date,
	"refund_amount" numeric(10, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "postal_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"changed_at" date NOT NULL,
	"old_price" numeric(10, 2) NOT NULL,
	"new_price" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'seller' NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"theme" text DEFAULT 'blossom' NOT NULL,
	"color_mode" text DEFAULT 'system' NOT NULL,
	"monthly_profit_goal" numeric(10, 2),
	"stale_after_days" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_postal_service_id_postal_services_id_fk" FOREIGN KEY ("postal_service_id") REFERENCES "public"."postal_services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postal_services" ADD CONSTRAINT "postal_services_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_user_idx" ON "categories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "items_user_status_idx" ON "items" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "items_user_bought_idx" ON "items" USING btree ("user_id","bought_at");--> statement-breakpoint
CREATE INDEX "items_user_sold_idx" ON "items" USING btree ("user_id","sold_at");--> statement-breakpoint
CREATE INDEX "postal_user_idx" ON "postal_services" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "price_changes_item_idx" ON "price_changes" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "shops_user_idx" ON "shops" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");