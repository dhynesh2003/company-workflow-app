"use client";

import { useMemo, useState } from "react";

type TeamOption = {
  id: string;
  name: string;
};

type PersonOption = {
  id: string;
  full_name: string;
  job_title: string | null;
  role: string;
  team_id: string | null;
};

export function TeamTaskSelectors({
  teams,
  assignees,
  lockedTeamId,
}: {
  teams: TeamOption[];
  assignees: PersonOption[];
  lockedTeamId?: string | null;
}) {
  const initialTeamId = lockedTeamId ?? "";
  const [teamId, setTeamId] = useState(initialTeamId);

  const visibleAssignees = useMemo(
    () =>
      assignees.filter(
        (person) => !teamId || person.team_id === teamId
      ),
    [assignees, teamId]
  );

  return (
    <div className="grid grid2">
      <label className="label">
        Team
        <select
          className="select"
          name="selected_team_id"
          value={teamId}
          onChange={(event) => setTeamId(event.target.value)}
          disabled={Boolean(lockedTeamId)}
          required
        >
          <option value="">Choose team</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        {lockedTeamId && (
          <input type="hidden" name="selected_team_id" value={lockedTeamId} />
        )}
      </label>

      <label className="label">
        Assign to
        <select
          className="select"
          name="assigned_to"
          defaultValue=""
          required
        >
          <option value="" disabled>
            Choose employee
          </option>
          {visibleAssignees.map((person) => (
            <option key={person.id} value={person.id}>
              {person.full_name} — {person.job_title || person.role.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        {teamId && visibleAssignees.length === 0 && (
          <span className="error">No eligible employees are assigned to this team.</span>
        )}
      </label>
    </div>
  );
}
