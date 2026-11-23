CREATE TABLE "job_runs" (
	"job" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone NOT NULL,
	"ok" boolean NOT NULL,
	"checked" integer DEFAULT 0 NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"skipped" boolean DEFAULT false NOT NULL,
	"error" text,
	"run_count" integer DEFAULT 1 NOT NULL
);
