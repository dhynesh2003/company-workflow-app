# Phase 1B — Daily Work Log Setup

This update converts the employee spreadsheet into structured daily work logs.

## Existing Phase 1 installation
1. Replace your project files with this updated package, but keep your `.env.local`.
2. In Supabase SQL Editor run `supabase/phase1b_daily_logs.sql` once.
3. Restart the app: `npm run dev`.
4. Admin opens **Work Categories** and confirms the default categories.
5. Employee opens **Daily Work Log**, enters date, attendance, work rows, duration, count and remarks.
6. Employee submits the log.
7. Team lead/admin opens **Team Daily Logs** and marks it checked or requests changes.

## Main routes
- `/daily-log/new`
- `/my-timesheet`
- `/admin/daily-logs`
- `/admin/work-categories`

## Data model
- `daily_logs`: one employee and one date
- `daily_log_items`: unlimited work rows inside that date
- `work_categories`: configurable Animation, Audio, PDF/SCO, Quiz and other categories

Do not rerun `phase1.sql` on an existing project. Run only the Phase 1B migration.
