import type { ReactNode } from "react";

import Link from "next/link";

import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  FileText,
  Layers3,
  UserRound,
} from "lucide-react";

import { requireRole } from "@/lib/auth";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
  }>;
};

type LogItem = {
  id: string;
  category_id: string | null;
  task_id: string | null;
  description: string;
  duration_minutes: number | null;
  quantity: number | null;
  unit: string | null;
  completion_status: string | null;
};

type DailyLog = {
  id: string;
  work_date: string;
  attendance_status: string | null;
  status: string | null;
  total_minutes: number | null;
  summary: string | null;
  remarks: string | null;
  daily_log_items: LogItem[] | null;
};

function formatMinutes(minutes: number) {
  const safe = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatText(value: string | null | undefined) {
  if (!value) return "—";
  return value.replaceAll("_", " ");
}

function getDateRange(
  range: string | undefined,
  from: string | undefined,
  to: string | undefined
) {
  const today = new Date().toISOString().slice(0, 10);

  if (range === "custom" && from && to) {
    return { range: "custom", from, to };
  }

  if (range === "today") {
    return { range: "today", from: today, to: today };
  }

  if (range === "month") {
    return { range: "month", from: `${today.slice(0, 7)}-01`, to: today };
  }

  const weekStart = new Date(`${today}T00:00:00.000Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);

  return {
    range: "week",
    from: weekStart.toISOString().slice(0, 10),
    to: today,
  };
}

export default async function SuperAdminEmployeePage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const query = await searchParams;

  const { supabase, profile: viewer } = await requireRole([
    "super_admin",
  ]);

  const dateRange = getDateRange(
    query.range,
    query.from,
    query.to
  );

  const [
    employeeResult,
    teamsResult,
    categoriesResult,
    tasksResult,
    logsResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(`
        id,
        organization_id,
        full_name,
        email,
        job_title,
        role,
        team_id,
        is_active
      `)
      .eq("id", id)
      .eq("organization_id", viewer.organization_id)
      .maybeSingle(),

    supabase
      .from("teams")
      .select("id,name")
      .eq("organization_id", viewer.organization_id),

    supabase
      .from("work_categories")
      .select("id,name")
      .eq("organization_id", viewer.organization_id),

    supabase
      .from("tasks")
      .select("id,title")
      .eq("organization_id", viewer.organization_id),

    supabase
      .from("daily_logs")
      .select(`
        id,
        work_date,
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
      .eq("organization_id", viewer.organization_id)
      .eq("employee_id", id)
      .gte("work_date", dateRange.from)
      .lte("work_date", dateRange.to)
      .order("work_date", { ascending: false }),
  ]);

  const queryError =
    employeeResult.error ||
    teamsResult.error ||
    categoriesResult.error ||
    tasksResult.error ||
    logsResult.error;

  if (queryError) {
    throw new Error(queryError.message);
  }

  const employee = employeeResult.data;

  if (!employee) {
    return (
      <div className="card">
        <h1>Employee not found</h1>
        <p className="muted">
          This employee is unavailable or does not belong to your organization.
        </p>
        <Link href="/super-admin/dashboard" className="btn">
          Back to Company Overview
        </Link>
      </div>
    );
  }

  const logs = (logsResult.data ?? []) as unknown as DailyLog[];

  const teamMap = new Map(
    (teamsResult.data ?? []).map((team) => [team.id, team.name])
  );

  const categoryMap = new Map(
    (categoriesResult.data ?? []).map((category) => [
      category.id,
      category.name,
    ])
  );

  const taskMap = new Map(
    (tasksResult.data ?? []).map((task) => [task.id, task.title])
  );

  const totalMinutes = logs.reduce(
    (sum, log) => sum + (log.total_minutes ?? 0),
    0
  );

  const totalEntries = logs.reduce(
    (sum, log) => sum + (log.daily_log_items?.length ?? 0),
    0
  );

  const completedEntries = logs.reduce(
    (sum, log) =>
      sum +
      (log.daily_log_items ?? []).filter(
        (item) => item.completion_status === "completed"
      ).length,
    0
  );

  const workingDays = logs.filter(
    (log) =>
      log.attendance_status === "working" ||
      log.attendance_status === "work_from_home" ||
      log.attendance_status === "half_day"
  ).length;

  const backParams = new URLSearchParams();
  backParams.set("range", dateRange.range);

  if (dateRange.range === "custom") {
    backParams.set("from", dateRange.from);
    backParams.set("to", dateRange.to);
  }

  const rangeLinks = {
    today: `/super-admin/employees/${id}?range=today`,
    week: `/super-admin/employees/${id}?range=week`,
    month: `/super-admin/employees/${id}?range=month`,
  };

  return (
    <div className="grid super-admin-employee-page">
      <div className="super-admin-employee-topbar">
        <Link
          href={`/super-admin/dashboard?${backParams.toString()}`}
          className="super-admin-back-link"
        >
          <ArrowLeft size={17} />
          Company Overview
        </Link>
      </div>

      <section className="card super-admin-employee-profile">
        <div className="super-admin-employee-avatar">
          <UserRound size={30} />
        </div>

        <div className="super-admin-employee-profile-copy">
          <span className="eyebrow">Employee activity</span>
          <h1>{employee.full_name}</h1>

          <div className="super-admin-employee-meta">
            <span>{employee.email}</span>
            <span aria-hidden="true">•</span>
            <span>
              {employee.job_title?.trim() || formatText(employee.role)}
            </span>
            <span aria-hidden="true">•</span>
            <span>
              {employee.team_id
                ? teamMap.get(employee.team_id) ?? "Unknown team"
                : "No team"}
            </span>
          </div>
        </div>

        <span
          className={`badge ${
            employee.is_active ? "status-completed" : "status-rejected"
          }`}
        >
          {employee.is_active ? "Active" : "Inactive"}
        </span>
      </section>

      <section className="super-admin-range-tabs">
        <Link
          href={rangeLinks.today}
          className={dateRange.range === "today" ? "active" : ""}
        >
          Today
        </Link>

        <Link
          href={rangeLinks.week}
          className={dateRange.range === "week" ? "active" : ""}
        >
          Last 7 days
        </Link>

        <Link
          href={rangeLinks.month}
          className={dateRange.range === "month" ? "active" : ""}
        >
          This month
        </Link>
      </section>

      <form className="card super-admin-employee-date-filter">
        <input type="hidden" name="range" value="custom" />

        <label className="label">
          From
          <input
            className="input"
            type="date"
            name="from"
            defaultValue={dateRange.from}
          />
        </label>

        <label className="label">
          To
          <input
            className="input"
            type="date"
            name="to"
            defaultValue={dateRange.to}
          />
        </label>

        <button className="btn" type="submit">
          Apply custom dates
        </button>
      </form>

      <section className="stats-grid">
        <Metric
          label="Total hours"
          value={formatMinutes(totalMinutes)}
          icon={<Clock3 size={23} />}
        />

        <Metric
          label="Days logged"
          value={String(logs.length)}
          icon={<CalendarDays size={23} />}
        />

        <Metric
          label="Working days"
          value={String(workingDays)}
          icon={<Layers3 size={23} />}
        />

        <Metric
          label="Completed entries"
          value={`${completedEntries}/${totalEntries}`}
          icon={<FileText size={23} />}
        />
      </section>

      <section className="card super-admin-section">
        <div className="section-heading">
          <div>
            <h2>Daily work history</h2>
            <p className="muted">
              {dateRange.from} to {dateRange.to}
            </p>
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="empty">
            No daily work logs were found for this employee in the selected period.
          </div>
        ) : (
          <div className="super-admin-log-list">
            {logs.map((log) => {
              const items = log.daily_log_items ?? [];

              return (
                <article className="super-admin-log-card" key={log.id}>
                  <div className="super-admin-log-head">
                    <div>
                      <strong>{log.work_date}</strong>

                      <div className="super-admin-log-badges">
                        <span className="badge">
                          {formatText(log.attendance_status)}
                        </span>

                        <span className="badge">
                          {formatText(log.status)}
                        </span>
                      </div>
                    </div>

                    <div className="super-admin-day-total">
                      <Clock3 size={17} />
                      <strong>
                        {formatMinutes(log.total_minutes ?? 0)}
                      </strong>
                    </div>
                  </div>

                  {(log.summary || log.remarks) && (
                    <div className="super-admin-log-summary">
                      {log.summary && (
                        <div>
                          <span>Summary</span>
                          <p>{log.summary}</p>
                        </div>
                      )}

                      {log.remarks && (
                        <div>
                          <span>Remarks</span>
                          <p>{log.remarks}</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="tablewrap">
                    <table className="table super-admin-employee-work-table">
                      <thead>
                        <tr>
                          <th>Work type</th>
                          <th>Related task</th>
                          <th>Description</th>
                          <th>Time</th>
                          <th>Count</th>
                          <th>Status</th>
                        </tr>
                      </thead>

                      <tbody>
                        {items.map((item) => (
                          <tr key={item.id}>
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

                            <td className="super-admin-description">
                              {item.description}
                            </td>

                            <td>
                              {formatMinutes(item.duration_minutes ?? 0)}
                            </td>

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
                                {formatText(
                                  item.completion_status ?? "in_progress"
                                )}
                              </span>
                            </td>
                          </tr>
                        ))}

                        {items.length === 0 && (
                          <tr>
                            <td colSpan={6}>
                              <div className="empty">
                                No item-level work entries in this log.
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <span className="stat-label">{label}</span>
      <div className="stat-value">{value}</div>
    </div>
  );
}