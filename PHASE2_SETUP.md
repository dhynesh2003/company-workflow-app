# Phase 2 setup

This package includes Phase 1, Phase 1B daily logs, and Phase 2 submission/review workflow.

## Upgrade an existing Phase 1B installation

1. Stop the old dev server.
2. Keep a backup of the old folder and copy its `.env.local` into this folder.
3. Run `npm install`.
4. In the existing Supabase project, run `supabase/phase2_reviews.sql` once.
5. Restart with `npm run dev`.

Do not rerun `phase1.sql` or `phase1b_daily_logs.sql` if those migrations already succeeded.

## Test accounts

Create at least:
- one admin
- one team lead
- one reviewer
- one employee

Assign reporting relationships from Admin > Users. Create a new task and select Reviewer 1. Reviewer 2 and Reviewer 3 are optional.

## End-to-end test

1. Admin/team lead creates a task with an approval chain.
2. Employee signs in, opens My Work, opens the task, and selects Submit work for review.
3. Employee enters a completion note, time, external link, and optional evidence files.
4. Reviewer signs in and opens Review Queue.
5. Reviewer can approve, request changes, reject, or reassign the current step.
6. When changes are requested, the employee submits a new version.
7. Approval moves to the next configured reviewer.
8. The final approval changes the task to Completed.

## File rules

The migration creates a private Supabase Storage bucket named `task-evidence`.
The app accepts up to 10 files per submission and 50 MB per file. The Next.js Server Action request limit is configured to 50 MB total, so for practical use keep the combined upload below 50 MB.

## Existing tasks

Tasks created before Phase 2 have no approval chain. Create a new test task after running the migration. Existing tasks cannot be submitted until approval steps are configured.
