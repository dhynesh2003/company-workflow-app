-- WorkFlow smoothness upgrade
-- Run once in Supabase SQL Editor after the earlier Phase 1-3 migrations.

create table if not exists public.task_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_activity_task_created_idx
  on public.task_activity(task_id, created_at desc);
create index if not exists task_activity_org_created_idx
  on public.task_activity(organization_id, created_at desc);

alter table public.task_activity enable row level security;

drop policy if exists "task activity visible with task" on public.task_activity;
create policy "task activity visible with task"
on public.task_activity for select
to authenticated
using (
  exists (
    select 1 from public.tasks t
    where t.id = task_activity.task_id
      and t.organization_id = task_activity.organization_id
      and (
        t.assigned_to = auth.uid()
        or t.created_by = auth.uid()
        or t.current_reviewer_id = auth.uid()
        or exists (
          select 1 from public.task_approval_steps s
          where s.task_id = t.id and s.reviewer_id = auth.uid()
        )
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid()
            and p.organization_id = t.organization_id
            and p.role in ('admin','team_lead')
            and (p.role = 'admin' or p.team_id = t.team_id)
        )
      )
  )
);

create or replace function public.log_task_activity(
  p_task_id uuid,
  p_actor_id uuid,
  p_event_type text,
  p_message text,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.tasks where id = p_task_id;
  if v_org is null then return; end if;
  insert into public.task_activity(organization_id, task_id, actor_id, event_type, message, metadata)
  values(v_org, p_task_id, p_actor_id, p_event_type, p_message, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

grant execute on function public.log_task_activity(uuid,uuid,text,text,jsonb) to authenticated;

-- Existing tasks receive one baseline activity item.
insert into public.task_activity(organization_id, task_id, actor_id, event_type, message, created_at)
select t.organization_id, t.id, t.created_by, 'task_created', 'Task created', coalesce(t.created_at, now())
from public.tasks t
where not exists (
  select 1 from public.task_activity a where a.task_id=t.id and a.event_type='task_created'
);
