-- PHASE 1 COMPLETE DATABASE: run once in Supabase SQL Editor
create extension if not exists pgcrypto;

create type public.app_role as enum ('employee','reviewer','team_lead','admin');
create type public.task_status as enum ('not_started','in_progress','blocked');
create type public.task_priority as enum ('low','normal','high','critical');

create table public.organizations (
 id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now()
);
create table public.teams (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null, description text, created_at timestamptz not null default now(), unique(organization_id,name)
);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 email text not null, full_name text not null, job_title text, role public.app_role not null default 'employee',
 team_id uuid references public.teams(id) on delete set null,
 manager_id uuid references public.profiles(id) on delete set null,
 is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint not_own_manager check(manager_id is null or manager_id <> id)
);
alter table public.teams add column team_lead_id uuid references public.profiles(id) on delete set null;
create table public.tasks (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 team_id uuid references public.teams(id) on delete set null, title text not null, description text not null,
 expected_output text, required_evidence text, priority public.task_priority not null default 'normal',
 status public.task_status not null default 'not_started', created_by uuid not null references public.profiles(id),
 assigned_to uuid not null references public.profiles(id), current_reviewer_id uuid references public.profiles(id),
 start_date date not null default current_date, due_date timestamptz not null, blocker_reason text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.activity_logs (
 id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id) on delete cascade,
 actor_id uuid references public.profiles(id), action text not null, entity_type text not null, entity_id uuid,
 details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index profiles_org_idx on public.profiles(organization_id);
create index profiles_manager_idx on public.profiles(manager_id);
create index profiles_team_idx on public.profiles(team_id);
create index tasks_org_idx on public.tasks(organization_id);
create index tasks_assignee_idx on public.tasks(assigned_to);
create index tasks_creator_idx on public.tasks(created_by);
create index tasks_team_idx on public.tasks(team_id);
create index tasks_due_idx on public.tasks(due_date);

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.current_profile() returns public.profiles language sql stable security definer set search_path=public as $$
 select * from public.profiles where id=(select auth.uid()) limit 1
$$;
create or replace function private.current_org_id() returns uuid language sql stable security definer set search_path=public as $$
 select organization_id from public.profiles where id=(select auth.uid())
$$;
create or replace function private.current_role() returns public.app_role language sql stable security definer set search_path=public as $$
 select role from public.profiles where id=(select auth.uid())
$$;
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path=public as $$
 select coalesce((select role='admin' from public.profiles where id=(select auth.uid())),false)
$$;
create or replace function private.can_manage_assignee(p_assignee uuid) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce((select role='admin' or (role='team_lead' and team_id=(select team_id from public.profiles where id=p_assignee)) from public.profiles where id=(select auth.uid())),false)
$$;

create or replace function public.bootstrap_first_admin(p_org_name text,p_full_name text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_user auth.users; v_org uuid;
begin
 select * into v_user from auth.users where id=auth.uid(); if v_user.id is null then raise exception 'Authentication required'; end if;
 if exists(select 1 from public.profiles) then raise exception 'Company already initialized'; end if;
 insert into public.organizations(name) values(trim(p_org_name)) returning id into v_org;
 insert into public.profiles(id,organization_id,email,full_name,role) values(v_user.id,v_org,v_user.email,trim(p_full_name),'admin');
 return v_org;
end $$;
grant execute on function public.bootstrap_first_admin(text,text) to authenticated;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.raw_user_meta_data ? 'organization_id' then
  insert into public.profiles(id,organization_id,email,full_name,job_title,role,team_id,manager_id)
  values(new.id,(new.raw_user_meta_data->>'organization_id')::uuid,new.email,coalesce(new.raw_user_meta_data->>'full_name',new.email),nullif(new.raw_user_meta_data->>'job_title',''),coalesce((new.raw_user_meta_data->>'role')::public.app_role,'employee'),nullif(new.raw_user_meta_data->>'team_id','')::uuid,nullif(new.raw_user_meta_data->>'manager_id','')::uuid)
  on conflict(id) do nothing;
 end if; return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.log_task_activity() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.activity_logs(organization_id,actor_id,action,entity_type,entity_id,details)
 values(new.organization_id,auth.uid(),case when tg_op='INSERT' then 'TASK_CREATED' when old.status is distinct from new.status then 'TASK_STATUS_CHANGED' else 'TASK_UPDATED' end,'task',new.id,jsonb_build_object('status',new.status,'title',new.title)); return new;
end $$;
create trigger tasks_activity after insert or update on public.tasks for each row execute procedure public.log_task_activity();


create or replace function public.enforce_task_update_scope() returns trigger language plpgsql security definer set search_path=public as $$
declare v_role public.app_role;
begin
 select role into v_role from public.profiles where id=auth.uid();
 if v_role in ('employee','reviewer') then
  if old.assigned_to <> auth.uid() then raise exception 'You may update only your assigned tasks'; end if;
  if new.title is distinct from old.title or new.description is distinct from old.description or
     new.assigned_to is distinct from old.assigned_to or new.created_by is distinct from old.created_by or
     new.organization_id is distinct from old.organization_id or new.team_id is distinct from old.team_id or
     new.priority is distinct from old.priority or new.due_date is distinct from old.due_date or
     new.expected_output is distinct from old.expected_output or new.required_evidence is distinct from old.required_evidence then
    raise exception 'Employees may update only status and blocker information';
  end if;
 end if;
 return new;
end $$;
create trigger enforce_task_update_scope before update on public.tasks for each row execute procedure public.enforce_task_update_scope();

alter table public.organizations enable row level security;
alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.activity_logs enable row level security;

create policy org_select on public.organizations for select to authenticated using(id=(select private.current_org_id()));
create policy org_admin_update on public.organizations for update to authenticated using((select private.is_admin())) with check((select private.is_admin()));

create policy teams_select on public.teams for select to authenticated using(organization_id=(select private.current_org_id()));
create policy teams_admin_insert on public.teams for insert to authenticated with check((select private.is_admin()) and organization_id=(select private.current_org_id()));
create policy teams_admin_update on public.teams for update to authenticated using((select private.is_admin()) and organization_id=(select private.current_org_id())) with check((select private.is_admin()) and organization_id=(select private.current_org_id()));
create policy teams_admin_delete on public.teams for delete to authenticated using((select private.is_admin()) and organization_id=(select private.current_org_id()));

create policy profiles_select on public.profiles for select to authenticated using(organization_id=(select private.current_org_id()));
create policy profiles_admin_insert on public.profiles for insert to authenticated with check((select private.is_admin()) and organization_id=(select private.current_org_id()));
create policy profiles_admin_update on public.profiles for update to authenticated using((select private.is_admin()) and organization_id=(select private.current_org_id())) with check((select private.is_admin()) and organization_id=(select private.current_org_id()));

create policy tasks_select on public.tasks for select to authenticated using(
 organization_id=(select private.current_org_id()) and (
  assigned_to=(select auth.uid()) or created_by=(select auth.uid()) or current_reviewer_id=(select auth.uid()) or
  (select private.is_admin()) or (select private.can_manage_assignee(assigned_to))
 )
);
create policy tasks_insert on public.tasks for insert to authenticated with check(
 organization_id=(select private.current_org_id()) and created_by=(select auth.uid()) and (select private.can_manage_assignee(assigned_to))
);
create policy tasks_assignee_update on public.tasks for update to authenticated using(
 organization_id=(select private.current_org_id()) and (assigned_to=(select auth.uid()) or (select private.can_manage_assignee(assigned_to)))
) with check(organization_id=(select private.current_org_id()));

create policy activity_select on public.activity_logs for select to authenticated using(
 organization_id=(select private.current_org_id()) and ((select private.is_admin()) or actor_id=(select auth.uid()))
);

revoke delete on public.activity_logs from authenticated;
