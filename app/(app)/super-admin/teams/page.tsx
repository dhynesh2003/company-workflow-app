import Link from "next/link";

import {
  Clock3,
  ShieldCheck,
  UsersRound,
  UserX,
} from "lucide-react";

import { requireRole } from "@/lib/auth";

type SearchParams = {
  range?: string;
};

type TeamRow = {
  id: string;
  name: string;
};

type ProfileRow = {
  id: string;
  full_name: string;
  role: string;
  team_id: string | null;
  is_active: boolean;
};

type LogRow = {
  employee_id: string;
  work_date: string;
  total_minutes: number | null;
};

function formatMinutes(minutes: number) {
  const safe = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;

  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;

  return `${hours}h ${mins}m`;
}

function getDateRange(range?: string) {
  const today = new Date().toISOString().slice(0, 10);

  if (range === "today") {
    return {
      range: "today",
      from: today,
      to: today,
      today,
    };
  }

  if (range === "month") {
    return {
      range: "month",
      from: `${today.slice(0, 7)}-01`,
      to: today,
      today,
    };
  }

  const weekStart = new Date(`${today}T00:00:00.000Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);

  return {
    range: "week",
    from: weekStart.toISOString().slice(0, 10),
    to: today,
    today,
  };
}

export default async function SuperAdminTeamsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { supabase, profile } = await requireRole([
    "super_admin",
  ]);

  const { range, from, to, today } = getDateRange(
    params.range
  );

  const [
    teamsResult,
    peopleResult,
    logsResult,
    todayLogsResult,
  ] = await Promise.all([
    supabase
      .from("teams")
      .select("id,name")
      .eq("organization_id", profile.organization_id)
      .order("name"),

    supabase
      .from("profiles")
      .select(`
        id,
        full_name,
        role,
        team_id,
        is_active
      `)
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true),

    supabase
      .from("daily_logs")
      .select(`
        employee_id,
        work_date,
        total_minutes
      `)
      .eq("organization_id", profile.organization_id)
      .gte("work_date", from)
      .lte("work_date", to),

    supabase
      .from("daily_logs")
      .select("employee_id")
      .eq("organization_id", profile.organization_id)
      .eq("work_date", today),
  ]);

  const queryError =
    teamsResult.error ||
    peopleResult.error ||
    logsResult.error ||
    todayLogsResult.error;

  if (queryError) {
    throw new Error(queryError.message);
  }

  const teams = (teamsResult.data ?? []) as TeamRow[];
  const people = (peopleResult.data ?? []) as ProfileRow[];
  const logs = (logsResult.data ?? []) as LogRow[];

  const todayLoggedIds = new Set(
    (todayLogsResult.data ?? []).map(
      (row) => row.employee_id
    )
  );

  const teamSummaries = teams.map((team) => {
    const members = people.filter(
      (person) =>
        person.team_id === team.id &&
        person.role !== "super_admin"
    );

    const memberIds = new Set(
      members.map((member) => member.id)
    );

    const teamLogs = logs.filter((log) =>
      memberIds.has(log.employee_id)
    );

    const totalMinutes = teamLogs.reduce(
      (sum, log) => sum + (log.total_minutes ?? 0),
      0
    );

    const loggedPeople = new Set(
      teamLogs.map((log) => log.employee_id)
    ).size;

    const missingToday = members.filter(
      (member) => !todayLoggedIds.has(member.id)
    ).length;

    const leads = members.filter(
      (member) => member.role === "team_lead"
    );

    return {
      team,
      members,
      totalMinutes,
      loggedPeople,
      missingToday,
      leads,
    };
  });

  const unassignedMembers = people.filter(
    (person) =>
      !person.team_id &&
      person.role !== "super_admin"
  );

  return (
    <div className="grid super-admin-teams-page">
      <div className="page-head">
        <div>
          <h1>Teams Overview</h1>
          <p>
            Compare team headcount, work hours and daily log coverage.
          </p>
        </div>
      </div>

      <section className="super-admin-range-tabs">
        <Link
          href="/super-admin/teams?range=today"
          className={range === "today" ? "active" : ""}
        >
          Today
        </Link>

        <Link
          href="/super-admin/teams?range=week"
          className={range === "week" ? "active" : ""}
        >
          Last 7 days
        </Link>

        <Link
          href="/super-admin/teams?range=month"
          className={range === "month" ? "active" : ""}
        >
          This month
        </Link>
      </section>

      <div className="super-admin-period-label">
        {from} to {to}
      </div>

      <section className="super-admin-team-grid">
        {teamSummaries.map(
          ({
            team,
            members,
            totalMinutes,
            loggedPeople,
            missingToday,
            leads,
          }) => (
            <article
              key={team.id}
              className="card super-admin-team-card"
            >
              <div className="super-admin-team-card-head">
                <div>
                  <span className="eyebrow">Team</span>
                  <h2>{team.name}</h2>
                </div>

                <div className="super-admin-team-icon">
                  <UsersRound size={23} />
                </div>
              </div>

              <div className="super-admin-team-lead">
                <ShieldCheck size={17} />
                <span>
                  {leads.length > 0
                    ? leads.map((lead) => lead.full_name).join(", ")
                    : "No team lead assigned"}
                </span>
              </div>

              <div className="super-admin-team-metrics">
                <div>
                  <span>Members</span>
                  <strong>{members.length}</strong>
                </div>

                <div>
                  <span>Hours</span>
                  <strong>{formatMinutes(totalMinutes)}</strong>
                </div>

                <div>
                  <span>Logged</span>
                  <strong>
                    {loggedPeople}/{members.length}
                  </strong>
                </div>

                <div>
                  <span>Missing today</span>
                  <strong
                    className={
                      missingToday > 0
                        ? "super-admin-danger-text"
                        : ""
                    }
                  >
                    {missingToday}
                  </strong>
                </div>
              </div>

              <div className="super-admin-team-card-footer">
                <div className="super-admin-team-mini-meta">
                  <Clock3 size={15} />
                  {formatMinutes(totalMinutes)} recorded
                </div>

                <Link
                  className="btn secondary"
                  href={`/super-admin/dashboard?range=${range}&team=${team.id}`}
                >
                  View team work
                </Link>
              </div>
            </article>
          )
        )}

        {teamSummaries.length === 0 && (
          <div className="card empty">
            No teams are configured yet.
          </div>
        )}
      </section>

      {unassignedMembers.length > 0 && (
        <section className="card super-admin-unassigned-card">
          <div className="section-heading">
            <div>
              <h2>People without a team</h2>
              <p className="muted">
                These active users are not currently assigned to any team.
              </p>
            </div>

            <UserX size={22} />
          </div>

          <div className="super-admin-unassigned-list">
            {unassignedMembers.map((person) => (
              <div
                key={person.id}
                className="super-admin-unassigned-person"
              >
                <strong>{person.full_name}</strong>
                <span>{person.role.replaceAll("_", " ")}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
