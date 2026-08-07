# Phase 2 Final Checklist

## Included
- Employee work submission with completion notes, time, links, and evidence files.
- Versioned resubmissions after changes are requested.
- Reviewer queue with safe empty/error states.
- Approve, request changes, reject, and reviewer reassignment.
- Sequential one-, two-, or three-level approval.
- Automatic task completion after final approval.
- Daily-log submission, checking, and correction requests.
- Role-specific access for employees, reviewers, team leads, and admins.
- Private Supabase Storage bucket and RLS migration.

## Upgrade order
1. Copy `.env.local` from the previous working folder.
2. Run `supabase/phase2_reviews.sql` once in Supabase SQL Editor.
3. Run `npm install`.
4. Run `npm run dev`.
5. Create a new task after Phase 2 migration and assign Reviewer 1.

## Acceptance test
1. Admin creates team lead, reviewer, and employee.
2. Admin creates a new task with Reviewer 1 and optional Reviewer 2.
3. Employee submits a file.
4. Reviewer requests changes.
5. Employee submits Version 2.
6. Reviewer approves.
7. Next reviewer approves if configured.
8. Confirm task status becomes completed.
9. Employee submits a daily log.
10. Reviewer marks it checked.
