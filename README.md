# Gym Fantasy

Fantasy fitness league — weekly head-to-head matchups, 5 points per rep, US Eastern cutoffs.

## Stack

- Expo SDK 54 + Expo Router (Expo Go compatible)
- Supabase Auth, Postgres, RLS, Realtime
- Edge Functions for Sunday weekly finalize + season rollover

## Setup

1. Copy env template and fill in your Supabase values (never commit `.env`):
   ```bash
   cp .env.example .env
   ```
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` (publishable key)

2. Apply the schema in Supabase:
   - Open **SQL Editor**
   - Paste and run [`supabase/migrations/20260716000000_initial_schema.sql`](supabase/migrations/20260716000000_initial_schema.sql)
   - If you already applied the initial schema earlier, also run [`supabase/migrations/20260716000002_unique_display_names.sql`](supabase/migrations/20260716000002_unique_display_names.sql) (unique display names + availability check)
   - For an existing database, then run [`supabase/migrations/20260717000003_workout_sets.sql`](supabase/migrations/20260717000003_workout_sets.sql) (sets, reps per set, and server-calculated totals)
   - Finally run [`supabase/migrations/20260717000004_set_based_workouts.sql`](supabase/migrations/20260717000004_set_based_workouts.sql) (workout sessions, per-set weight/reps, and transactional submission)

3. Confirm **Authentication → Sign In / Providers → Email** is enabled.

4. Install and run:
   ```bash
   npm install
   npx expo start
   ```
   Open in Expo Go on your phone.

## Deploy edge functions (optional until you want automation)

```bash
npx supabase login
npx supabase link --project-ref yyusawtmcqmcoztyvodp
npx supabase functions deploy weekly-finalize
npx supabase functions deploy season-rollover
npx supabase secrets set CRON_SECRET=your-long-random-string
```

Then run [`supabase/migrations/20260716000001_cron_schedules.sql`](supabase/migrations/20260716000001_cron_schedules.sql) in the SQL Editor (replace `YOUR_CRON_SECRET`).

## App tabs

| Tab | Purpose |
|-----|---------|
| Home | Season info, your leagues, sign out |
| League | Create / join pool, start bracket (even members only) |
| Log | Build workouts with exercises and variable weight/reps per set |
| Scoreboard | Live H2H scores + per-set opponent activity (Realtime) |

## Rules enforced

- 5 points per rep (DB trigger)
- Late logs rejected after Sunday 11:59:59 PM America/New_York
- Bracket start requires even member count
- Seasons: Jan–Apr, May–Aug, Sep–Dec (auto-created)
