CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_exempt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_status" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "payment_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_reminder_7_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "trial_reminder_1_sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "users_stripe_customer_idx" ON "users" USING btree ("stripe_customer_id");--> statement-breakpoint
-- Everyone who exists when billing ships (the first testers) stays free forever; only later sign-ups get a trial
UPDATE "users" SET "billing_exempt" = true;
