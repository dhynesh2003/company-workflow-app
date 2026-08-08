import type { ReactNode } from "react";

import Link from "next/link";

import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  Search,
  UserRound,
  UsersRound,
} from "lucide-react";

import { requireRole } from "@/lib/auth";

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
  manager_id: string | null;
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
  description: string | null;
  team_id: string | null;
  status: string;
  priority: string | null;
  created_by: string;
  assigned_to: string;
  start_date: string | null;
  due_date: string | null;
  updated_at: string | null;
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
  daily_log_items: DailyLogItemRow[] | null;
};

type TaskWorkSummary = {
  minutes: number;
  entries: number;
  completedEntries: number;
};

function formatRole(role: string) {
  return role.replaceAll("_", " ");
}

function formatMinutes(minutes: number) {
  const safe = Math.max(0, Math.floor(minutes));
  return `${Math.floor(safe / 60)}h ${safe % 60}m`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getDateRange(params: SuperAdminSearchParams) {
  const today = new Date().toISOString().slice(0, 10);
  const range = params.range || "week";

  if (range === "custom" && params.from && params.to) {
    return { range, from: params.from, to: params.to, today };
  }

  if (range === "today") {
    return { range, from: today, to: today, today };
  }

  if (range === "month") {
    return { range, from: `${today.slice(0, 7)}-01`, to: today, today };
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

function taskStage(status: string) {
  if (status === "completed") return 4;
  if (
    status === "submitted" ||
    status === "under_review" ||
    status === "changes_requested" ||
    status === "rejected"
  ) {
    return 2;
  }
  if (status === "in_progress" || status === "blocked") return 1;
  return 0;
}

function personLabel(person: ProfileRow | undefined | null) {
  return person?.full_name ?? "Unknown person";
}

export default async function SuperAdminDashboard({
  searchParams,
}: {
  searchParams: Promise<SuperAdminSearchParams>;
}) {
  const params = await searchParams;
  const { supabase, profile } = await requireRole(["super_admin"]);
  const { range, from, to, today } = getDateRange(params);

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
        manager_id,
        is_active
      `)
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true)
      .order("full_name"),

    supabase
      .from("teams")
      .select("id,name")
      .eq("organization_id", profile.organization_id)
      .order("name"),

    supabase
      .from("work_categories")
      .select("id,name")
      .eq("organization_id", profile.organization_id)
      .order("name"),

    supabase
      .from("tasks")
      .select(`
        id,
        title,
        description,
        team_id,
        status,
        priority,
        created_by,
        assigned_to,
        start_date,
        due_date,
        updated_at
      `)
      .eq("organization_id", profile.organization_id),

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
      .eq("organization_id", profile.organization_id)
      .gte("work_date", from)
      .lte("work_date", to)
      .order("work_date", { ascending: false }),

    supabase
      .from("daily_logs")
      .select("employee_id")
      .eq("organization_id", profile.organization_id)
      .eq("work_date", today),
  ]);

  const queryError =
    peopleResult.error ||
    teamsResult.error ||
    categoriesResult.error ||
    tasksResult.error ||
    logsResult.error ||
    todayLogsResult.error;

  if (queryError) throw new Error(queryError.message);

  const people = (peopleResult.data ?? []) as ProfileRow[];
  const teams = (teamsResult.data ?? []) as TeamRow[];
  const categories = (categoriesResult.data ?? []) as CategoryRow[];
  const tasks = (tasksResult.data ?? []) as TaskRow[];
  const logs = (logsResult.data ?? []) as unknown as DailyLogRow[];

  const todayLogEmployeeIds = new Set(
    (todayLogsResult.data ?? []).map((row) => row.employee_id)
  );

  const teamMap = new Map(teams.map((team) => [team.id, team.name]));
  const peopleMap = new Map(people.map((person) => [person.id, person]));
  const categoryMap = new Map(
    categories.map((category) => [category.id, category.name])
  );
  const taskMap = new Map(tasks.map((task) => [task.id, task.title]));

  // Super admin is an executive viewer, not part of workforce totals.
  const workforce = people.filter((person) => person.role !== "super_admin");

  const selectedEmployee = params.employee
    ? workforce.find((person) => person.id === params.employee) ?? null
    : null;
  const isFocusMode = Boolean(selectedEmployee);

  let generalFilteredPeople = workforce;

  if (params.team) {
    generalFilteredPeople = generalFilteredPeople.filter(
      (person) => person.team_id === params.team
    );
  }

  if (params.role) {
    generalFilteredPeople = generalFilteredPeople.filter(
      (person) => person.role === params.role
    );
  }

  if (params.q?.trim()) {
    const query = params.q.trim().toLowerCase();
    generalFilteredPeople = generalFilteredPeople.filter(
      (person) =>
        person.full_name.toLowerCase().includes(query) ||
        person.email.toLowerCase().includes(query) ||
        (person.job_title ?? "").toLowerCase().includes(query)
    );
  }

  const visiblePeople =
    isFocusMode && selectedEmployee ? [selectedEmployee] : generalFilteredPeople;
  const visibleEmployeeIds = new Set(visiblePeople.map((person) => person.id));
  const filteredLogs = logs.filter((log) =>
    visibleEmployeeIds.has(log.employee_id)
  );

  const totalMinutes = filteredLogs.reduce(
    (sum, log) => sum + (log.total_minutes ?? 0),
    0
  );
  const totalEntries = filteredLogs.reduce(
    (sum, log) => sum + (log.daily_log_items?.length ?? 0),
    0
  );
  const completedEntries = filteredLogs.reduce(
    (sum, log) =>
      sum +
      (log.daily_log_items ?? []).filter(
        (item) => item.completion_status === "completed"
      ).length,
    0
  );
  const peopleWithLogs = new Set(filteredLogs.map((log) => log.employee_id)).size;
  const missingToday = visiblePeople.filter(
    (person) => !todayLogEmployeeIds.has(person.id)
  ).length;

  const employeeSummaries = generalFilteredPeople.map((person) => {
    const personLogs = logs.filter((log) => log.employee_id === person.id);
    const minutes = personLogs.reduce(
      (sum, log) => sum + (log.total_minutes ?? 0),
      0
    );
    const entries = personLogs.reduce(
      (sum, log) => sum + (log.daily_log_items?.length ?? 0),
      0
    );

    return {
      person,
      minutes,
      entries,
      logDays: personLogs.length,
      latestLog: personLogs[0] ?? null,
    };
  });

  const workEntries = filteredLogs.flatMap((log) =>
    (log.daily_log_items ?? []).map((item) => ({
      log,
      item,
      person: peopleMap.get(log.employee_id) ?? null,
    }))
  );

  // Aggregate task-linked daily work across the whole company for this date range.
  // This lets a team lead's delegated task show work done by the assignee too.
  const taskWorkMap = new Map<string, TaskWorkSummary>();
  logs.forEach((log) => {
    (log.daily_log_items ?? []).forEach((item) => {
      if (!item.task_id) return;
      const current = taskWorkMap.get(item.task_id) ?? {
        minutes: 0,
        entries: 0,
        completedEntries: 0,
      };
      current.minutes += item.duration_minutes ?? 0;
      current.entries += 1;
      if (item.completion_status === "completed") current.completedEntries += 1;
      taskWorkMap.set(item.task_id, current);
    });
  });

  const queryParams = new URLSearchParams();
  queryParams.set("range", range);
  if (range === "custom") {
    queryParams.set("from", from);
    queryParams.set("to", to);
  }
  if (params.team) queryParams.set("team", params.team);
  if (params.role) queryParams.set("role", params.role);
  if (params.q) queryParams.set("q", params.q);

  const roles = ["admin", "team_lead", "reviewer", "employee"];

  if (isFocusMode && selectedEmployee) {
    const selectedTeam = selectedEmployee.team_id
      ? teams.find((team) => team.id === selectedEmployee.team_id) ?? null
      : null;
    const teamMembers = selectedEmployee.team_id
      ? workforce.filter((person) => person.team_id === selectedEmployee.team_id)
      : [];
    const teamLead =
      teamMembers.find((person) => person.role === "team_lead") ??
      (selectedEmployee.manager_id
        ? peopleMap.get(selectedEmployee.manager_id) ?? null
        : null);
    const manager = selectedEmployee.manager_id
      ? peopleMap.get(selectedEmployee.manager_id) ?? null
      : null;

    const relatedTasks = tasks
      .filter(
        (task) =>
          task.assigned_to === selectedEmployee.id ||
          task.created_by === selectedEmployee.id
      )
      .sort((a, b) =>
        (b.updated_at ?? "").localeCompare(a.updated_at ?? "")
      );

    const assignedToEmployee = relatedTasks.filter(
      (task) => task.assigned_to === selectedEmployee.id
    ).length;
    const assignedByEmployee = relatedTasks.filter(
      (task) =>
        task.created_by === selectedEmployee.id &&
        task.assigned_to !== selectedEmployee.id
    ).length;


    const focusRangeHref = (newRange: "today" | "week" | "month") => {
      const next = new URLSearchParams(queryParams);
      next.set("range", newRange);
      next.delete("from");
      next.delete("to");
      next.set("employee", selectedEmployee.id);
      return `/super-admin/dashboard?${next.toString()}`;
    };

    return (
      <div className="grid super-admin-page super-admin-focus-page">
        <div className="super-admin-employee-topbar">
          <Link
            href={`/super-admin/dashboard?${queryParams.toString()}`}
            className="super-admin-back-link"
          >
            <ArrowLeft size={17} />
            Back to all employees
          </Link>
        </div>

        <section className="card super-admin-employee-profile super-admin-focus-profile">
          <div className="super-admin-employee-avatar">
            <UserRound size={30} />
          </div>

          <div className="super-admin-employee-profile-copy">
            <span className="eyebrow">Employee focus</span>
            <h1>{selectedEmployee.full_name}</h1>
            <div className="super-admin-employee-meta">
              <span>{selectedEmployee.email}</span>
              <span aria-hidden="true">•</span>
              <span>
                {selectedEmployee.job_title?.trim() ||
                  formatRole(selectedEmployee.role)}
              </span>
              <span aria-hidden="true">•</span>
              <span>{selectedTeam?.name ?? "No team"}</span>
            </div>
          </div>

          <div className="super-admin-focus-period">
            <span>Selected period</span>
            <strong>
              {from} → {to}
            </strong>
          </div>
        </section>

        <section className="super-admin-range-tabs">
          <Link
            href={focusRangeHref("today")}
            className={range === "today" ? "active" : ""}
          >
            Today
          </Link>
          <Link
            href={focusRangeHref("week")}
            className={range === "week" ? "active" : ""}
          >
            Last 7 days
          </Link>
          <Link
            href={focusRangeHref("month")}
            className={range === "month" ? "active" : ""}
          >
            This month
          </Link>
        </section>

        <form className="card super-admin-focus-date-filter">
          <input type="hidden" name="employee" value={selectedEmployee.id} />
          {params.team && <input type="hidden" name="team" value={params.team} />}
          {params.role && <input type="hidden" name="role" value={params.role} />}
          {params.q && <input type="hidden" name="q" value={params.q} />}

          <label className="label">
            From
            <input className="input" type="date" name="from" defaultValue={from} />
          </label>
          <label className="label">
            To
            <input className="input" type="date" name="to" defaultValue={to} />
          </label>
          <button className="btn" type="submit" name="range" value="custom">
            Apply dates
          </button>
        </form>

        <section className="super-admin-focus-summary-grid">
          <FocusMetric label="Hours" value={formatMinutes(totalMinutes)} />
          <FocusMetric label="Days logged" value={String(filteredLogs.length)} />
          <FocusMetric label="Work entries" value={String(totalEntries)} />
          <FocusMetric
            label="Completed"
            value={`${completedEntries}/${totalEntries}`}
          />
        </section>

        <section className="card super-admin-section super-admin-team-context">
          <div className="section-heading">
            <div>
              <h2>Team & reporting context</h2>
              <p className="muted">
                See who works with {selectedEmployee.full_name} and how this person
                sits inside the team.
              </p>
            </div>
            {selectedTeam && (
              <span className="super-admin-team-pill">{selectedTeam.name}</span>
            )}
          </div>

          {selectedTeam ? (
            <>
              <div className="super-admin-team-context-facts">
                <div>
                  <span>Team lead</span>
                  <strong>{personLabel(teamLead)}</strong>
                </div>
                <div>
                  <span>Reports to</span>
                  <strong>
                    {selectedEmployee.role === "team_lead"
                      ? "Team lead"
                      : personLabel(manager ?? teamLead)}
                  </strong>
                </div>
                <div>
                  <span>Team members</span>
                  <strong>{teamMembers.length}</strong>
                </div>
                <div>
                  <span>Task relationship</span>
                  <strong>
                    {assignedToEmployee} received · {assignedByEmployee} delegated
                  </strong>
                </div>
              </div>

              <div className="super-admin-team-member-grid">
                {teamMembers.map((member) => {
                  const memberParams = new URLSearchParams(queryParams);
                  memberParams.set("employee", member.id);
                  const isCurrent = member.id === selectedEmployee.id;
                  return (
                    <Link
                      key={member.id}
                      href={`/super-admin/dashboard?${memberParams.toString()}`}
                      className={`super-admin-team-member-card ${
                        isCurrent ? "current" : ""
                      }`}
                    >
                      <span className="super-admin-member-avatar">
                        {member.full_name.slice(0, 1).toUpperCase()}
                      </span>
                      <span>
                        <strong>{member.full_name}</strong>
                        <small>{formatRole(member.role)}</small>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="empty">
              This employee is not currently assigned to a team.
            </div>
          )}
        </section>

        <section className="card super-admin-section super-admin-process-section">
          <div className="section-heading">
            <div>
              <h2>Work assignment process</h2>
              <p className="muted">
                Who assigned the work, what the task is, who is doing it, and the
                current status.
              </p>
            </div>
            <div className="super-admin-process-counts">
              <span>{assignedToEmployee} assigned to this person</span>
              <span>{assignedByEmployee} assigned by this person</span>
            </div>
          </div>

          {relatedTasks.length === 0 ? (
            <div className="empty">
              No assigned or delegated tasks were found for this employee.
            </div>
          ) : (
            <div className="super-admin-process-list">
              {relatedTasks.map((task) => {
                const creator = peopleMap.get(task.created_by);
                const assignee = peopleMap.get(task.assigned_to);
                const stage = taskStage(task.status);
                const taskWork = taskWorkMap.get(task.id);
                const taskTeam = task.team_id ? teamMap.get(task.team_id) : null;
                const relationship =
                  task.created_by === selectedEmployee.id &&
                  task.assigned_to === selectedEmployee.id
                    ? "Self assigned"
                    : task.created_by === selectedEmployee.id
                      ? `Assigned by ${selectedEmployee.full_name}`
                      : `Assigned to ${selectedEmployee.full_name}`;

                return (
                  <article className="super-admin-process-card" key={task.id}>
                    <div className="super-admin-process-card-head">
                      <div>
                        <span className="super-admin-process-relation">
                          {relationship}
                        </span>
                        <h3>{task.title}</h3>
                      </div>
                      <span className={`badge status-${task.status}`}>
                        {formatRole(task.status)}
                      </span>
                    </div>

                    <div className="super-admin-process-flow">
                      <div className="super-admin-process-person">
                        <span>Assigned by</span>
                        <strong>{personLabel(creator)}</strong>
                        <small>{creator ? formatRole(creator.role) : "—"}</small>
                      </div>

                      <div className="super-admin-process-arrow" aria-hidden="true">
                        <ArrowRight size={19} />
                      </div>

                      <div className="super-admin-process-task-node">
                        <span>Task</span>
                        <strong>{task.title}</strong>
                        <small>{formatRole(task.priority ?? "normal")} priority</small>
                      </div>

                      <div className="super-admin-process-arrow" aria-hidden="true">
                        <ArrowRight size={19} />
                      </div>

                      <div className="super-admin-process-person doing">
                        <span>Doing the work</span>
                        <strong>{personLabel(assignee)}</strong>
                        <small>{assignee ? formatRole(assignee.role) : "—"}</small>
                      </div>
                    </div>

                    <div className="super-admin-task-stepper" aria-label="Task progress">
                      {["Assigned", "In progress", "Review", "Completed"].map(
                        (label, index) => (
                          <div
                            key={label}
                            className={`super-admin-task-step ${
                              index < stage ? "done" : index === stage ? "active" : ""
                            }`}
                          >
                            <span />
                            <small>{label}</small>
                          </div>
                        )
                      )}
                    </div>

                    <div className="super-admin-process-meta">
                      <span>Team: {taskTeam ?? "No team"}</span>
                      <span>Due: {formatDate(task.due_date)}</span>
                      <span>
                        Logged: {formatMinutes(taskWork?.minutes ?? 0)} · {taskWork?.entries ?? 0}{" "}
                        entries
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="card super-admin-section">
          <div className="section-heading">
            <div>
              <h2>{selectedEmployee.full_name}&apos;s work</h2>
              <p className="muted">
                Detailed work entries recorded from {from} to {to}.
              </p>
            </div>
          </div>

          <div className="tablewrap">
            <table className="table super-admin-work-table super-admin-focus-work-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Work type</th>
                  <th>Related task</th>
                  <th>Description</th>
                  <th>Time</th>
                  <th>Output</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {workEntries.map(({ log, item }) => (
                  <tr key={item.id}>
                    <td>{log.work_date}</td>
                    <td>
                      {item.category_id
                        ? categoryMap.get(item.category_id) ?? "Other"
                        : "General work"}
                    </td>
                    <td>
                      {item.task_id
                        ? taskMap.get(item.task_id) ?? "Task unavailable"
                        : "No related task"}
                    </td>
                    <td className="super-admin-description">{item.description}</td>
                    <td>{formatMinutes(item.duration_minutes ?? 0)}</td>
                    <td>
                      {item.quantity !== null
                        ? `${item.quantity} ${item.unit ?? ""}`.trim()
                        : "—"}
                    </td>
                    <td>
                      <span
                        className={`badge status-${
                          item.completion_status ?? "in_progress"
                        }`}
                      >
                        {formatRole(item.completion_status ?? "in_progress")}
                      </span>
                    </td>
                  </tr>
                ))}
                {workEntries.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty">
                        No work entries were recorded for this employee in the
                        selected period.
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

  return (
    <div className="grid super-admin-page">
      <div className="page-head">
        <div>
          <h1>Company Overview</h1>
          <p>
            Read-only visibility into people, hours and work completed across the
            organization.
          </p>
        </div>
      </div>

      <section className="super-admin-range-tabs">
        <Link
          href="/super-admin/dashboard?range=today"
          className={range === "today" ? "active" : ""}
        >
          Today
        </Link>
        <Link
          href="/super-admin/dashboard?range=week"
          className={range === "week" ? "active" : ""}
        >
          Last 7 days
        </Link>
        <Link
          href="/super-admin/dashboard?range=month"
          className={range === "month" ? "active" : ""}
        >
          This month
        </Link>
      </section>

      <form className="card super-admin-filter-bar">
        <input type="hidden" name="range" value={range === "custom" ? "custom" : range} />

        <label className="label">
          From
          <input className="input" type="date" name="from" defaultValue={from} />
        </label>

        <label className="label">
          To
          <input className="input" type="date" name="to" defaultValue={to} />
        </label>

        <label className="label">
          Team
          <select className="select" name="team" defaultValue={params.team ?? ""}>
            <option value="">All teams</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>

        <label className="label">
          Role
          <select className="select" name="role" defaultValue={params.role ?? ""}>
            <option value="">All roles</option>
            {roles.map((role) => (
              <option key={role} value={role}>
                {formatRole(role)}
              </option>
            ))}
          </select>
        </label>

        <label className="label super-admin-search">
          Search
          <div className="super-admin-search-field">
            <Search size={17} />
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Employee name or email"
            />
          </div>
        </label>

        <button className="btn" type="submit" name="range" value="custom">
          Apply
        </button>
      </form>

      <section className="stats-grid">
        <ExecutiveMetric
          label="People shown"
          value={String(generalFilteredPeople.length)}
          icon={<UsersRound size={24} />}
          tone="blue"
        />
        <ExecutiveMetric
          label="Total hours"
          value={formatMinutes(totalMinutes)}
          icon={<Clock3 size={24} />}
          tone="green"
        />
        <ExecutiveMetric
          label="Work entries"
          value={String(totalEntries)}
          icon={<BriefcaseBusiness size={24} />}
          tone="amber"
        />
        <ExecutiveMetric
          label="Missing today"
          value={String(missingToday)}
          icon={<CalendarDays size={24} />}
          tone="red"
        />
      </section>

      <section className="card super-admin-section">
        <div className="section-heading">
          <div>
            <h2>Employee work overview</h2>
            <p className="muted">
              {peopleWithLogs} people have logged work in this period. Select an
              employee to open their work, team and assignment flow.
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
              </tr>
            </thead>
            <tbody>
              {employeeSummaries.map(
                ({ person, minutes, entries, logDays, latestLog }) => {
                  const employeeParams = new URLSearchParams(queryParams);
                  employeeParams.set("employee", person.id);

                  return (
                    <tr key={person.id}>
                      <td>
                        <Link
                          className="super-admin-person super-admin-person-link"
                          href={`/super-admin/dashboard?${employeeParams.toString()}`}
                        >
                          <strong>{person.full_name}</strong>
                          <span>{person.email}</span>
                        </Link>
                      </td>
                      <td>{formatRole(person.role)}</td>
                      <td>
                        {person.team_id
                          ? teamMap.get(person.team_id) ?? "Unknown team"
                          : "No team"}
                      </td>
                      <td>{logDays}</td>
                      <td>
                        <strong>{formatMinutes(minutes)}</strong>
                      </td>
                      <td>{entries}</td>
                      <td>{latestLog?.work_date ?? "No log"}</td>
                    </tr>
                  );
                }
              )}

              {employeeSummaries.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty">No employees match these filters.</div>
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
      <div className={`stat-icon stat-icon-${tone}`}>{icon}</div>
      <span className="stat-label">{label}</span>
      <div className="stat-value super-admin-stat-value">{value}</div>
    </div>
  );
}

function FocusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="super-admin-focus-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
