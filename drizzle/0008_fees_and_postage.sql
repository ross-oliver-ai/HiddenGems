ALTER TABLE "items" ADD COLUMN "fees" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "postage_paid" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "platforms" ADD COLUMN "fee_percent" numeric(5, 2) DEFAULT '0' NOT NULL;