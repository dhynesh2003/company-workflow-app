import type { ReactNode } from "react";

import Link from "next/link";

import {
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  FileText,
  Search,
  UsersRound,
} from "lucide-react";

import {
  requireRole,
} from "@/lib/auth";

type SuperAdminSearchParams = {
  range?: string;
  from?: string;
  to?: string;
  team?: string;
  role?: string;
  employee?: string;
  q?: string;
};

type ProfileRow = {
  id: string;
  full_name: string;
  email: string;
  job_title: string | null;
  role: string;
  team_id: string | null;
  is_active: boolean;
};

type TeamRow = {
  id: string;
  name: string;
};

type CategoryRow = {
  id: string;
  name: string;
};

type TaskRow = {
  id: string;
  title: string;
};

type DailyLogItemRow = {
  id: string;
  category_id: string | null;
  task_id: string | null;
  description: string;
  duration_minutes: number | null;
  quantity: number | null;
  unit: string | null;
  completion_status: string | null;
};

type DailyLogRow = {
  id: string;
  work_date: string;
  employee_id: string;
  attendance_status: string | null;
  status: string | null;
  total_minutes: number | null;
  summary: string | null;
  remarks: string | null;
  daily_log_items:
    | DailyLogItemRow[]
    | null;
};

function formatRole(
  role: string
) {
  return role.replaceAll("_", " ");
}

function formatMinutes(
  minutes: number
) {
  const safe = Math.max(
    0,
    Math.floor(minutes)
  );

  return `${Math.floor(
    safe / 60
  )}h ${safe % 60}m`;
}

function getDateRange(
  params: SuperAdminSearchParams
) {
  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  const range =
    params.range || "week";

  if (
    range === "custom" &&
    params.from &&
    params.to
  ) {
    return {
      range,
      from: params.from,
      to: params.to,
      today,
    };
  }

  if (range === "today") {
    return {
      range,
      from: today,
      to: today,
      today,
    };
  }

  if (range === "month") {
    return {
      range,
      from: `${today.slice(
        0,
        7
      )}-01`,
      to: today,
      today,
    };
  }

  const weekStart =
    new Date(
      `${today}T00:00:00.000Z`
    );

  weekStart.setUTCDate(
    weekStart.getUTCDate() - 6
  );

  return {
    range: "week",
    from:
      weekStart
        .toISOString()
        .slice(0, 10),
    to: today,
    today,
  };
}

export default async function SuperAdminDashboard({
  searchParams,
}: {
  searchParams:
    Promise<SuperAdminSearchParams>;
}) {
  const params =
    await searchParams;

  const {
    supabase,
    profile,
  } = await requireRole([
    "super_admin",
  ]);

  const {
    range,
    from,
    to,
    today,
  } = getDateRange(params);

  const [
    peopleResult,
    teamsResult,
    categoriesResult,
    tasksResult,
    logsResult,
    todayLogsResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(`
        id,
        full_name,
        email,
        job_title,
        role,
        team_id,
        is_active
      `)
      .eq(
        "organization_id",
        profile.organization_id
      )
      .eq("is_active", true)
      .order("full_name"),

    supabase
      .from("teams")
      .select("id,name")
      .eq(
        "organization_id",
        profile.organization_id
      )
      .order("name"),

    supabase
      .from("work_categories")
      .select("id,name")
      .eq(
        "organization_id",
        profile.organization_id
      )
      .order("name"),

    supabase
      .from("tasks")
      .select("id,title")
      .eq(
        "organization_id",
        profile.organization_id
      ),

    supabase
      .from("daily_logs")
      .select(`
        id,
        work_date,
        employee_id,
        attendance_status,
        status,
        total_minutes,
        summary,
        remarks,
        daily_log_items (
          id,
          category_id,
          task_id,
          description,
          duration_minutes,
          quantity,
          unit,
          completion_status
        )
      `)
      .eq(
        "organization_id",
        profile.organization_id
      )
      .gte("work_date", from)
      .lte("work_date", to)
      .order(
        "work_date",
        {
          ascending: false,
        }
      ),

    supabase
      .from("daily_logs")
      .select("employee_id")
      .eq(
        "organization_id",
        profile.organization_id
      )
      .eq("work_date", today),
  ]);

  const queryError =
    peopleResult.error ||
    teamsResult.error ||
    categoriesResult.error ||
    tasksResult.error ||
    logsResult.error ||
    todayLogsResult.error;

  if (queryError) {
    throw new Error(
      queryError.message
    );
  }

  const people =
    (
      peopleResult.data ??
      []
    ) as ProfileRow[];

  const teams =
    (
      teamsResult.data ??
      []
    ) as TeamRow[];

  const categories =
    (
      categoriesResult.data ??
      []
    ) as CategoryRow[];

  const tasks =
    (
      tasksResult.data ??
      []
    ) as TaskRow[];

  const logs =
    (
      logsResult.data ??
      []
    ) as unknown as DailyLogRow[];

  const todayLogEmployeeIds =
    new Set(
      (
        todayLogsResult.data ??
        []
      ).map(
        (row) =>
          row.employee_id
      )
    );

  const teamMap =
    new Map(
      teams.map(
        (team) => [
          team.id,
          team.name,
        ]
      )
    );

  const peopleMap =
    new Map(
      people.map(
        (person) => [
          person.id,
          person,
        ]
      )
    );

  const categoryMap =
    new Map(
      categories.map(
        (category) => [
          category.id,
          category.name,
        ]
      )
    );

  const taskMap =
    new Map(
      tasks.map(
        (task) => [
          task.id,
          task.title,
        ]
      )
    );

  /*
   * Super admin is an executive viewer,
   * not part of workforce productivity
   * totals.
   */
  const workforce =
    people.filter(
      (person) =>
        person.role !==
        "super_admin"
    );

  let filteredPeople =
    workforce;

  if (params.team) {
    filteredPeople =
      filteredPeople.filter(
        (person) =>
          person.team_id ===
          params.team
      );
  }

  if (params.role) {
    filteredPeople =
      filteredPeople.filter(
        (person) =>
          person.role ===
          params.role
      );
  }

  if (params.q?.trim()) {
    const query =
      params.q
        .trim()
        .toLowerCase();

    filteredPeople =
      filteredPeople.filter(
        (person) =>
          person.full_name
            .toLowerCase()
            .includes(query) ||
          person.email
            .toLowerCase()
            .includes(query) ||
          (
            person.job_title ??
            ""
          )
            .toLowerCase()
            .includes(query)
      );
  }

  if (params.employee) {
    filteredPeople =
      filteredPeople.filter(
        (person) =>
          person.id ===
          params.employee
      );
  }

  const visibleEmployeeIds =
    new Set(
      filteredPeople.map(
        (person) =>
          person.id
      )
    );

  const filteredLogs =
    logs.filter(
      (log) =>
        visibleEmployeeIds.has(
          log.employee_id
        )
    );

  const totalMinutes =
    filteredLogs.reduce(
      (sum, log) =>
        sum +
        (
          log.total_minutes ??
          0
        ),
      0
    );

  const totalEntries =
    filteredLogs.reduce(
      (sum, log) =>
        sum +
        (
          log.daily_log_items
            ?.length ??
          0
        ),
      0
    );

  const peopleWithLogs =
    new Set(
      filteredLogs.map(
        (log) =>
          log.employee_id
      )
    ).size;

  const missingToday =
    filteredPeople.filter(
      (person) =>
        !todayLogEmployeeIds.has(
          person.id
        )
    ).length;

  const employeeSummaries =
    filteredPeople.map(
      (person) => {
        const personLogs =
          filteredLogs.filter(
            (log) =>
              log.employee_id ===
              person.id
          );

        const minutes =
          personLogs.reduce(
            (sum, log) =>
              sum +
              (
                log.total_minutes ??
                0
              ),
            0
          );

        const entries =
          personLogs.reduce(
            (sum, log) =>
              sum +
              (
                log
                  .daily_log_items
                  ?.length ??
                0
              ),
            0
          );

        const latestLog =
          personLogs[0] ??
          null;

        return {
          person,
          minutes,
          entries,
          logDays:
            personLogs.length,
          latestLog,
        };
      }
    );

  const workEntries =
    filteredLogs.flatMap(
      (log) =>
        (
          log.daily_log_items ??
          []
        ).map(
          (item) => ({
            log,
            item,
            person:
              peopleMap.get(
                log.employee_id
              ) ?? null,
          })
        )
    );

  const queryParams =
    new URLSearchParams();

  queryParams.set(
    "range",
    range
  );

  if (
    range === "custom"
  ) {
    queryParams.set(
      "from",
      from
    );
    queryParams.set(
      "to",
      to
    );
  }

  if (params.team) {
    queryParams.set(
      "team",
      params.team
    );
  }

  if (params.role) {
    queryParams.set(
      "role",
      params.role
    );
  }

  if (params.q) {
    queryParams.set(
      "q",
      params.q
    );
  }

  const roles = [
    "admin",
    "team_lead",
    "reviewer",
    "employee",
  ];

  return (
    <div className="grid super-admin-page">
      <div className="page-head">
        <div>
          <h1>
            Company Overview
          </h1>

          <p>
            Read-only visibility into
            people, hours and work
            completed across the
            organization.
          </p>
        </div>
      </div>

      <section className="super-admin-range-tabs">
        <Link
          href="/super-admin/dashboard?range=today"
          className={
            range === "today"
              ? "active"
              : ""
          }
        >
          Today
        </Link>

        <Link
          href="/super-admin/dashboard?range=week"
          className={
            range === "week"
              ? "active"
              : ""
          }
        >
          Last 7 days
        </Link>

        <Link
          href="/super-admin/dashboard?range=month"
          className={
            range === "month"
              ? "active"
              : ""
          }
        >
          This month
        </Link>
      </section>

      <form className="card super-admin-filter-bar">
        <input
          type="hidden"
          name="range"
          value={
            range === "custom"
              ? "custom"
              : range
          }
        />

        <label className="label">
          From

          <input
            className="input"
            type="date"
            name="from"
            defaultValue={from}
          />
        </label>

        <label className="label">
          To

          <input
            className="input"
            type="date"
            name="to"
            defaultValue={to}
          />
        </label>

        <label className="label">
          Team

          <select
            className="select"
            name="team"
            defaultValue={
              params.team ??
              ""
            }
          >
            <option value="">
              All teams
            </option>

            {teams.map(
              (team) => (
                <option
                  key={team.id}
                  value={team.id}
                >
                  {team.name}
                </option>
              )
            )}
          </select>
        </label>

        <label className="label">
          Role

          <select
            className="select"
            name="role"
            defaultValue={
              params.role ??
              ""
            }
          >
            <option value="">
              All roles
            </option>

            {roles.map(
              (role) => (
                <option
                  key={role}
                  value={role}
                >
                  {formatRole(
                    role
                  )}
                </option>
              )
            )}
          </select>
        </label>

        <label className="label super-admin-search">
          Search

          <div className="super-admin-search-field">
            <Search size={17} />

            <input
              name="q"
              defaultValue={
                params.q ?? ""
              }
              placeholder="Employee name or email"
            />
          </div>
        </label>

        <button
          className="btn"
          type="submit"
          name="range"
          value="custom"
        >
          Apply
        </button>
      </form>

      <section className="stats-grid">
        <ExecutiveMetric
          label="People shown"
          value={
            String(
              filteredPeople.length
            )
          }
          icon={
            <UsersRound
              size={24}
            />
          }
          tone="blue"
        />

        <ExecutiveMetric
          label="Total hours"
          value={
            formatMinutes(
              totalMinutes
            )
          }
          icon={
            <Clock3
              size={24}
            />
          }
          tone="green"
        />

        <ExecutiveMetric
          label="Work entries"
          value={
            String(
              totalEntries
            )
          }
          icon={
            <BriefcaseBusiness
              size={24}
            />
          }
          tone="amber"
        />

        <ExecutiveMetric
          label="Missing today"
          value={
            String(
              missingToday
            )
          }
          icon={
            <CalendarDays
              size={24}
            />
          }
          tone="red"
        />
      </section>

      <section className="card super-admin-section">
        <div className="section-heading">
          <div>
            <h2>
              Employee work overview
            </h2>

            <p className="muted">
              {peopleWithLogs} people
              have logged work in this
              period.
            </p>
          </div>
        </div>

        <div className="tablewrap">
          <table className="table super-admin-people-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Role</th>
                <th>Team</th>
                <th>Days logged</th>
                <th>Hours</th>
                <th>Entries</th>
                <th>Latest log</th>
                <th>View</th>
              </tr>
            </thead>

            <tbody>
              {employeeSummaries.map(
                ({
                  person,
                  minutes,
                  entries,
                  logDays,
                  latestLog,
                }) => {
                  const employeeParams =
                    new URLSearchParams(
                      queryParams
                    );

                  employeeParams.set(
                    "employee",
                    person.id
                  );

                  return (
                    <tr
                      key={
                        person.id
                      }
                    >
                      <td>
                        <div className="super-admin-person">
                          <strong>
                            {
                              person.full_name
                            }
                          </strong>

                          <span>
                            {
                              person.email
                            }
                          </span>
                        </div>
                      </td>

                      <td>
                        {formatRole(
                          person.role
                        )}
                      </td>

                      <td>
                        {person.team_id
                          ? teamMap.get(
                              person.team_id
                            ) ??
                            "Unknown team"
                          : "No team"}
                      </td>

                      <td>
                        {logDays}
                      </td>

                      <td>
                        <strong>
                          {formatMinutes(
                            minutes
                          )}
                        </strong>
                      </td>

                      <td>
                        {entries}
                      </td>

                      <td>
                        {latestLog
                          ?.work_date ??
                          "No log"}
                      </td>

                      <td>
                        <Link
                          className="textlink"
                          href={`/super-admin/dashboard?${employeeParams.toString()}`}
                        >
                          Work details
                        </Link>
                      </td>
                    </tr>
                  );
                }
              )}

              {employeeSummaries.length ===
                0 && (
                <tr>
                  <td
                    colSpan={8}
                  >
                    <div className="empty">
                      No employees match
                      these filters.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card super-admin-section">
        <div className="section-heading">
          <div>
            <h2>
              Work performed
            </h2>

            <p className="muted">
              Detailed work entries for
              the selected period.
            </p>
          </div>

          {params.employee && (
            <Link
              className="btn secondary"
              href={`/super-admin/dashboard?${queryParams.toString()}`}
            >
              Show everyone
            </Link>
          )}
        </div>

        <div className="tablewrap">
          <table className="table super-admin-work-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Work type</th>
                <th>Related task</th>
                <th>Description</th>
                <th>Time</th>
                <th>Output</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {workEntries.map(
                ({
                  log,
                  item,
                  person,
                }) => (
                  <tr
                    key={
                      item.id
                    }
                  >
                    <td>
                      {log.work_date}
                    </td>

                    <td>
                      {person
                        ?.full_name ??
                        "Unknown"}
                    </td>

                    <td>
                      {item.category_id
                        ? categoryMap.get(
                            item.category_id
                          ) ??
                          "Other"
                        : "General work"}
                    </td>

                    <td>
                      {item.task_id
                        ? taskMap.get(
                            item.task_id
                          ) ??
                          "Task unavailable"
                        : "No related task"}
                    </td>

                    <td className="super-admin-description">
                      {
                        item.description
                      }
                    </td>

                    <td>
                      {formatMinutes(
                        item.duration_minutes ??
                          0
                      )}
                    </td>

                    <td>
                      {item.quantity !==
                      null
                        ? `${
                            item.quantity
                          } ${
                            item.unit ??
                            ""
                          }`
                        : "—"}
                    </td>

                    <td>
                      <span
                        className={`badge status-${
                          item.completion_status ??
                          "in_progress"
                        }`}
                      >
                        {formatRole(
                          item.completion_status ??
                            "in_progress"
                        )}
                      </span>
                    </td>
                  </tr>
                )
              )}

              {workEntries.length ===
                0 && (
                <tr>
                  <td
                    colSpan={8}
                  >
                    <div className="empty">
                      No work entries
                      were recorded for
                      these filters.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ExecutiveMetric({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone: string;
}) {
  return (
    <div className="stat-card">
      <div
        className={`stat-icon stat-icon-${tone}`}
      >
        {icon}
      </div>

      <span className="stat-label">
        {label}
      </span>

      <div className="stat-value super-admin-stat-value">
        {value}
      </div>
    </div>
  );
}