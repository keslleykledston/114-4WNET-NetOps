-- Reset legacy BGP announcement prototype tables (pre-0057 schema) so foundation migrations can apply.
-- Safe when snapshots table still uses rows_json instead of matrix_json/is_latest.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bgp_announcement_matrix_snapshots'
      AND column_name = 'rows_json'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bgp_announcement_matrix_snapshots'
      AND column_name = 'is_latest'
  ) THEN
    DROP TABLE IF EXISTS bgp_announcement_rollbacks CASCADE;
    DROP TABLE IF EXISTS bgp_announcement_postchecks CASCADE;
    DROP TABLE IF EXISTS bgp_announcement_execution_locks CASCADE;
    DROP TABLE IF EXISTS bgp_announcement_executions CASCADE;
    DROP TABLE IF EXISTS bgp_announcement_approvals CASCADE;
    DROP TABLE IF EXISTS bgp_announcement_change_previews CASCADE;
    DROP TABLE IF EXISTS bgp_announcement_change_plans CASCADE;
    DROP TABLE IF EXISTS bgp_announcement_history_events CASCADE;
    DROP TABLE IF EXISTS bgp_announcement_matrix_diffs CASCADE;
    DROP TABLE IF EXISTS bgp_announcement_matrix_runs CASCADE;
    DROP TABLE IF EXISTS bgp_announcement_targets CASCADE;
    DROP TABLE IF EXISTS bgp_announcement_matrix_snapshots CASCADE;
  END IF;
END $$;
