-- WorkFlow Phase 4: Complete team management
-- Run once in Supabase SQL Editor after your Phase 1–3 migrations.
-- Safe to rerun.

begin;

alter table public.teams
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists teams_org_active_idx
  on public.teams(organization_id, is_active, name);

create index if not exists profiles_org_team_active_idx
  on public.profiles(organization_id, team_id, is_active);

create or replace function public.current_user_can_manage_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists(
    select 1
    from public.profiles me
    join public.teams t
      on t.id = p_team_id
     and t.organization_id = me.organization_id
    where me.id = auth.uid()
      and me.is_active
      and (
        me.role::text = 'admin'
        or (
          me.role::text = 'team_lead'
          and (
            me.team_id = t.id
            or t.team_lead_id = me.id
          )
        )
      )
  ), false)
$$;

grant execute on function public.current_user_can_manage_team(uuid)
to authenticated;

create or replace function public.create_team_with_members(
  p_name text,
  p_description text default null,
  p_team_lead_id uuid default null,
  p_member_ids uuid[] default '{}'::uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me public.profiles;
  v_team_id uuid;
  v_member uuid;
begin
  select * into v_me
  from public.profiles
  where id = auth.uid();

  if v_me.id is null or v_me.role::text <> 'admin' then
    raise exception 'Only an admin can create teams';
  end if;

  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Team name must contain at least 2 characters';
  end if;

  if p_team_lead_id is not null and not exists(
    select 1
    from public.profiles
    where id = p_team_lead_id
      and organization_id = v_me.organization_id
      and is_active
      and role::text in ('team_lead','admin')
  ) then
    raise exception 'Selected team lead is not eligible';
  end if;

  insert into public.teams(
    organization_id,
    name,
    description,
    team_lead_id,
    is_active,
    updated_at
  )
  values(
    v_me.organization_id,
    trim(p_name),
    nullif(trim(coalesce(p_description, '')), ''),
    p_team_lead_id,
    true,
    now()
  )
  returning id into v_team_id;

  if p_team_lead_id is not null then
    update public.profiles
    set team_id = v_team_id,
        manager_id = null,
        role = case
          when role::text = 'admin' then role
          else 'team_lead'::public.app_role
        end,
        updated_at = now()
    where id = p_team_lead_id
      and organization_id = v_me.organization_id;
  end if;

  foreach v_member in array coalesce(p_member_ids, '{}'::uuid[])
  loop
    if v_member = p_team_lead_id then
      continue;
    end if;

    update public.profiles
    set team_id = v_team_id,
        manager_id = p_team_lead_id,
        updated_at = now()
    where id = v_member
      and organization_id = v_me.organization_id
      and is_active
      and role::text in ('employee','reviewer');
  end loop;

  insert into public.activity_logs(
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    details
  )
  values(
    v_me.organization_id,
    auth.uid(),
    'TEAM_CREATED',
    'team',
    v_team_id,
    jsonb_build_object(
      'name', trim(p_name),
      'lead_id', p_team_lead_id,
      'member_count', cardinality(coalesce(p_member_ids, '{}'::uuid[]))
    )
  );

  return v_team_id;
end;
$$;

grant execute on function public.create_team_with_members(text,text,uuid,uuid[])
to authenticated;

create or replace function public.update_team_details(
  p_team_id uuid,
  p_name text,
  p_description text default null,
  p_team_lead_id uuid default null,
  p_is_active boolean default true
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me public.profiles;
  v_old_lead uuid;
begin
  select * into v_me
  from public.profiles
  where id = auth.uid();

  if v_me.id is null or v_me.role::text <> 'admin' then
    raise exception 'Only an admin can edit team details';
  end if;

  if not exists(
    select 1 from public.teams
    where id = p_team_id
      and organization_id = v_me.organization_id
  ) then
    raise exception 'Team not found';
  end if;

  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'Team name must contain at least 2 characters';
  end if;

  if p_team_lead_id is not null and not exists(
    select 1
    from public.profiles
    where id = p_team_lead_id
      and organization_id = v_me.organization_id
      and is_active
      and role::text in ('team_lead','admin')
  ) then
    raise exception 'Selected team lead is not eligible';
  end if;

  select team_lead_id into v_old_lead
  from public.teams
  where id = p_team_id;

  update public.teams
  set name = trim(p_name),
      description = nullif(trim(coalesce(p_description, '')), ''),
      team_lead_id = p_team_lead_id,
      is_active = p_is_active,
      updated_at = now()
  where id = p_team_id
    and organization_id = v_me.organization_id;

  if v_old_lead is distinct from p_team_lead_id then
    update public.profiles
    set manager_id = p_team_lead_id,
        updated_at = now()
    where team_id = p_team_id
      and organization_id = v_me.organization_id
      and id <> coalesce(p_team_lead_id, gen_random_uuid());

    if p_team_lead_id is not null then
      update public.profiles
      set team_id = p_team_id,
          manager_id = null,
          role = case
            when role::text = 'admin' then role
            else 'team_lead'::public.app_role
          end,
          updated_at = now()
      where id = p_team_lead_id
        and organization_id = v_me.organization_id;
    end if;
  end if;

  insert into public.activity_logs(
    organization_id, actor_id, action, entity_type, entity_id, details
  )
  values(
    v_me.organization_id,
    auth.uid(),
    'TEAM_UPDATED',
    'team',
    p_team_id,
    jsonb_build_object(
      'name', trim(p_name),
      'lead_id', p_team_lead_id,
      'is_active', p_is_active
    )
  );
end;
$$;

grant execute on function public.update_team_details(uuid,text,text,uuid,boolean)
to authenticated;

create or replace function public.save_team_members(
  p_team_id uuid,
  p_member_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me public.profiles;
  v_team public.teams;
  v_member uuid;
begin
  select * into v_me
  from public.profiles
  where id = auth.uid();

  select * into v_team
  from public.teams
  where id = p_team_id
    and organization_id = v_me.organization_id;

  if v_team.id is null then
    raise exception 'Team not found';
  end if;

  if not public.current_user_can_manage_team(p_team_id) then
    raise exception 'You cannot manage this team';
  end if;

  -- Remove current employee/reviewer members not selected.
  update public.profiles
  set team_id = null,
      manager_id = null,
      updated_at = now()
  where organization_id = v_me.organization_id
    and team_id = p_team_id
    and role::text in ('employee','reviewer')
    and not (id = any(coalesce(p_member_ids, '{}'::uuid[])));

  foreach v_member in array coalesce(p_member_ids, '{}'::uuid[])
  loop
    if v_member = v_team.team_lead_id then
      continue;
    end if;

    update public.profiles
    set team_id = p_team_id,
        manager_id = v_team.team_lead_id,
        updated_at = now()
    where id = v_member
      and organization_id = v_me.organization_id
      and is_active
      and role::text in ('employee','reviewer');
  end loop;

  update public.teams
  set updated_at = now()
  where id = p_team_id;

  insert into public.activity_logs(
    organization_id, actor_id, action, entity_type, entity_id, details
  )
  values(
    v_me.organization_id,
    auth.uid(),
    'TEAM_MEMBERS_UPDATED',
    'team',
    p_team_id,
    jsonb_build_object(
      'member_count', cardinality(coalesce(p_member_ids, '{}'::uuid[]))
    )
  );
end;
$$;

grant execute on function public.save_team_members(uuid,uuid[])
to authenticated;

-- Replace team policies with policies matching the new permissions.
do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'teams'
  loop
    execute format('drop policy if exists %I on public.teams', p.policyname);
  end loop;
end $$;

create policy teams_select_same_org
on public.teams
for select
to authenticated
using(
  organization_id = public.current_user_organization_id()
);

create policy teams_admin_insert
on public.teams
for insert
to authenticated
with check(
  organization_id = public.current_user_organization_id()
  and public.current_user_role_text() = 'admin'
);

create policy teams_admin_update
on public.teams
for update
to authenticated
using(
  organization_id = public.current_user_organization_id()
  and public.current_user_role_text() = 'admin'
)
with check(
  organization_id = public.current_user_organization_id()
  and public.current_user_role_text() = 'admin'
);

create policy teams_admin_delete
on public.teams
for delete
to authenticated
using(
  organization_id = public.current_user_organization_id()
  and public.current_user_role_text() = 'admin'
);

notify pgrst, 'reload schema';

commit;
