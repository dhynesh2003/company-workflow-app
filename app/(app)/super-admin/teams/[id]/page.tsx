import type { ReactNode } from "react";

import Link from "next/link";

import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  ListChecks,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import { requireRole } from "@/lib/auth";

type SearchParams = {
  range?: string;
};

type TeamRow = {
  id: string;
  name: string;
  team_lead_id: string | null;
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
  task_id: string | null;
  duration_minutes: number | null;
  completion_status: string | null;
};

type DailyLogRow = {
  id: string;
  employee_id: string;
  work_date: string;
  total_minutes: number | null;
  daily_log_items: DailyLogItemRow[] | null;
};

type TaskWorkSummary = {
  minutes: number;
  entries: number;
};

function formatRole(value: string) {
  return value.replaceAll("_", " ");
}

function formatMinutes(minutes: number) {
  const safe = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;

  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
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

function getDateRange(range?: string) {
  const today = new Date().toISOString().slice(0, 10);

  if (range === "today") {
    return { range: "today", from: today, to: today, today };
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

function taskStage(status: string) {
  if (status === "completed") return 3;

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

function statusBucket(
  status: string
): "not_started" | "in_progress" | "review" | "completed" {
  if (status === "completed") return "completed";

  if (
    status === "submitted" ||
    status === "under_review" ||
    status === "changes_requested" ||
    status === "rejected"
  ) {
    return "review";
  }

  if (status === "in_progress" || status === "blocked") {
    return "in_progress";
  }

  return "not_started";
}

function personName(person: ProfileRow | undefined | null) {
  return person?.full_name ?? "Unknown person";
}

export default async function SuperAdminTeamWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase, profile } = await requireRole(["super_admin"]);
  const { range, from, to, today } = getDateRange(query.range);

  const [teamResult, peopleResult, tasksResult, logsResult, todayLogsResult] =
    await Promise.all([
      supabase
        .from("teams")
        .select("id,name,team_lead_id")
        .eq("organization_id", profile.organization_id)
        .eq("id", id)
        .maybeSingle(),

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
          employee_id,
          work_date,
          total_minutes,
          daily_log_items (
            id,
            task_id,
            duration_minutes,
            completion_status
          )
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
    teamResult.error ||
    peopleResult.error ||
    tasksResult.error ||
    logsResult.error ||
    todayLogsResult.error;

  if (queryError) {
    throw new Error(queryError.message);
  }

  const team = teamResult.data as TeamRow | null;

  if (!team) {
    return (
      <div className="grid super-admin-team-workspace-page">
        <Link className="super-admin-back-link" href="/super-admin/teams">
          <ArrowLeft size={16} /> Teams Overview
        </Link>
        <div className="card empty">This team could not be found.</div>
      </div>
    );
  }

  const people = (peopleResult.data ?? []) as ProfileRow[];
  const allTasks = (tasksResult.data ?? []) as TaskRow[];
  const logs = (logsResult.data ?? []) as unknown as DailyLogRow[];
  const peopleMap = new Map(people.map((person) => [person.id, person]));

  const members = people.filter(
    (person) => person.team_id === team.id && person.role !== "super_admin"
  );
  const memberIds = new Set(members.map((member) => member.id));

  const teamLead =
    (team.team_lead_id ? peopleMap.get(team.team_lead_id) : undefined) ??
    members.find((member) => member.role === "team_lead") ??
    null;

  const teamLogs = logs.filter((log) => memberIds.has(log.employee_id));
  const teamMinutes = teamLogs.reduce(
    (sum, log) => sum + (log.total_minutes ?? 0),
    0
  );
  const workEntries = teamLogs.reduce(
    (sum, log) => sum + (log.daily_log_items?.length ?? 0),
    0
  );

  const relatedTasks = allTasks
    .filter(
      (task) => task.team_id === team.id || memberIds.has(task.assigned_to)
    )
    .filter((task) => {
      if (task.status !== "completed") return true;
      if (!task.updated_at) return false;
      const updatedDate = task.updated_at.slice(0, 10);
      return updatedDate >= from && updatedDate <= to;
    })
    .sort((a, b) => {
      const aDone = a.status === "completed" ? 1 : 0;
      const bDone = b.status === "completed" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;

      const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    });

  const activeTasks = relatedTasks.filter((task) => task.status !== "completed");
  const completedTasks = relatedTasks.filter((task) => task.status === "completed");

  const taskWorkMap = new Map<string, TaskWorkSummary>();

  for (const log of teamLogs) {
    for (const item of log.daily_log_items ?? []) {
      if (!item.task_id) continue;
      const current = taskWorkMap.get(item.task_id) ?? { minutes: 0, entries: 0 };
      current.minutes += item.duration_minutes ?? 0;
      current.entries += 1;
      taskWorkMap.set(item.task_id, current);
    }
  }

  const todayLoggedIds = new Set(
    (todayLogsResult.data ?? []).map((row) => row.employee_id)
  );

  const statusCounts = relatedTasks.reduce(
    (counts, task) => {
      counts[statusBucket(task.status)] += 1;
      return counts;
    },
    {
      not_started: 0,
      in_progress: 0,
      review: 0,
      completed: 0,
    }
  );

  const memberRows = members.map((member) => {
    const memberLogs = teamLogs.filter((log) => log.employee_id === member.id);
    const minutes = memberLogs.reduce(
      (sum, log) => sum + (log.total_minutes ?? 0),
      0
    );
    const entries = memberLogs.reduce(
      (sum, log) => sum + (log.daily_log_items?.length ?? 0),
      0
    );
    const loggedDays = new Set(memberLogs.map((log) => log.work_date)).size;
    const assignedTasks = relatedTasks.filter(
      (task) => task.assigned_to === member.id
    );
    const memberActive = assignedTasks.filter(
      (task) => task.status !== "completed"
    );
    const memberCompleted = assignedTasks.filter(
      (task) => task.status === "completed"
    ).length;

    return {
      member,
      minutes,
      entries,
      loggedDays,
      activeTasks: memberActive,
      completedTasks: memberCompleted,
      loggedToday: todayLoggedIds.has(member.id),
    };
  });

  return (
    <div className="grid super-admin-team-workspace-page">
      <div className="super-admin-team-workspace-topline">
        <Link
          className="super-admin-back-link"
          href={`/super-admin/teams?range=${range}`}
        >
          <ArrowLeft size={16} /> Teams Overview
        </Link>

        <span className="super-admin-period-label">
          {from} to {to}
        </span>
      </div>

      <section className="card super-admin-team-workspace-hero">
        <div className="super-admin-team-workspace-identity">
          <div className="super-admin-team-workspace-icon">
            <UsersRound size={25} />
          </div>
          <div>
            <span className="eyebrow">Team workspace</span>
            <h1>{team.name}</h1>
            <p>
              {teamLead
                ? `Led by ${teamLead.full_name}`
                : "No team lead is currently assigned"}
            </p>
          </div>
        </div>

        <div className="super-admin-team-lead-chip">
          <ShieldCheck size={16} />
          <span>
            <small>Team lead</small>
            <strong>{personName(teamLead)}</strong>
          </span>
        </div>
      </section>

      <section className="super-admin-range-tabs">
        <Link
          href={`/super-admin/teams/${team.id}?range=today`}
          className={range === "today" ? "active" : ""}
        >
          Today
        </Link>
        <Link
          href={`/super-admin/teams/${team.id}?range=week`}
          className={range === "week" ? "active" : ""}
        >
          Last 7 days
        </Link>
        <Link
          href={`/super-admin/teams/${team.id}?range=month`}
          className={range === "month" ? "active" : ""}
        >
          This month
        </Link>
      </section>

      <section className="super-admin-focus-summary-grid">
        <TeamMetric
          icon={<UsersRound size={18} />}
          label="Members"
          value={String(members.length)}
        />
        <TeamMetric
          icon={<Clock3 size={18} />}
          label="Team hours"
          value={formatMinutes(teamMinutes)}
        />
        <TeamMetric
          icon={<ListChecks size={18} />}
          label="Work entries"
          value={String(workEntries)}
        />
        <TeamMetric
          icon={<BriefcaseBusiness size={18} />}
          label="Active tasks"
          value={String(activeTasks.length)}
        />
      </section>

      <section className="card super-admin-section super-admin-team-workflow-section">
        <div className="section-heading">
          <div>
            <h2>Team workflow</h2>
            <p className="muted">
              See who assigned each task, who owns it now, and where it is in the
              process.
            </p>
          </div>
          <div className="super-admin-process-counts">
            <span>{activeTasks.length} active</span>
            <span>{completedTasks.length} completed</span>
          </div>
        </div>

        {relatedTasks.length === 0 ? (
          <div className="empty">No team-related tasks were found.</div>
        ) : (
          <div className="super-admin-process-list">
            {relatedTasks.slice(0, 12).map((task) => {
              const creator = peopleMap.get(task.created_by);
              const assignee = peopleMap.get(task.assigned_to);
              const taskWork = taskWorkMap.get(task.id);
              const stage = taskStage(task.status);

              return (
                <article className="super-admin-process-card" key={task.id}>
                  <div className="super-admin-process-card-head">
                    <div>
                      <span className="super-admin-process-relation">
                        {task.team_id === team.id ? team.name : "Team-related work"}
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
                      <strong>{personName(creator)}</strong>
                      <small>{creator ? formatRole(creator.role) : "—"}</small>
                    </div>

                    <div className="super-admin-process-arrow" aria-hidden="true">
                      <ArrowRight size={19} />
                    </div>

                    <Link
                      className="super-admin-process-task-node super-admin-process-task-link"
                      href={`/tasks/${task.id}`}
                    >
                      <span>Task</span>
                      <strong>{task.title}</strong>
                      <small>{formatRole(task.priority ?? "normal")} priority</small>
                    </Link>

                    <div className="super-admin-process-arrow" aria-hidden="true">
                      <ArrowRight size={19} />
                    </div>

                    <div className="super-admin-process-person doing">
                      <span>Doing the work</span>
                      <strong>{personName(assignee)}</strong>
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
                    <span>Due: {formatDate(task.due_date)}</span>
                    <span>
                      Logged: {formatMinutes(taskWork?.minutes ?? 0)} ·{" "}
                      {taskWork?.entries ?? 0} entries
                    </span>
                    <Link href={`/tasks/${task.id}`}>Open task →</Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="card super-admin-section super-admin-team-pipeline-section">
        <div className="section-heading">
          <div>
            <h2>Task status pipeline</h2>
            <p className="muted">
              A quick view of how the team&apos;s tasks are distributed across the
              process.
            </p>
          </div>
        </div>

        <div className="super-admin-team-pipeline">
          <PipelineItem
            label="Not started"
            value={statusCounts.not_started}
            total={relatedTasks.length}
            tone="neutral"
          />
          <PipelineItem
            label="In progress"
            value={statusCounts.in_progress}
            total={relatedTasks.length}
            tone="progress"
          />
          <PipelineItem
            label="Review"
            value={statusCounts.review}
            total={relatedTasks.length}
            tone="review"
          />
          <PipelineItem
            label="Completed"
            value={statusCounts.completed}
            total={relatedTasks.length}
            tone="complete"
          />
        </div>
      </section>

      <section className="card super-admin-section super-admin-team-workload-section">
        <div className="section-heading">
          <div>
            <h2>Team workload</h2>
            <p className="muted">
              Understand work distribution without leaving the team workspace.
            </p>
          </div>
        </div>

        <div className="tablewrap">
          <table className="table super-admin-team-workload-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Hours</th>
                <th>Logged days</th>
                <th>Work entries</th>
                <th>Active tasks</th>
                <th>Current work</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {memberRows.map((row) => (
                <tr key={row.member.id}>
                  <td>
                    <Link
                      className="super-admin-team-person-cell"
                      href={`/super-admin/dashboard?range=${range}&employee=${row.member.id}`}
                    >
                      <span className="super-admin-member-avatar">
                        {row.member.full_name.slice(0, 1).toUpperCase()}
                      </span>
                      <span>
                        <strong>{row.member.full_name}</strong>
                        <small>
                          {formatRole(row.member.role)} ·{" "}
                          {row.loggedToday ? "logged today" : "not logged today"}
                        </small>
                      </span>
                    </Link>
                  </td>
                  <td>{formatMinutes(row.minutes)}</td>
                  <td>{row.loggedDays}</td>
                  <td>{row.entries}</td>
                  <td>{row.activeTasks.length}</td>
                  <td>
                    {row.activeTasks.length > 0 ? (
                      <div className="super-admin-current-work-list">
                        {row.activeTasks.slice(0, 2).map((task) => (
                          <Link key={task.id} href={`/tasks/${task.id}`}>
                            {task.title}
                          </Link>
                        ))}
                        {row.activeTasks.length > 2 && (
                          <small>+{row.activeTasks.length - 2} more</small>
                        )}
                      </div>
                    ) : (
                      <span className="muted">No active task</span>
                    )}
                  </td>
                  <td>
                    <span className="super-admin-completed-count">
                      <CheckCircle2 size={15} /> {row.completedTasks}
                    </span>
                  </td>
                </tr>
              ))}

              {memberRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    This team has no active members.
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

function TeamMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <article className="super-admin-focus-summary-card super-admin-team-workspace-metric">
      <span className="super-admin-team-workspace-metric-icon">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function PipelineItem({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "neutral" | "progress" | "review" | "complete";
}) {
  const width = total > 0 ? Math.max(4, (value / total) * 100) : 0;

  return (
    <div className={`super-admin-pipeline-item ${tone}`}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="super-admin-pipeline-track" aria-hidden="true">
        <span style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
