import { DraftForm } from "@/components/draft-form";
import { FlashMessage } from "@/components/flash-message";
import { SubmitButton } from "@/components/submit-button";
import { TeamTaskSelectors } from "@/components/team-task-selectors";
import { requireRole } from "@/lib/auth";

import { createTask } from "./actions";

export default async function NewTask({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { supabase, profile } = await requireRole(["admin", "team_lead"]);
  const params = await searchParams;

  let peopleQuery = supabase
    .from("profiles")
    .select("id,full_name,job_title,team_id,role,is_active")
    .eq("organization_id", profile.organization_id)
    .eq("is_active", true)
    .order("full_name");

  let teamsQuery = supabase
    .from("teams")
    .select("id,name")
    .eq("organization_id", profile.organization_id)
    .eq("is_active", true)
    .order("name");

  if (profile.role === "team_lead") {
    if (!profile.team_id) {
      throw new Error("Your team-lead account is not assigned to a team.");
    }

    peopleQuery = peopleQuery.eq("team_id", profile.team_id);
    teamsQuery = teamsQuery.eq("id", profile.team_id);
  }

  const [peopleResult, teamsResult] = await Promise.all([
    peopleQuery,
    teamsQuery,
  ]);

  const people = peopleResult.data ?? [];
  const teams = teamsResult.data ?? [];

  const assignees = people.filter(
    (person) =>
      ["employee", "reviewer"].includes(person.role) &&
      person.id !== profile.id
  );

  const reviewers = people.filter((person) =>
    ["reviewer", "team_lead", "admin"].includes(person.role)
  );

  if (
    profile.role === "team_lead" &&
    !reviewers.some((person) => person.id === profile.id)
  ) {
    reviewers.push({
      id: profile.id,
      full_name: profile.full_name,
      job_title: profile.job_title,
      team_id: profile.team_id,
      role: profile.role,
      is_active: true,
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid">
      <div className="page-head">
        <div>
          <h1>Assign Task</h1>
          <p>Choose the team, employee, deadline and approval chain.</p>
        </div>
      </div>

      {params.error && (
        <FlashMessage type="error">{params.error}</FlashMessage>
      )}

      {peopleResult.error && (
        <FlashMessage type="error">
          Unable to load people: {peopleResult.error.message}
        </FlashMessage>
      )}

      {teamsResult.error && (
        <FlashMessage type="error">
          Unable to load teams: {teamsResult.error.message}
        </FlashMessage>
      )}

      <section className="card">
        <DraftForm
          action={createTask}
          className="form"
          storageKey={`new-task-${profile.id}`}
          statusLabel="Task draft"
        >
          <label className="label">
            Task title
            <input className="input" name="title" required />
          </label>

          <label className="label">
            Description
            <textarea className="textarea" name="description" required />
          </label>

          <TeamTaskSelectors
            teams={teams}
            assignees={assignees}
            lockedTeamId={profile.role === "team_lead" ? profile.team_id : null}
          />

          <label className="label">
            Priority
            <select className="select" name="priority" defaultValue="normal">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>

          <div className="grid grid2">
            <label className="label">
              Start date
              <input
                className="input"
                type="date"
                name="start_date"
                defaultValue={today}
                required
              />
            </label>

            <label className="label">
              Due date and time
              <input
                className="input"
                type="datetime-local"
                name="due_date"
                required
              />
            </label>
          </div>

          <label className="label">
            Expected output
            <textarea
              className="textarea"
              name="expected_output"
              placeholder="Describe the expected deliverable."
            />
          </label>

          <label className="label">
            Required evidence
            <textarea
              className="textarea"
              name="required_evidence"
              placeholder="Files, screenshots, links or measurements required."
            />
          </label>

          <div className="card subtle">
            <h2>Approval chain</h2>
            <p className="muted">
              Reviewer 1 is mandatory. The assignee cannot review their own work.
            </p>

            <div className="grid grid3">
              {[1, 2, 3].map((step) => (
                <label className="label" key={step}>
                  Reviewer {step}
                  {step === 1 ? " — required" : " — optional"}

                  <select
                    className="select"
                    name={`reviewer_${step}`}
                    required={step === 1}
                    defaultValue=""
                  >
                    <option value="" disabled={step === 1}>
                      {step === 1 ? "Choose first reviewer" : "No reviewer"}
                    </option>

                    {reviewers.map((reviewer) => (
                      <option key={reviewer.id} value={reviewer.id}>
                        {reviewer.full_name} — {reviewer.role.replaceAll("_", " ")}
                        {reviewer.id === profile.id ? " — You" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <SubmitButton
            pendingText="Assigning task..."
            disabled={!assignees.length || !reviewers.length || !teams.length}
          >
            Assign task
          </SubmitButton>
        </DraftForm>
      </section>
    </div>
  );
}
