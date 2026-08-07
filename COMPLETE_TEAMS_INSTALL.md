# Complete Teams Upgrade Installed

This full project already includes the Teams upgrade merged into the existing app.

## Included
- Existing dashboard, tasks, reviews, notifications, daily logs, timesheets, reports, users, hierarchy and audit log
- Team list with lead, member count, task count and active status
- Create team with lead and initial members
- Edit team settings and lead
- Admin and team-lead member management
- Team details route: `/admin/teams/[id]`
- Team-filtered task assignment
- Team navigation visible to admins and team leads
- Matching Teams CSS
- Supabase migration: `supabase/phase4_teams_management.sql`

## First run
1. Copy your existing `.env.local` into the project root.
2. Run `supabase/phase4_teams_management.sql` once in Supabase SQL Editor.
3. Run:

```powershell
npm install
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build
npm start
```

## Test
- Admin creates a team and selects a lead and members.
- Team lead opens Teams and manages their own members.
- Team lead creates a task and sees only employees in their team.
- Employee receives and submits the task.
- Reviewer completes the approval flow.
