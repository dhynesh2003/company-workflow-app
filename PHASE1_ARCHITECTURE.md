# Phase 1 Architecture and Product Decisions

## Outcome
Phase 1 is complete when the organisation can be created, every user can sign in, reporting lines are visible, leaders can assign work, employees can update work status, and all access is enforced by the database.

## Why the hierarchy uses manager_id
Job titles are presentation. Reporting lines are authorization data. `profiles.manager_id` allows any shape: employee → reviewer → team lead → admin, without rewriting code when the company changes.

## Role boundary
- Employee: own assigned work.
- Reviewer: own work in Phase 1; approval arrives in Phase 2.
- Team lead: create tasks for active people in the same team.
- Admin: company-wide structure, users, teams and tasks.

## Data model
- organizations: tenant boundary.
- teams: operational groups.
- profiles: app identity linked 1:1 to Supabase Auth.
- tasks: assignment and live Phase 1 status.
- activity_logs: immutable operational history.

## Security model
1. Browser uses a publishable Supabase key.
2. Sessions use secure server-rendered cookie handling.
3. Administrative Auth user creation runs only on the server with the service-role key.
4. PostgreSQL RLS determines which rows can be read or changed.
5. A database trigger prevents employees from changing protected task fields even if they bypass the UI.
6. Audit rows cannot be deleted by ordinary authenticated users.

## State model
Phase 1 intentionally has only:
- not_started
- in_progress
- blocked

Submission, review, changes requested, approved and closed are Phase 2 states because they require versioned submissions and review records.

## First admin bootstrap
The first Supabase Auth user signs in, finds no profile, and is redirected to `/setup`. A controlled database function creates the organisation and the first admin profile. The function refuses to run after the system has been initialized.

## Important operational sequence
1. Run SQL.
2. Create one Auth user manually.
3. Sign in and bootstrap company.
4. Create teams.
5. Create leaders before employees.
6. Create employees with manager and team.
7. Verify hierarchy.
8. Assign a test task.
9. Sign in as employee and update status.

## Phase 1 exclusions
No fake placeholders were added for uploads or approvals. Those features require the Phase 2 tables `task_submissions`, `submission_files`, `approval_steps`, and `reviews`.
