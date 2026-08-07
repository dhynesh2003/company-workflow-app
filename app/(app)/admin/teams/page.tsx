import Link from "next/link";

import {
  ArrowUpRight,
  Plus,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";

import { FlashMessage } from "@/components/flash-message";
import { requireRole } from "@/lib/auth";

import { createTeam } from "./actions";

type Team = {
  id: string;
  name: string;
  description: string | null;
  team_lead_id: string | null;
  is_active: boolean;
  members: { count: number }[] | null;
  lead: { id: string; full_name: string } | null;
  tasks: { count: number }[] | null;
};

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const { supabase, profile } = await requireRole(["admin", "team_lead"]);

  let teamsQuery = supabase
    .from("teams")
    .select(`
      id,
      name,
      description,
      team_lead_id,
      is_active,
      members:profiles!profiles_team_id_fkey(count),
      tasks(count),
      lead:profiles!teams_team_lead_id_fkey(id,full_name)
    `)
    .eq("organization_id", profile.organization_id)
    .order("name");

  if (profile.role === "team_lead") {
    teamsQuery = teamsQuery.or(
      `id.eq.${profile.team_id},team_lead_id.eq.${profile.id}`
    );
  }

  const [teamsResult, peopleResult] = await Promise.all([
    teamsQuery,
    supabase
      .from("profiles")
      .select("id,full_name,email,role,team_id,is_active")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true)
      .order("full_name"),
  ]);

  if (teamsResult.error) throw new Error(teamsResult.error.message);
  if (peopleResult.error) throw new Error(peopleResult.error.message);

  const teams = (teamsResult.data ?? []) as unknown as Team[];
  const people = peopleResult.data ?? [];

  const leadOptions = people.filter((person) =>
    ["team_lead", "admin"].includes(person.role)
  );

  const memberOptions = people.filter((person) =>
    ["employee", "reviewer"].includes(person.role)
  );

  const totalMembers = teams.reduce(
    (sum, team) => sum + (team.members?.[0]?.count ?? 0),
    0
  );

  const unassigned = memberOptions.filter((person) => !person.team_id).length;

  return (
    <div className="grid">
      <div className="page-head">
        <div>
          <h1>Teams</h1>
          <p>Manage operational groups, team leads and members.</p>
        </div>
      </div>

      {params.error && (
        <FlashMessage type="error">{params.error}</FlashMessage>
      )}

      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon stat-icon-blue">
            <UsersRound size={24} />
          </div>
          <span className="stat-label">Visible teams</span>
          <div className="stat-value">{teams.length}</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon stat-icon-green">
            <UserRound size={24} />
          </div>
          <span className="stat-label">Team members</span>
          <div className="stat-value">{totalMembers}</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon stat-icon-amber">
            <ShieldCheck size={24} />
          </div>
          <span className="stat-label">Unassigned people</span>
          <div className="stat-value">{unassigned}</div>
        </div>
      </section>

      {profile.role === "admin" && (
        <section className="card team-create-card">
          <div className="section-heading">
            <div>
              <h2>Create team</h2>
              <p className="muted">
                Create the group, choose its lead and optionally add initial members.
              </p>
            </div>
            <div className="section-heading-icon">
              <Plus size={22} />
            </div>
          </div>

          <form action={createTeam} className="form">
            <div className="grid grid2">
              <label className="label">
                Team name
                <input className="input" name="name" required />
              </label>

              <label className="label">
                Team lead
                <select className="select" name="team_lead_id" defaultValue="">
                  <option value="">Choose later</option>
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
                placeholder="What work does this team handle?"
              />
            </label>

            <fieldset className="team-member-picker">
              <legend>Initial members</legend>
              <p className="muted">
                Members already assigned to another team will be moved.
              </p>

              <div className="team-member-options">
                {memberOptions.map((member) => (
                  <label className="team-member-option" key={member.id}>
                    <input type="checkbox" name="member_ids" value={member.id} />
                    <span>
                      <strong>{member.full_name}</strong>
                      <small>
                        {member.role.replaceAll("_", " ")}
                        {member.team_id ? " · currently assigned" : " · unassigned"}
                      </small>
                    </span>
                  </label>
                ))}

                {memberOptions.length === 0 && (
                  <p className="muted">No eligible employees are available.</p>
                )}
              </div>
            </fieldset>

            <button className="btn" type="submit">
              <Plus size={18} />
              Create team
            </button>
          </form>
        </section>
      )}

      <section className="grid grid2">
        {teams.map((team) => (
          <article className="card team-card" key={team.id}>
            <div className="team-card-top">
              <div>
                <div className="team-status-row">
                  <span
                    className={`team-status-dot ${
                      team.is_active ? "active" : "inactive"
                    }`}
                  />
                  <span>{team.is_active ? "Active" : "Inactive"}</span>
                </div>
                <h2>{team.name}</h2>
              </div>

              <Link
                href={`/admin/teams/${team.id}`}
                className="dashboard-open-icon"
                aria-label={`Open ${team.name}`}
              >
                <ArrowUpRight size={20} />
              </Link>
            </div>

            <p className="muted team-description">
              {team.description || "No description has been added."}
            </p>

            <div className="team-card-facts">
              <div>
                <span>Team lead</span>
                <strong>{team.lead?.full_name || "Not assigned"}</strong>
              </div>
              <div>
                <span>Members</span>
                <strong>{team.members?.[0]?.count ?? 0}</strong>
              </div>
              <div>
                <span>Tasks</span>
                <strong>{team.tasks?.[0]?.count ?? 0}</strong>
              </div>
            </div>

            <Link href={`/admin/teams/${team.id}`} className="btn secondary">
              Manage team
            </Link>
          </article>
        ))}

        {teams.length === 0 && (
          <section className="card">
            <h2>No teams yet</h2>
            <p className="muted">
              Create the first team and connect a team lead and employees.
            </p>
          </section>
        )}
      </section>
    </div>
  );
}
