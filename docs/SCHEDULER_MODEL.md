# Scheduler Model

## Scope

Local scheduler only.

## Tables

- `scheduled_jobs`
- `scheduled_job_runs`
- `scheduled_job_run_items`

## Job types

- `discovery`
- `compliance`
- `health_check`

## Target types

- `device`
- `device_group`
- `all_devices`

## Rules

- no Redis
- no distributed queue
- no apply
- no rollback
- every run is audited
- one failed device does not stop the run

## Schedule behavior

- API starts the scheduler loop
- loop checks due jobs every 30-60 seconds
- `interval_minutes` is the active scheduling source in MVP
- `cron_expression` is stored for future phase

