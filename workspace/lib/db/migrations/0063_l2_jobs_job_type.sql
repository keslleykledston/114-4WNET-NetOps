-- Distinguish discovery vs operational refresh jobs in l2_discovery_jobs.
ALTER TABLE l2_discovery_jobs ADD COLUMN IF NOT EXISTS job_type text NOT NULL DEFAULT 'discovery';

CREATE INDEX IF NOT EXISTS l2_discovery_jobs_job_type_idx ON l2_discovery_jobs (job_type);
