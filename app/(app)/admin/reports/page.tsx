import { requireRole } from "@/lib/auth";

type TeamOption = {
  id: string;
  name: string | null;
};

type EmployeeOption = {
  id: string;
  full_name: string | null;
  team_id: string | null;
};

type RelatedProfile = {
  full_name: string | null;
  team_id: string | null;
};

type WorkCategory = {
  name: string | null;
};

type DailyLogItem = {
  id: string | null;
  description: string;
  duration_minutes: number | null;
  quantity: number | null;
  unit: string | null;
  work_categories:
    | WorkCategory
    | WorkCategory[]
    | null;
};

type DailyLogRow = {
  id: string;
  work_date: string;
  attendance_status: string | null;
  status: string | null;
  total_minutes: number | null;
  employee_id: string;
  profiles:
    | RelatedProfile
    | RelatedProfile[]
    | null;
  daily_log_items: DailyLogItem[] | null;
};

type ReportsSearchParams = {
  from?: string;
  to?: string;
  team?: string;
  employee?: string;
};

function getFirstRelation<T>(
  value: T | T[] | null | undefined
): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<ReportsSearchParams>;
}) {
  const { supabase, profile } =
    await requireRole(["admin"]);

  const params = await searchParams;

  // A server-rendered report needs request-time date defaults.
  const currentDate = new Date();
  const sixDaysAgo = new Date(currentDate);

  sixDaysAgo.setUTCDate(
    currentDate.getUTCDate() - 6
  );

  const to =
    params.to ??
    currentDate.toISOString().slice(0, 10);

  const from =
    params.from ??
    sixDaysAgo.toISOString().slice(0, 10);

  const [
    { data: teams },
    { data: people },
    { data: logs, error },
  ] = await Promise.all([
    supabase
      .from("teams")
      .select("id,name")
      .eq(
        "organization_id",
        profile.organization_id
      )
      .order("name"),

    supabase
      .from("profiles")
      .select("id,full_name,team_id")
      .eq(
        "organization_id",
        profile.organization_id
      )
      .order("full_name"),

    supabase
      .from("daily_logs")
      .select(`
        id,
        work_date,
        attendance_status,
        status,
        total_minutes,
        employee_id,
        profiles!daily_logs_employee_id_fkey(
          full_name,
          team_id
        ),
        daily_log_items(
          id,
          description,
          duration_minutes,
          quantity,
          unit,
          work_categories(name)
        )
      `)
      .eq(
        "organization_id",
        profile.organization_id
      )
      .gte("work_date", from)
      .lte("work_date", to)
      .order("work_date"),
  ]);

  const teamOptions =
    (teams ?? []) as TeamOption[];

  const employeeOptions =
    (people ?? []) as EmployeeOption[];

  let rows =
    (logs ?? []) as unknown as DailyLogRow[];

  if (params.team) {
    rows = rows.filter((row) => {
      const employeeProfile =
        getFirstRelation(row.profiles);

      return (
        employeeProfile?.team_id ===
        params.team
      );
    });
  }

  if (params.employee) {
    rows = rows.filter(
      (row) =>
        row.employee_id === params.employee
    );
  }

  const queryString = new URLSearchParams({
    from,
    to,
    ...(params.team
      ? { team: params.team }
      : {}),
    ...(params.employee
      ? { employee: params.employee }
      : {}),
  });

  const totalMinutes = rows.reduce(
    (sum, row) =>
      sum + (row.total_minutes ?? 0),
    0
  );

  const submittedCount = rows.filter(
    (row) => row.status === "submitted"
  ).length;

  const checkedCount = rows.filter(
    (row) => row.status === "checked"
  ).length;

  return (
    <div className="grid">
      <div>
        <h1>Reports &amp; Exports</h1>

        <p className="muted">
          Daily, weekly and monthly work
          reporting.
        </p>
      </div>

      {error && (
        <p className="error">
          Unable to load report:{" "}
          {error.message}
        </p>
      )}

      <form className="card form">
        <div className="grid grid4">
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
                params.team ?? ""
              }
            >
              <option value="">
                All teams
              </option>

              {teamOptions.map((team) => (
                <option
                  key={team.id}
                  value={team.id}
                >
                  {team.name ?? "Unnamed team"}
                </option>
              ))}
            </select>
          </label>

          <label className="label">
            Employee
            <select
              className="select"
              name="employee"
              defaultValue={
                params.employee ?? ""
              }
            >
              <option value="">
                All employees
              </option>

              {employeeOptions.map(
                (employee) => (
                  <option
                    key={employee.id}
                    value={employee.id}
                  >
                    {employee.full_name ??
                      "Unnamed employee"}
                  </option>
                )
              )}
            </select>
          </label>
        </div>

        <div className="actions">
          <button className="btn">
            Apply filters
          </button>

          <a
            className="btn secondary"
            href={`/api/reports/export?${queryString.toString()}&format=csv`}
          >
            Export CSV
          </a>

          <a
            className="btn secondary"
            href={`/api/reports/export?${queryString.toString()}&format=xlsx`}
          >
            Export XLSX
          </a>
        </div>
      </form>

      <section className="grid grid4">
        <Metric
          label="Logs"
          value={rows.length}
        />

        <Metric
          label="Total hours"
          value={Math.round(
            totalMinutes / 60
          )}
        />

        <Metric
          label="Submitted"
          value={submittedCount}
        />

        <Metric
          label="Checked"
          value={checkedCount}
        />
      </section>

      <section className="card tablewrap">
        <table className="table logtable">
          <thead>
            <tr>
              <th>Date</th>
              <th>Employee</th>
              <th>Attendance</th>
              <th>Work</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const employeeProfile =
                getFirstRelation(
                  row.profiles
                );

              const minutes =
                row.total_minutes ?? 0;

              const attendanceLabel = (
                row.attendance_status ??
                "not_marked"
              ).replaceAll("_", " ");

              const statusLabel = (
                row.status ?? "draft"
              ).replaceAll("_", " ");

              return (
                <tr key={row.id}>
                  <td>{row.work_date}</td>

                  <td>
                    {employeeProfile?.full_name ??
                      "—"}
                  </td>

                  <td>{attendanceLabel}</td>

                  <td>
                    {(
                      row.daily_log_items ??
                      []
                    ).map(
                      (item, index) => {
                        const category =
                          getFirstRelation(
                            item.work_categories
                          );

                        return (
                          <div
                            className="workline"
                            key={
                              item.id ??
                              `${row.id}-${index}`
                            }
                          >
                            <strong>
                              {category?.name ??
                                "Other"}
                            </strong>
                            {" — "}
                            {item.description}
                          </div>
                        );
                      }
                    )}
                  </td>

                  <td>
                    {Math.floor(
                      minutes / 60
                    )}
                    h {minutes % 60}m
                  </td>

                  <td>{statusLabel}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="card">
      <span className="muted">
        {label}
      </span>

      <div className="metric">
        {value}
      </div>
    </div>
  );
}