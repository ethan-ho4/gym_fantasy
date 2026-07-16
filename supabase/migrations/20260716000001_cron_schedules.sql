-- Schedule weekly finalize and season rollover via pg_cron + pg_net.
-- Run this in the Supabase SQL Editor AFTER deploying edge functions
-- and setting CRON_SECRET + enabling pg_cron / pg_net extensions.
--
-- Replace:
--   YOUR_PROJECT_REF  → yyusawtmcqmcoztyvodp
--   YOUR_CRON_SECRET  → a long random string you also set as CRON_SECRET edge secret

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Sunday ~23:59 ET ≈ Monday 03:59 UTC (EST) / 04:59 UTC (EDT).
-- Schedule at 04:05 UTC; finalize_week is idempotent enough for DST skew.
select cron.schedule(
  'weekly-finalize',
  '5 4 * * 1',
  $$
  select net.http_post(
    url := 'https://yyusawtmcqmcoztyvodp.supabase.co/functions/v1/weekly-finalize',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Season boundaries: Jan 1, May 1, Sep 1 at 05:00 UTC
select cron.schedule(
  'season-rollover',
  '0 5 1 1,5,9 *',
  $$
  select net.http_post(
    url := 'https://yyusawtmcqmcoztyvodp.supabase.co/functions/v1/season-rollover',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
