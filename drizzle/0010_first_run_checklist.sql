ALTER TABLE "users" ADD COLUMN "checklist_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "fees_reviewed_at" timestamp with time zone;--> statement-breakpoint
-- The first-run checklist is for new accounts only: hide it for everyone who already exists. (Accounts created after this have it on.)
UPDATE "users" SET "checklist_hidden" = true;
