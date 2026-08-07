# Phase 3 Final Acceptance Checklist

## Notifications
- Assign a task and verify the employee receives **New task assigned**.
- Submit work and verify Reviewer 1 receives **Work waiting for review**.
- Request changes and verify the employee receives a correction notification.
- Approve all levels and verify the employee receives **Task completed**.
- Submit/check a daily log and verify the correct notifications.

## Dashboards
- Employee dashboard shows only their work.
- Reviewer sees their pending reviews.
- Team lead dashboard shows only their team.
- Admin dashboard shows company-wide totals.

## Reports
- Filter by date, team and employee.
- Export CSV and open it in Excel.
- Export XLSX and confirm rows and columns are correct.

## Security
- Employee cannot open another employee's task.
- Employee cannot review their own submission.
- Reviewer sees only assigned review steps.
- Team lead cannot manage another team.
- Inactive users cannot use the application.
- Checked daily logs cannot be edited.
- Evidence files remain private.

## Production
- `npm run build` succeeds locally.
- Vercel environment variables are set.
- Supabase URL does not include `/rest/v1`.
- The service-role key exists only as a server environment variable.
