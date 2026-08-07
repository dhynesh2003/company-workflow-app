# Company Workflow — Phase 3 Final

A complete company work, daily-log, submission, review, reporting and audit system for an 11-person hierarchy.

## Included
- Role-based login and dashboards
- Users, teams and reporting hierarchy
- Mandatory reviewer task assignment
- Daily work logs and timesheets
- Evidence upload and versioned submissions
- Multi-level approval, changes, rejection and reassignment
- In-app notifications and unread count
- Team dashboard
- Daily/weekly/monthly report filtering
- CSV and XLSX export
- Searchable company task view
- Audit-log screen
- Consolidated RLS repairs
- Vercel deployment instructions

## Upgrade from your current project
1. Stop the old server.
2. Keep a backup of the old folder.
3. Extract this package.
4. Copy your existing `.env.local` into this project's `phase1-workflow` folder.
5. Run `npm install`.
6. Run `supabase/phase3_production.sql` once in the existing Supabase project.
7. Run `npm run dev`.

Do not rerun the Phase 1 and Phase 2 migrations if they already succeeded.

## Environment variables
```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
```

## Production
```powershell
npm run build
npm start
```

For deployment, import the project into Vercel and add the same environment variables.
