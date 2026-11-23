CREATE TABLE "error_alerts" (
	"signature" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"route" text,
	"message" text NOT NULL,
	"digest" text,
	"count" integer DEFAULT 1 NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_emailed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "error_alerts_last_seen_idx" ON "error_alerts" USING btree ("last_seen_at");