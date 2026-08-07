-- PHASE 1B MIGRATION: Daily work logs and spreadsheet-style timesheets
-- Run after phase1.sql. Safe to run once.

create type public.attendance_status as enum ('working','half_day','leave','holiday','week_off','permission','work_from_home');
create type public.daily_log_status as enum ('draft','submitted','checked','changes_requested');
create type public.measurement_type as enum ('time','quantity','time_and_quantity','text_only');

create table public.work_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  measurement_type public.measurement_type not null default 'time',
  default_unit text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  attendance_status public.attendance_status not null default 'working',
  status public.daily_log_status not null default 'draft',
  summary text,
  remarks text,
  total_minutes integer not null default 0 check (total_minutes >= 0),
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, work_date)
);

create table public.daily_log_items (
  id uuid primary key default gen_random_uuid(),
  daily_log_id uuid not null references public.daily_logs(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  category_id uuid not null references public.work_categories(id),
  description text not null,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  quantity numeric(12,2) check (quantity is null or quantity >= 0),
  unit text,
  completion_status text not null default 'in_progress' check (completion_status in ('in_progress','completed','blocked')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index work_categories_org_idx on public.work_categories(organization_id);
create index daily_logs_org_date_idx on public.daily_logs(organization_id, work_date);
create index daily_logs_employee_date_idx on public.daily_logs(employee_id, work_date desc);
create index daily_logs_status_idx on public.daily_logs(status);
create index daily_log_items_log_idx on public.daily_log_items(daily_log_id);
create index daily_log_items_task_idx on public.daily_log_items(task_id);

create or replace function private.can_manage_employee(p_employee uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((
    select role='admin'
      or (role='team_lead' and team_id=(select team_id from public.profiles where id=p_employee))
      or id=(select manager_id from public.profiles where id=p_employee)
    from public.profiles where id=(select auth.uid())
  ),false)
$$;

create or replace function public.recalculate_daily_log_total(p_log_id uuid)
returns void language sql security definer set search_path=public as $$
  update public.daily_logs
  set total_minutes = coalesce((select sum(duration_minutes) from public.daily_log_items where daily_log_id=p_log_id),0),
      updated_at = now()
  where id=p_log_id
$$;

create or replace function public.sync_daily_log_total()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.recalculate_daily_log_total(coalesce(new.daily_log_id, old.daily_log_id));
  return coalesce(new, old);
end $$;

create trigger daily_log_item_total_after_change
after insert or update or delete on public.daily_log_items
for each row execute procedure public.sync_daily_log_total();

create or replace function public.enforce_daily_log_update_scope()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_role public.app_role;
begin
  select role into v_role from public.profiles where id=auth.uid();
  if auth.uid() = old.employee_id and v_role in ('employee','reviewer') then
    if old.status in ('checked') then raise exception 'Checked logs cannot be edited'; end if;
    if new.employee_id is distinct from old.employee_id or new.organization_id is distinct from old.organization_id or
       new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'You cannot modify ownership or review fields';
    end if;
  end if;
  return new;
end $$;

create trigger enforce_daily_log_update_scope
before update on public.daily_logs
for each row execute procedure public.enforce_daily_log_update_scope();

create or replace function public.log_daily_activity()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.activity_logs(organization_id,actor_id,action,entity_type,entity_id,details)
  values(new.organization_id,auth.uid(),
    case when tg_op='INSERT' then 'DAILY_LOG_CREATED'
         when old.status is distinct from new.status then 'DAILY_LOG_STATUS_CHANGED'
         else 'DAILY_LOG_UPDATED' end,
    'daily_log',new.id,jsonb_build_object('work_date',new.work_date,'status',new.status,'total_minutes',new.total_minutes));
  return new;
end $$;

create trigger daily_logs_activity after insert or update on public.daily_logs
for each row execute procedure public.log_daily_activity();

alter table public.work_categories enable row level security;
alter table public.daily_logs enable row level security;
alter table public.daily_log_items enable row level security;

create policy work_categories_select on public.work_categories for select to authenticated
using(organization_id=(select private.current_org_id()));
create policy work_categories_admin_insert on public.work_categories for insert to authenticated
with check((select private.is_admin()) and organization_id=(select private.current_org_id()));
create policy work_categories_admin_update on public.work_categories for update to authenticated
using((select private.is_admin()) and organization_id=(select private.current_org_id()))
with check((select private.is_admin()) and organization_id=(select private.current_org_id()));

create policy daily_logs_select on public.daily_logs for select to authenticated
using(organization_id=(select private.current_org_id()) and (
  employee_id=(select auth.uid()) or (select private.can_manage_employee(employee_id))
));
create policy daily_logs_insert on public.daily_logs for insert to authenticated
with check(organization_id=(select private.current_org_id()) and employee_id=(select auth.uid()));
create policy daily_logs_employee_update on public.daily_logs for update to authenticated
using(organization_id=(select private.current_org_id()) and (
  employee_id=(select auth.uid()) or (select private.can_manage_employee(employee_id))
)) with check(organization_id=(select private.current_org_id()));

create policy daily_log_items_select on public.daily_log_items for select to authenticated
using(exists(select 1 from public.daily_logs l where l.id=daily_log_id and l.organization_id=(select private.current_org_id()) and (l.employee_id=(select auth.uid()) or (select private.can_manage_employee(l.employee_id)))));
create policy daily_log_items_insert on public.daily_log_items for insert to authenticated
with check(exists(select 1 from public.daily_logs l where l.id=daily_log_id and l.employee_id=(select auth.uid()) and l.status in ('draft','changes_requested')));
create policy daily_log_items_update on public.daily_log_items for update to authenticated
using(exists(select 1 from public.daily_logs l where l.id=daily_log_id and l.employee_id=(select auth.uid()) and l.status in ('draft','changes_requested')))
with check(exists(select 1 from public.daily_logs l where l.id=daily_log_id and l.employee_id=(select auth.uid()) and l.status in ('draft','changes_requested')));
create policy daily_log_items_delete on public.daily_log_items for delete to authenticated
using(exists(select 1 from public.daily_logs l where l.id=daily_log_id and l.employee_id=(select auth.uid()) and l.status in ('draft','changes_requested')));

insert into public.work_categories(organization_id,name,measurement_type,default_unit)
select o.id, x.name, x.measurement_type::public.measurement_type, x.default_unit
from public.organizations o
cross join (values
 ('Animation','time','minutes'),('Audio','time','minutes'),('PDF / SCO','time_and_quantity','files'),
 ('Quiz Upload','quantity','quizzes'),('Course Upload','time_and_quantity','items'),
 ('Video Correction','time','minutes'),('Thumbnail','time_and_quantity','images'),
 ('Documentation','time','minutes'),('Testing','time','minutes'),('Other','text_only',null)
) as x(name,measurement_type,default_unit)
on conflict (organization_id,name) do nothing;

notify pgrst, 'reload schema';
