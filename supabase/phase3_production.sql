-- PHASE 3 FINAL PRODUCTION MIGRATION
-- Run after phase1.sql, phase1b_daily_logs.sql and phase2_reviews.sql.
-- Safe to rerun.

begin;

alter table public.tasks add column if not exists completed_at timestamptz;
alter table public.submission_approval_steps add column if not exists review_due_at timestamptz;
alter table public.daily_logs add column if not exists review_comment text;
alter table public.daily_logs add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
alter table public.daily_logs add column if not exists reviewed_at timestamptz;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  notification_type text not null,
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  href text,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx on public.notifications(recipient_id,is_read,created_at desc);
create index if not exists notifications_org_idx on public.notifications(organization_id,created_at desc);
create index if not exists activity_logs_created_idx on public.activity_logs(created_at desc);
create index if not exists approval_steps_due_idx on public.submission_approval_steps(review_due_at,status);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated
using(recipient_id=auth.uid() and organization_id=(select private.current_org_id()));

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
using(recipient_id=auth.uid()) with check(recipient_id=auth.uid());

drop policy if exists notifications_insert_system on public.notifications;
create policy notifications_insert_system on public.notifications for insert to authenticated
with check(organization_id=(select private.current_org_id()));

-- Admins can read their company audit trail.
drop policy if exists activity_logs_admin_select on public.activity_logs;
create policy activity_logs_admin_select on public.activity_logs for select to authenticated
using(organization_id=(select private.current_org_id()) and (select private.is_admin()));

create or replace function public.push_notification(
  p_recipient uuid,
  p_type text,
  p_title text,
  p_message text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_href text default null,
  p_actor uuid default auth.uid()
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_id uuid;
begin
  select organization_id into v_org from public.profiles where id=p_recipient;
  if v_org is null then return null; end if;
  insert into public.notifications(organization_id,recipient_id,actor_id,notification_type,title,message,entity_type,entity_id,href)
  values(v_org,p_recipient,p_actor,p_type,p_title,p_message,p_entity_type,p_entity_id,p_href)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.push_notification(uuid,text,text,text,text,uuid,text,uuid) to authenticated;

create or replace function public.notify_task_assignment() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    perform public.push_notification(new.assigned_to,'TASK_ASSIGNED','New task assigned',new.title,'task',new.id,'/tasks/'||new.id::text,new.created_by);
  elsif old.assigned_to is distinct from new.assigned_to then
    perform public.push_notification(new.assigned_to,'TASK_ASSIGNED','Task reassigned',new.title,'task',new.id,'/tasks/'||new.id::text,auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists notify_task_assignment_trigger on public.tasks;
create trigger notify_task_assignment_trigger after insert or update of assigned_to on public.tasks
for each row execute function public.notify_task_assignment();

create or replace function public.notify_submission_created() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_task public.tasks; v_reviewer uuid;
begin
  select * into v_task from public.tasks where id=new.task_id;
  select reviewer_id into v_reviewer from public.submission_approval_steps where submission_id=new.id and status='pending' order by step_order limit 1;
  if v_reviewer is not null then
    perform public.push_notification(v_reviewer,'WORK_SUBMITTED','Work waiting for review',v_task.title,'submission',new.id,'/reviews/'||new.id::text,new.submitted_by);
  end if;
  return new;
end $$;
drop trigger if exists notify_submission_created_trigger on public.task_submissions;
create trigger notify_submission_created_trigger after insert on public.task_submissions
for each row execute function public.notify_submission_created();

create or replace function public.notify_review_recorded() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_submission public.task_submissions; v_task public.tasks; v_next uuid;
begin
  select * into v_submission from public.task_submissions where id=new.submission_id;
  select * into v_task from public.tasks where id=v_submission.task_id;
  if new.decision::text='changes_requested' then
    perform public.push_notification(v_submission.submitted_by,'CHANGES_REQUESTED','Changes requested',v_task.title,'task',v_task.id,'/tasks/'||v_task.id::text,new.reviewer_id);
  elsif new.decision::text='rejected' then
    perform public.push_notification(v_submission.submitted_by,'SUBMISSION_REJECTED','Submission rejected',v_task.title,'task',v_task.id,'/tasks/'||v_task.id::text,new.reviewer_id);
  elsif new.decision::text='approved' then
    select reviewer_id into v_next from public.submission_approval_steps where submission_id=new.submission_id and status='pending' order by step_order limit 1;
    if v_next is not null then
      perform public.push_notification(v_next,'WORK_SUBMITTED','Approval step waiting',v_task.title,'submission',new.submission_id,'/reviews/'||new.submission_id::text,new.reviewer_id);
    elsif exists(select 1 from public.task_submissions where id=new.submission_id and status='approved') then
      perform public.push_notification(v_submission.submitted_by,'TASK_COMPLETED','Task approved and completed',v_task.title,'task',v_task.id,'/tasks/'||v_task.id::text,new.reviewer_id);
      if v_task.created_by<>v_submission.submitted_by then
        perform public.push_notification(v_task.created_by,'TASK_COMPLETED','Task completed',v_task.title,'task',v_task.id,'/tasks/'||v_task.id::text,new.reviewer_id);
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists notify_review_recorded_trigger on public.submission_reviews;
create trigger notify_review_recorded_trigger after insert on public.submission_reviews
for each row execute function public.notify_review_recorded();

create or replace function public.notify_daily_log_status() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_employee public.profiles; v_recipient uuid;
begin
  select * into v_employee from public.profiles where id=new.employee_id;
  if new.status::text='submitted' and old.status::text is distinct from 'submitted' then
    v_recipient:=v_employee.manager_id;
    if v_recipient is null then select team_lead_id into v_recipient from public.teams where id=v_employee.team_id; end if;
    if v_recipient is not null then
      perform public.push_notification(v_recipient,'DAILY_LOG_SUBMITTED','Daily log submitted',v_employee.full_name||' submitted '||new.work_date::text,'daily_log',new.id,'/admin/daily-logs?date='||new.work_date::text,new.employee_id);
    end if;
  elsif new.status::text='changes_requested' and old.status is distinct from new.status then
    perform public.push_notification(new.employee_id,'DAILY_LOG_CHANGES','Daily log correction requested',coalesce(new.review_comment,'Please correct and resubmit your daily log.'),'daily_log',new.id,'/daily-log/new?date='||new.work_date::text,new.reviewed_by);
  elsif new.status::text='checked' and old.status is distinct from new.status then
    perform public.push_notification(new.employee_id,'DAILY_LOG_CHECKED','Daily log checked',new.work_date::text,'daily_log',new.id,'/my-timesheet',new.reviewed_by);
  end if;
  return new;
end $$;
drop trigger if exists notify_daily_log_status_trigger on public.daily_logs;
create trigger notify_daily_log_status_trigger after update of status on public.daily_logs
for each row execute function public.notify_daily_log_status();

-- Mark old pending reviews due in 24 hours when no deadline exists.
update public.submission_approval_steps
set review_due_at=coalesce(review_due_at,created_at+interval '24 hours')
where status='pending' and review_due_at is null;

notify pgrst,'reload schema';
commit;

select
 to_regclass('public.notifications') is not null as notifications_exists,
 to_regprocedure('public.push_notification(uuid,text,text,text,text,uuid,text,uuid)') is not null as notification_function_exists;

-- ---------------------------------------------------------------------------
-- Consolidated Phase 2/3 RLS repairs
-- ---------------------------------------------------------------------------
begin;

create or replace function public.current_user_organization_id() returns uuid
language sql stable security definer set search_path=public as $$
 select organization_id from public.profiles where id=auth.uid() limit 1
$$;
create or replace function public.current_user_role_text() returns text
language sql stable security definer set search_path=public as $$
 select role::text from public.profiles where id=auth.uid() limit 1
$$;
create or replace function public.current_user_team_id() returns uuid
language sql stable security definer set search_path=public as $$
 select team_id from public.profiles where id=auth.uid() limit 1
$$;
create or replace function public.current_user_is_admin() returns boolean
language sql stable security definer set search_path=public as $$
 select coalesce((select role::text='admin' from public.profiles where id=auth.uid()),false)
$$;

grant execute on function public.current_user_organization_id() to authenticated;
grant execute on function public.current_user_role_text() to authenticated;
grant execute on function public.current_user_team_id() to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;

-- Profiles visibility without recursive self-joins.
do $$ declare p record; begin
 for p in select policyname from pg_policies where schemaname='public' and tablename='profiles' and cmd='SELECT'
 loop execute format('drop policy if exists %I on public.profiles',p.policyname); end loop;
end $$;
create policy profiles_select_permitted on public.profiles for select to authenticated using(
 id=auth.uid() or (
  organization_id=public.current_user_organization_id() and (
   public.current_user_role_text()='admin' or
   (public.current_user_role_text()='team_lead' and team_id=public.current_user_team_id()) or
   (public.current_user_role_text()='reviewer' and manager_id=auth.uid())
  )
 )
);

create or replace function public.can_manage_daily_log(p_daily_log_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.daily_logs dl where dl.id=p_daily_log_id and dl.employee_id=auth.uid() and dl.status::text in ('draft','changes_requested'))
$$;
create or replace function public.can_view_daily_log(p_daily_log_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(
  select 1 from public.daily_logs dl
  join public.profiles employee on employee.id=dl.employee_id
  left join public.profiles viewer on viewer.id=auth.uid()
  where dl.id=p_daily_log_id and (
   dl.employee_id=auth.uid() or viewer.role::text='admin' or
   (viewer.role::text='team_lead' and viewer.team_id=employee.team_id) or
   (viewer.role::text='reviewer' and employee.manager_id=auth.uid())
  )
 )
$$;
grant execute on function public.can_manage_daily_log(uuid) to authenticated;
grant execute on function public.can_view_daily_log(uuid) to authenticated;
do $$ declare p record; begin
 for p in select policyname from pg_policies where schemaname='public' and tablename='daily_log_items'
 loop execute format('drop policy if exists %I on public.daily_log_items',p.policyname); end loop;
end $$;
create policy daily_items_select on public.daily_log_items for select to authenticated using(public.can_view_daily_log(daily_log_id));
create policy daily_items_insert on public.daily_log_items for insert to authenticated with check(public.can_manage_daily_log(daily_log_id));
create policy daily_items_update on public.daily_log_items for update to authenticated using(public.can_manage_daily_log(daily_log_id)) with check(public.can_manage_daily_log(daily_log_id));
create policy daily_items_delete on public.daily_log_items for delete to authenticated using(public.can_manage_daily_log(daily_log_id));

create or replace function public.can_view_task_submission(p_submission_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(
  select 1 from public.task_submissions s join public.tasks t on t.id=s.task_id
  left join public.submission_approval_steps sas on sas.submission_id=s.id
  where s.id=p_submission_id and (
   t.assigned_to=auth.uid() or t.created_by=auth.uid() or sas.reviewer_id=auth.uid() or
   public.current_user_is_admin() or (public.current_user_role_text()='team_lead' and t.team_id=public.current_user_team_id())
  )
 )
$$;
create or replace function public.can_view_submission_step(p_step_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(
  select 1 from public.submission_approval_steps sas join public.task_submissions s on s.id=sas.submission_id join public.tasks t on t.id=s.task_id
  where sas.id=p_step_id and (
   sas.reviewer_id=auth.uid() or t.assigned_to=auth.uid() or t.created_by=auth.uid() or
   public.current_user_is_admin() or (public.current_user_role_text()='team_lead' and t.team_id=public.current_user_team_id())
  )
 )
$$;
grant execute on function public.can_view_task_submission(uuid) to authenticated;
grant execute on function public.can_view_submission_step(uuid) to authenticated;
do $$ declare p record; begin
 for p in select policyname,tablename from pg_policies where schemaname='public' and tablename in ('task_submissions','submission_approval_steps')
 loop execute format('drop policy if exists %I on public.%I',p.policyname,p.tablename); end loop;
end $$;
create policy task_submissions_select_permitted on public.task_submissions for select to authenticated using(public.can_view_task_submission(id));
create policy task_submissions_insert_own on public.task_submissions for insert to authenticated with check(submitted_by=auth.uid());
create policy submission_steps_select_permitted on public.submission_approval_steps for select to authenticated using(public.can_view_submission_step(id));
create policy submission_steps_update_reviewer on public.submission_approval_steps for update to authenticated using(reviewer_id=auth.uid() or public.current_user_is_admin()) with check(reviewer_id=auth.uid() or public.current_user_is_admin());

-- Notify only after a pending approval step exists.
drop trigger if exists notify_submission_created_trigger on public.task_submissions;
create or replace function public.notify_pending_approval_step() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_submission public.task_submissions; v_task public.tasks;
begin
 if new.status::text='pending' then
  select * into v_submission from public.task_submissions where id=new.submission_id;
  select * into v_task from public.tasks where id=v_submission.task_id;
  perform public.push_notification(new.reviewer_id,'WORK_SUBMITTED','Work waiting for review',v_task.title,'submission',new.submission_id,'/reviews/'||new.submission_id::text,v_submission.submitted_by);
  if new.review_due_at is null then new.review_due_at:=now()+interval '24 hours'; end if;
 end if;
 return new;
end $$;
drop trigger if exists notify_pending_approval_step_trigger on public.submission_approval_steps;
create trigger notify_pending_approval_step_trigger before insert or update of status on public.submission_approval_steps
for each row execute function public.notify_pending_approval_step();

notify pgrst,'reload schema';
commit;

-- Reliable result notifications after the task status itself changes.
begin;
drop trigger if exists notify_review_recorded_trigger on public.submission_reviews;
create or replace function public.notify_task_status_result() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if old.status is distinct from new.status then
  if new.status::text='changes_requested' then
   perform public.push_notification(new.assigned_to,'CHANGES_REQUESTED','Changes requested',new.title,'task',new.id,'/tasks/'||new.id::text,auth.uid());
  elsif new.status::text='rejected' then
   perform public.push_notification(new.assigned_to,'SUBMISSION_REJECTED','Submission rejected',new.title,'task',new.id,'/tasks/'||new.id::text,auth.uid());
  elsif new.status::text='completed' then
   perform public.push_notification(new.assigned_to,'TASK_COMPLETED','Task approved and completed',new.title,'task',new.id,'/tasks/'||new.id::text,auth.uid());
   if new.created_by<>new.assigned_to then perform public.push_notification(new.created_by,'TASK_COMPLETED','Task completed',new.title,'task',new.id,'/tasks/'||new.id::text,auth.uid()); end if;
  end if;
 end if;
 return new;
end $$;
drop trigger if exists notify_task_status_result_trigger on public.tasks;
create trigger notify_task_status_result_trigger after update of status on public.tasks for each row execute function public.notify_task_status_result();
notify pgrst,'reload schema';
commit;

-- Tighten notification creation: only database triggers/security-definer code may insert.
begin;
drop policy if exists notifications_insert_system on public.notifications;
revoke execute on function public.push_notification(uuid,text,text,text,text,uuid,text,uuid) from authenticated;
notify pgrst,'reload schema';
commit;
