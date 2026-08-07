-- PHASE 2 MIGRATION: submissions, files, reviewer queue, reassignment and multi-level approval
-- Run after phase1.sql and phase1b_daily_logs.sql.

alter table public.tasks alter column status type text using status::text;
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check check(status in ('not_started','in_progress','blocked','submitted','under_review','changes_requested','rejected','completed'));


alter table public.daily_logs add column if not exists review_comment text;

create type public.submission_status as enum ('draft','submitted','under_review','changes_requested','rejected','approved');
create type public.review_step_status as enum ('waiting','pending','approved','changes_requested','rejected');
create type public.review_decision as enum ('approved','changes_requested','rejected','reassigned');

create table public.task_approval_steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  step_order integer not null check(step_order between 1 and 10),
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(task_id, step_order)
);

create table public.task_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  version_number integer not null,
  completion_note text not null,
  external_link text,
  time_spent_minutes integer not null default 0 check(time_spent_minutes >= 0),
  status public.submission_status not null default 'submitted',
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(task_id, version_number)
);

create table public.submission_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submission_id uuid not null references public.task_submissions(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size bigint not null default 0 check(file_size >= 0),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.submission_approval_steps (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.task_submissions(id) on delete cascade,
  step_order integer not null,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  status public.review_step_status not null default 'waiting',
  acted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(submission_id, step_order)
);

create table public.submission_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submission_id uuid not null references public.task_submissions(id) on delete cascade,
  approval_step_id uuid references public.submission_approval_steps(id) on delete set null,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  decision public.review_decision not null,
  comment text,
  reassigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index task_approval_steps_task_idx on public.task_approval_steps(task_id,step_order);
create index task_submissions_task_idx on public.task_submissions(task_id,version_number desc);
create index task_submissions_submitter_idx on public.task_submissions(submitted_by,submitted_at desc);
create index submission_files_submission_idx on public.submission_files(submission_id);
create index submission_approval_reviewer_idx on public.submission_approval_steps(reviewer_id,status);
create index submission_reviews_submission_idx on public.submission_reviews(submission_id,created_at);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('task-evidence','task-evidence',false,52428800,null)
on conflict(id) do update set public=false,file_size_limit=52428800;

create or replace function private.can_review_task(p_task uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(exists(
    select 1 from public.tasks t
    where t.id=p_task and t.organization_id=(select private.current_org_id())
      and (t.current_reviewer_id=(select auth.uid()) or (select private.is_admin()))
  ),false)
$$;

create or replace function public.create_task_submission(
  p_task_id uuid,
  p_completion_note text,
  p_external_link text default null,
  p_time_spent_minutes integer default 0
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_task public.tasks;
  v_submission uuid;
  v_version integer;
  v_first_reviewer uuid;
begin
  select * into v_task from public.tasks where id=p_task_id;
  if v_task.id is null then raise exception 'Task not found'; end if;
  if v_task.assigned_to <> auth.uid() then raise exception 'Only the assigned employee can submit this task'; end if;
  if v_task.status not in ('not_started','in_progress','blocked','changes_requested','rejected') then
    raise exception 'This task cannot be submitted in its current status';
  end if;
  if length(trim(coalesce(p_completion_note,''))) < 5 then raise exception 'Completion note is required'; end if;
  if not exists(select 1 from public.task_approval_steps where task_id=p_task_id) then
    raise exception 'No approval reviewers are configured for this task';
  end if;

  select coalesce(max(version_number),0)+1 into v_version from public.task_submissions where task_id=p_task_id;
  insert into public.task_submissions(organization_id,task_id,submitted_by,version_number,completion_note,external_link,time_spent_minutes,status)
  values(v_task.organization_id,p_task_id,auth.uid(),v_version,trim(p_completion_note),nullif(trim(coalesce(p_external_link,'')),''),greatest(p_time_spent_minutes,0),'under_review')
  returning id into v_submission;

  insert into public.submission_approval_steps(submission_id,step_order,reviewer_id,status)
  select v_submission,step_order,reviewer_id,case when step_order=1 then 'pending'::public.review_step_status else 'waiting'::public.review_step_status end
  from public.task_approval_steps where task_id=p_task_id order by step_order;

  select reviewer_id into v_first_reviewer from public.submission_approval_steps where submission_id=v_submission and step_order=1;
  update public.tasks set status='under_review',current_reviewer_id=v_first_reviewer,blocker_reason=null,updated_at=now() where id=p_task_id;

  insert into public.activity_logs(organization_id,actor_id,action,entity_type,entity_id,details)
  values(v_task.organization_id,auth.uid(),'WORK_SUBMITTED','submission',v_submission,jsonb_build_object('task_id',p_task_id,'version',v_version));
  return v_submission;
end $$;
grant execute on function public.create_task_submission(uuid,text,text,integer) to authenticated;

create or replace function public.review_task_submission(
  p_submission_id uuid,
  p_decision public.review_decision,
  p_comment text default null,
  p_reassign_to uuid default null
) returns text
language plpgsql security definer set search_path=public as $$
declare
  v_submission public.task_submissions;
  v_task public.tasks;
  v_step public.submission_approval_steps;
  v_next public.submission_approval_steps;
  v_role public.app_role;
begin
  select * into v_submission from public.task_submissions where id=p_submission_id;
  if v_submission.id is null then raise exception 'Submission not found'; end if;
  select * into v_task from public.tasks where id=v_submission.task_id;
  select role into v_role from public.profiles where id=auth.uid();
  select * into v_step from public.submission_approval_steps where submission_id=p_submission_id and status='pending' order by step_order limit 1;
  if v_step.id is null then raise exception 'No review step is currently pending'; end if;
  if v_step.reviewer_id <> auth.uid() and v_role <> 'admin' then raise exception 'This review is assigned to another reviewer'; end if;
  if p_decision in ('changes_requested','rejected','reassigned') and length(trim(coalesce(p_comment,''))) < 3 then
    raise exception 'A reason is required for this decision';
  end if;

  if p_decision='reassigned' then
    if p_reassign_to is null then raise exception 'Select another reviewer'; end if;
    if p_reassign_to=v_submission.submitted_by then raise exception 'The submitter cannot review their own work'; end if;
    if not exists(select 1 from public.profiles where id=p_reassign_to and organization_id=v_submission.organization_id and is_active and role in ('reviewer','team_lead','admin')) then
      raise exception 'Selected person is not an active reviewer';
    end if;
    update public.submission_approval_steps set reviewer_id=p_reassign_to where id=v_step.id;
    update public.tasks set current_reviewer_id=p_reassign_to,updated_at=now() where id=v_task.id;
    insert into public.submission_reviews(organization_id,submission_id,approval_step_id,reviewer_id,decision,comment,reassigned_to)
    values(v_submission.organization_id,p_submission_id,v_step.id,auth.uid(),p_decision,trim(p_comment),p_reassign_to);
    return 'reassigned';
  end if;

  insert into public.submission_reviews(organization_id,submission_id,approval_step_id,reviewer_id,decision,comment)
  values(v_submission.organization_id,p_submission_id,v_step.id,auth.uid(),p_decision,nullif(trim(coalesce(p_comment,'')),''));

  if p_decision='changes_requested' then
    update public.submission_approval_steps set status='changes_requested',acted_at=now() where id=v_step.id;
    update public.task_submissions set status='changes_requested' where id=p_submission_id;
    update public.tasks set status='changes_requested',current_reviewer_id=v_step.reviewer_id,updated_at=now() where id=v_task.id;
    return 'changes_requested';
  elsif p_decision='rejected' then
    update public.submission_approval_steps set status='rejected',acted_at=now() where id=v_step.id;
    update public.task_submissions set status='rejected' where id=p_submission_id;
    update public.tasks set status='rejected',updated_at=now() where id=v_task.id;
    return 'rejected';
  end if;

  update public.submission_approval_steps set status='approved',acted_at=now() where id=v_step.id;
  select * into v_next from public.submission_approval_steps where submission_id=p_submission_id and step_order>v_step.step_order and status='waiting' order by step_order limit 1;
  if v_next.id is not null then
    update public.submission_approval_steps set status='pending' where id=v_next.id;
    update public.tasks set status='under_review',current_reviewer_id=v_next.reviewer_id,updated_at=now() where id=v_task.id;
    return 'next_reviewer';
  end if;

  update public.task_submissions set status='approved' where id=p_submission_id;
  update public.tasks set status='completed',current_reviewer_id=null,updated_at=now() where id=v_task.id;
  return 'completed';
end $$;
grant execute on function public.review_task_submission(uuid,public.review_decision,text,uuid) to authenticated;

alter table public.task_approval_steps enable row level security;
alter table public.task_submissions enable row level security;
alter table public.submission_files enable row level security;
alter table public.submission_approval_steps enable row level security;
alter table public.submission_reviews enable row level security;

create policy task_approval_steps_select on public.task_approval_steps for select to authenticated
using(exists(select 1 from public.tasks t where t.id=task_id and t.organization_id=(select private.current_org_id()) and (t.assigned_to=auth.uid() or t.created_by=auth.uid() or (select private.can_manage_assignee(t.assigned_to)) or reviewer_id=auth.uid())));
create policy task_approval_steps_manage on public.task_approval_steps for all to authenticated
using(exists(select 1 from public.tasks t where t.id=task_id and t.organization_id=(select private.current_org_id()) and (t.created_by=auth.uid() or (select private.can_manage_assignee(t.assigned_to)))))
with check(exists(select 1 from public.tasks t where t.id=task_id and t.organization_id=(select private.current_org_id()) and (t.created_by=auth.uid() or (select private.can_manage_assignee(t.assigned_to)))));

create policy task_submissions_select on public.task_submissions for select to authenticated
using(organization_id=(select private.current_org_id()) and (submitted_by=auth.uid() or exists(select 1 from public.submission_approval_steps s where s.submission_id=id and s.reviewer_id=auth.uid()) or (select private.is_admin()) or exists(select 1 from public.tasks t where t.id=task_id and (t.created_by=auth.uid() or (select private.can_manage_assignee(t.assigned_to))))));
create policy task_submissions_insert on public.task_submissions for insert to authenticated
with check(organization_id=(select private.current_org_id()) and submitted_by=auth.uid());

create policy submission_files_select on public.submission_files for select to authenticated
using(organization_id=(select private.current_org_id()) and exists(select 1 from public.task_submissions s where s.id=submission_id));
create policy submission_files_insert on public.submission_files for insert to authenticated
with check(organization_id=(select private.current_org_id()) and uploaded_by=auth.uid() and exists(select 1 from public.task_submissions s where s.id=submission_id and s.submitted_by=auth.uid()));

create policy submission_steps_select on public.submission_approval_steps for select to authenticated
using(exists(select 1 from public.task_submissions s where s.id=submission_id and s.organization_id=(select private.current_org_id())));
create policy submission_reviews_select on public.submission_reviews for select to authenticated
using(organization_id=(select private.current_org_id()));

create policy evidence_read on storage.objects for select to authenticated
using(bucket_id='task-evidence' and exists(select 1 from public.submission_files f where f.storage_path=name and f.organization_id=(select private.current_org_id())));
create policy evidence_upload on storage.objects for insert to authenticated
with check(bucket_id='task-evidence' and (storage.foldername(name))[1]=(select private.current_org_id())::text and (storage.foldername(name))[2]=(select auth.uid())::text);
create policy evidence_delete_own on storage.objects for delete to authenticated
using(bucket_id='task-evidence' and owner_id=auth.uid()::text);

notify pgrst, 'reload schema';
