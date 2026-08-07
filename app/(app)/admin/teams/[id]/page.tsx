import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ArrowLeft,
  ClipboardList,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";

import { FlashMessage } from "@/components/flash-message";
import { requireRole } from "@/lib/auth";

import { saveMembers, updateTeam } from "../actions";

type TeamPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
};

export default async function TeamDetailsPage({
  params,
  searchParams,
}: TeamPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase, profile } = await requireRole(["admin", "team_lead"]);

  const [teamResult, peopleResult, taskResult] = await Promise.all([
    supabase
      .from("teams")
      .select(`
        id,
        name,
        description,
        team_lead_id,
        is_active,
        lead:profiles!teams_team_lead_id_fkey(id,full_name,email,role)
      `)
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
      .maybeSingle(),

    supabase
      .from("profiles")
      .select("id,full_name,email,job_title,role,team_id,is_active")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true)
      .order("full_name"),

    supabase
      .from("tasks")
      .select("id,title,status,priority,assigned_to,due_date")
      .eq("organization_id", profile.organization_id)
      .eq("team_id", id)
      .order("due_date", { ascending: true }),
  ]);

  if (teamResult.error) throw new Error(teamResult.error.message);
  if (peopleResult.error) throw new Error(peopleResult.error.message);
  if (taskResult.error) throw new Error(taskResult.error.message);
  if (!teamResult.data) notFound();

  const team = teamResult.data;
  const people = peopleResult.data ?? [];
  const tasks = taskResult.data ?? [];

  const canManage =
    profile.role === "admin" ||
    profile.team_id === id ||
    team.team_lead_id === profile.id;

  if (!canManage) notFound();

  const members = people.filter((person) => person.team_id === id);
  const eligibleMembers = people.filter((person) =>
    ["employee", "reviewer"].includes(person.role)
  );
  const leadOptions = people.filter((person) =>
    ["team_lead", "admin"].includes(person.role)
  );

  const activeTasks = tasks.filter(
    (task) => !["completed", "cancelled"].includes(task.status)
  ).length;
  const blockedTasks = tasks.filter((task) => task.status === "blocked").length;
  const completedTasks = tasks.filter((task) => task.status === "completed").length;

  return (
    <div className="grid">
      <div className="page-head">
        <div>
          <Link href="/admin/teams" className="review-back-link">
            <ArrowLeft size={17} />
            All teams
          </Link>
          <h1>{team.name}</h1>
          <p>{team.description || "No team description has been added."}</p>
        </div>
      </div>

      {query.error && (
        <FlashMessage type="error">{query.error}</FlashMessage>
      )}
      {query.saved && (
        <FlashMessage type="success">Team changes saved successfully.</FlashMessage>
      )}

      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon stat-icon-blue"><UsersRound size={24} /></div>
          <span className="stat-label">Members</span>
          <div className="stat-value">{members.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-green"><ClipboardList size={24} /></div>
          <span className="stat-label">Active tasks</span>
          <div className="stat-value">{activeTasks}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-amber"><ShieldCheck size={24} /></div>
          <span className="stat-label">Completed</span>
          <div className="stat-value">{completedTasks}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon stat-icon-red"><ClipboardList size={24} /></div>
          <span className="stat-label">Blocked</span>
          <div className="stat-value">{blockedTasks}</div>
        </div>
      </section>

      {profile.role === "admin" && (
        <section className="card">
          <div className="section-heading">
            <div>
              <h2>Team settings</h2>
              <p className="muted">
                Edit the name, description, lead and active status.
              </p>
            </div>
          </div>

          <form action={updateTeam} className="form">
            <input type="hidden" name="team_id" value={team.id} />

            <div className="grid grid2">
              <label className="label">
                Team name
                <input
                  className="input"
                  name="name"
                  defaultValue={team.name}
                  required
                />
              </label>

              <label className="label">
                Team lead
                <select
                  className="select"
                  name="team_lead_id"
                  defaultValue={team.team_lead_id ?? ""}
                >
                  <option value="">No team lead</option>
                  {leadOptions.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.full_name} — {lead.role.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="label">
              Description
              <textarea
                className="textarea"
                name="description"
                defaultValue={team.description ?? ""}
              />
            </label>

            <label className="check">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={team.is_active}
              />
              Team is active
            </label>

            <button className="btn" type="submit">Save team settings</button>
          </form>
        </section>
      )}

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Manage members</h2>
            <p className="muted">
              Admins and this team’s lead can add or remove employees.
            </p>
          </div>
          <div className="section-heading-icon"><UserRound size={22} /></div>
        </div>

        <form action={saveMembers} className="form">
          <input type="hidden" name="team_id" value={team.id} />

          <div className="team-member-options">
            {eligibleMembers.map((member) => (
              <label className="team-member-option" key={member.id}>
                <input
                  type="checkbox"
                  name="member_ids"
                  value={member.id}
                  defaultChecked={member.team_id === team.id}
                />
                <span>
                  <strong>{member.full_name}</strong>
                  <small>
                    {member.job_title || member.role.replaceAll("_", " ")}
                    {member.team_id && member.team_id !== team.id
                      ? " · assigned to another team"
                      : ""}
                  </small>
                </span>
              </label>
            ))}
          </div>

          <button className="btn" type="submit">Save team members</button>
        </form>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Current members</h2>
            <p className="muted">People currently connected to this team.</p>
          </div>
        </div>

        <div className="team-people-list">
          {members.map((member) => (
            <div className="team-person-row" key={member.id}>
              <div className="sidebar-avatar">
                {member.full_name.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <strong>{member.full_name}</strong>
                <span>
                  {member.job_title || member.role.replaceAll("_", " ")}
                </span>
              </div>
            </div>
          ))}

          {members.length === 0 && (
            <p className="muted">No members are assigned to this team.</p>
          )}
        </div>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Team tasks</h2>
            <p className="muted">Current and completed tasks assigned to the team.</p>
          </div>
        </div>

        <div className="due-task-list">
          {tasks.slice(0, 12).map((task) => (
            <article className="due-task-item" key={task.id}>
              <div className="due-task-main">
                <div className="due-task-icon"><ClipboardList size={20} /></div>
                <div className="due-task-copy">
                  <strong>{task.title}</strong>
                  <div className="due-task-meta">
                    <span className={`badge status-${task.status}`}>
                      {task.status.replaceAll("_", " ")}
                    </span>
                    <span className={`priority priority-${task.priority}`}>
                      {task.priority}
                    </span>
                  </div>
                </div>
              </div>
              <Link
                className="dashboard-open-icon"
                href={`/tasks/${task.id}`}
                aria-label={`Open ${task.title}`}
              >
                →
              </Link>
            </article>
          ))}

          {tasks.length === 0 && (
            <p className="muted">No tasks are connected to this team yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
