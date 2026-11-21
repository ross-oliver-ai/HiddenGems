ALTER TYPE "public"."token_kind" ADD VALUE 'change_email';--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD COLUMN "payload" text;