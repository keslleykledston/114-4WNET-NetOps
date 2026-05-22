CREATE TABLE IF NOT EXISTS "scheduled_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "job_type" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" integer,
  "contexts_json" jsonb NOT NULL,
  "cron_expression" text,
  "interval_minutes" integer NOT NULL DEFAULT 60,
  "enabled" boolean NOT NULL DEFAULT true,
  "run_on_startup" boolean NOT NULL DEFAULT false,
  "max_runtime_seconds" integer NOT NULL DEFAULT 3600,
  "created_by" integer,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "last_run_at" timestamp,
  "next_run_at" timestamp
);

CREATE TABLE IF NOT EXISTS "scheduled_job_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "scheduled_job_id" integer NOT NULL,
  "status" text NOT NULL,
  "started_at" timestamp,
  "finished_at" timestamp,
  "triggered_by" text NOT NULL,
  "actor_id" integer,
  "summary_json" jsonb,
  "error_message" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "scheduled_job_run_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "scheduled_job_run_id" integer NOT NULL,
  "device_id" integer NOT NULL,
  "status" text NOT NULL,
  "action_type" text NOT NULL,
  "result_ref_type" text,
  "result_ref_id" text,
  "summary_json" jsonb,
  "error_message" text,
  "started_at" timestamp,
  "finished_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
 ALTER TABLE "scheduled_jobs" ADD CONSTRAINT "scheduled_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "scheduled_job_runs" ADD CONSTRAINT "scheduled_job_runs_scheduled_job_id_scheduled_jobs_id_fk" FOREIGN KEY ("scheduled_job_id") REFERENCES "public"."scheduled_jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "scheduled_job_runs" ADD CONSTRAINT "scheduled_job_runs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "scheduled_job_run_items" ADD CONSTRAINT "scheduled_job_run_items_scheduled_job_run_id_scheduled_job_runs_id_fk" FOREIGN KEY ("scheduled_job_run_id") REFERENCES "public"."scheduled_job_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "scheduled_job_run_items" ADD CONSTRAINT "scheduled_job_run_items_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "scheduled_jobs_enabled_idx" ON "scheduled_jobs" USING btree ("enabled");
CREATE INDEX IF NOT EXISTS "scheduled_jobs_next_run_at_idx" ON "scheduled_jobs" USING btree ("next_run_at");
CREATE INDEX IF NOT EXISTS "scheduled_jobs_target_idx" ON "scheduled_jobs" USING btree ("target_type","target_id");
CREATE INDEX IF NOT EXISTS "scheduled_job_runs_job_started_idx" ON "scheduled_job_runs" USING btree ("scheduled_job_id","started_at");
CREATE INDEX IF NOT EXISTS "scheduled_job_run_items_run_id_idx" ON "scheduled_job_run_items" USING btree ("scheduled_job_run_id");
CREATE INDEX IF NOT EXISTS "scheduled_job_run_items_device_id_idx" ON "scheduled_job_run_items" USING btree ("device_id");
