import Link from "next/link";
import type { ReactNode } from "react";

import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileCheck2,
  ListTodo,
  Plus,
  UsersRound,
} from "lucide-react";

import { requireProfile } from "@/lib/auth";

type DashboardTask = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  priority: string | null;
  assigned_to: string | null;
  team_id: string | null;
};

export default async function Dashboard() {
  const { supabase, profile } =
    await requireProfile();

  let taskQuery = supabase
    .from("tasks")
    .select(`
      id,
      title,
      status,
      due_date,
      priority,
      assigned_to,
      team_id
    `)
    .eq(
      "organization_id",
      profile.organization_id
    );

  if (
    ["employee", "reviewer"].includes(
      profile.role
    )
  ) {
    taskQuery = taskQuery.eq(
      "assigned_to",
      profile.id
    );
  }

  if (
    profile.role === "team_lead" &&
    profile.team_id
  ) {
    taskQuery = taskQuery.eq(
      "team_id",
      profile.team_id
    );
  }

  const today = new Date()
    .toISOString()
    .slice(0, 10);

  const [
    taskRes,
    reviewRes,
    logRes,
    noticeRes,
  ] = await Promise.all([
    taskQuery,

    supabase
      .from("submission_approval_steps")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq(
        "reviewer_id",
        profile.id
      )
      .eq("status", "pending"),

    supabase
      .from("daily_logs")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("work_date", today)
      .eq(
        "organization_id",
        profile.organization_id
      ),

    supabase
      .from("notifications")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq(
        "recipient_id",
        profile.id
      )
      .eq("is_read", false),
  ]);

  const tasks =
    (taskRes.data ??
      []) as DashboardTask[];

  

  const completed = tasks.filter(
    (task) =>
      task.status === "completed"
  ).length;

  const blocked = tasks.filter(
    (task) =>
      task.status === "blocked"
  ).length;

 const overdue = tasks.filter(
  (task) => {
    const dueDay =
      task.due_date?.slice(0, 10);

    return (
      Boolean(
        dueDay &&
          dueDay < today
      ) &&
      ![
        "completed",
        "cancelled",
      ].includes(task.status)
    );
  }
).length;

  const waiting = tasks.filter(
    (task) =>
      [
        "submitted",
        "under_review",
        "changes_requested",
      ].includes(task.status)
  ).length;

  const dueTasks = tasks
  .filter(
    (
      task
    ): task is DashboardTask & {
      due_date: string;
    } =>
      Boolean(task.due_date) &&
      !["completed", "cancelled"].includes(
        task.status
      )
  )
  .sort(
    (firstTask, secondTask) =>
      new Date(firstTask.due_date).getTime() -
      new Date(secondTask.due_date).getTime()
  )
  .slice(0, 8);

  const canAssign = [
    "admin",
    "team_lead",
  ].includes(profile.role);

  const canReview = [
    "admin",
    "team_lead",
    "reviewer",
  ].includes(profile.role);

  return (
    <div className="grid">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>

          <p>
            Live work, review and reporting
            status.
          </p>
        </div>

        <div className="quick-actions">
          {canAssign && (
            <Link
              href="/tasks/new"
              className="btn"
            >
              <Plus size={18} />
              Assign task
            </Link>
          )}

          {canReview && (
            <Link
              href="/reviews"
              className="btn secondary"
            >
              <FileCheck2 size={18} />
              Review queue
            </Link>
          )}

          <Link
            href="/daily-log/new"
            className="btn secondary"
          >
            <ClipboardList size={18} />
            Daily log
          </Link>
        </div>
      </div>
      

      {dueTasks.length > 0 && (
        <section className="card due-work-card due-alert-card">
          <div className="section-heading">
            <div>
              <h2>Due soon and overdue</h2>

              <p className="muted">
                Urgent work requiring your attention.
              </p>
            </div>

            <div
              className="section-heading-icon due-alert-icon"
              aria-hidden="true"
            >
              <AlertTriangle size={23} />
            </div>
          </div>

          <div className="due-task-list">
            {dueTasks.map((task) => {
              const statusLabel =
                task.status.replaceAll("_", " ");

              const priorityLabel =
                task.priority || "normal";

              return (
                <article
                  className="due-task-item due-task-alert"
                  key={task.id}
                >
                  <div className="due-task-main">
                    <div
                      className="due-task-icon due-alert-task-icon"
                      aria-hidden="true"
                    >
                      <AlertTriangle size={21} />
                    </div>

                    <div className="due-task-copy">
                      <strong className="due-task-title">
                        {task.title}
                      </strong>

                      <div className="due-task-meta">
                        <span
                          className={`badge status-${task.status}`}
                        >
                          {statusLabel}
                        </span>

                        <span
                          className={`priority priority-${priorityLabel}`}
                        >
                          {priorityLabel}
                        </span>

                        <span className="due-task-date due-alert-date">
                          {new Date(
                            task.due_date
                          ).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Link
                    href={`/tasks/${task.id}`}
                    className="dashboard-open-icon"
                    aria-label={`Open task ${task.title}`}
                    title={`Open task ${task.title}`}
                  >
                    <ArrowUpRight size={20} />
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="stats-grid">
        <Metric
          label="Visible tasks"
          value={tasks.length}
          icon={<ListTodo size={24} />}
          tone="blue"
        />

        <Metric
          label="Completed"
          value={completed}
          icon={
            <CheckCircle2 size={24} />
          }
          tone="green"
        />

        <Metric
          label="Waiting / changes"
          value={waiting}
          icon={<Clock3 size={24} />}
          tone="amber"
        />

        <Metric
          label="Blocked / overdue"
          value={blocked + overdue}
          icon={
            <AlertTriangle size={24} />
          }
          tone="red"
        />
      </section>

      <section className="grid grid3">
        <DashboardCard
          title="Reviews waiting"
          value={
            reviewRes.count ?? 0
          }
          href="/reviews"
          ariaLabel="Open review queue"
          icon={
            <FileCheck2 size={24} />
          }
        />

        <DashboardCard
          title="Unread notifications"
          value={
            noticeRes.count ?? 0
          }
          href="/notifications"
          ariaLabel="Open notifications"
          icon={<Bell size={24} />}
        />

        <DashboardCard
          title="Daily logs today"
          value={logRes.count ?? 0}
          href="/my-timesheet"
          ariaLabel="Open timesheet"
          icon={
            <UsersRound size={24} />
          }
        />
      </section>

    </div>
  );
}

type MetricProps = {
  label: string;
  value: number;
  icon: ReactNode;
  tone: string;
};

function Metric({
  label,
  value,
  icon,
  tone,
}: MetricProps) {
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

      <div className="stat-value">
        {value}
      </div>
    </div>
  );
}

type DashboardCardProps = {
  title: string;
  value: number;
  href: string;
  ariaLabel: string;
  icon: ReactNode;
};

function DashboardCard({
  title,
  value,
  href,
  ariaLabel,
  icon,
}: DashboardCardProps) {
  return (
    <div className="card dashboard-card">
      <div className="dashboard-card-top">
        <div className="dashboard-card-icon">
          {icon}
        </div>

        <Link
          href={href}
          className="dashboard-open-icon"
          aria-label={ariaLabel}
          title={ariaLabel}
        >
          <ArrowUpRight size={20} />
        </Link>
      </div>

      <h2>{title}</h2>

      <div className="metric">
        {value}
      </div>
    </div>
  );
}