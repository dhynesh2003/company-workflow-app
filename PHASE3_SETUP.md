# Phase 3 Final Setup

1. Copy `.env.local` from your current project into this folder.
2. Run `npm install`.
3. Run `supabase/phase3_production.sql` in the same Supabase project.
4. Restart with `npm run dev`.
5. Test Notifications, Dashboard, Team Dashboard, Reports, Audit Log and exports.

## Production deployment
- Push the folder to GitHub.
- Import it into Vercel.
- Add the three environment variables from `.env.local` in Vercel settings.
- Deploy.

## Final acceptance flow
- Admin assigns a task with Reviewer 1.
- Employee submits work.
- Reviewer receives a notification and approves or requests changes.
- Employee receives the result notification.
- Daily log submission notifies the manager/team lead.
- Reports export successfully as CSV and XLSX.
- Audit Log displays task and submission events.
