import { requireRole } from "@/lib/auth";
import { reviewDailyLog } from "./actions";

type TeamDailyLogsProps = {
  searchParams: Promise<{
    date?: string;
    error?: string;
    updated?: string;
  }>;
};

function formatDuration(minutes: number | null | undefined): string {
  const safeMinutes =
    typeof minutes === "number" && Number.isFinite(minutes)
      ? Math.max(0, minutes)
      : 0;
  return `${Math.floor(safeMinutes / 60)}h ${safeMinutes % 60}m`;
}

function formatStatus(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ") : "Unknown";
}

function getSingleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function TeamDailyLogs({ searchParams }: TeamDailyLogsProps) {
  const { supabase, profile } = await requireRole([
    "admin",
    "team_lead",
    "reviewer",
  ]);

  const params = await searchParams;
  const selectedDate = params.date ?? new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("daily_logs")
    .select(`
      id,
      work_date,
      attendance_status,
      status,
      total_minutes,
      remarks,
      review_comment,
      employee_id,
      created_at,
      profiles!daily_logs_employee_id_fkey(full_name,team_id,manager_id),
      daily_log_items(
        id,
        description,
        duration_minutes,
        quantity,
        unit,
        work_categories(name)
      )
    `)
    .eq("work_date", selectedDate)
    .order("created_at", { ascending: true });

  const allLogs = data ?? [];
  const visibleLogs = allLogs.filter((log: any) => {
    const employeeProfile = getSingleRelation<any>(log.profiles);
    if (profile.role === "admin") return true;
    if (profile.role === "team_lead" && profile.team_id) {
      return employeeProfile?.team_id === profile.team_id;
    }
    if (profile.role === "reviewer") {
      return employeeProfile?.manager_id === profile.id;
    }
    return false;
  });

  return (
    <div className="grid">
      <div>
        <h1>Daily Logs to Check</h1>
        <p className="muted">
          Review employee day-wise work and request corrections when needed.
        </p>
      </div>

      {params.updated && <p className="notice">Daily-log review saved.</p>}
      {params.error && <p className="error">{params.error}</p>}
      {error && (
        <p className="error">Unable to load daily logs: {error.message}</p>
      )}

      <form className="card actions">
        <input
          className="input"
          style={{ maxWidth: 220 }}
          type="date"
          name="date"
          defaultValue={selectedDate}
        />
        <button className="btn" type="submit">View date</button>
      </form>

      <div className="card tablewrap">
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Attendance</th>
              <th>Work entries</th>
              <th>Total</th>
              <th>Remarks</th>
              <th>Status</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {visibleLogs.map((log: any) => {
              const employeeProfile = getSingleRelation<any>(log.profiles);
              const items = Array.isArray(log.daily_log_items)
                ? log.daily_log_items
                : [];
              const canReview =
                log.status === "submitted" || log.status === "changes_requested";

              return (
                <tr key={log.id}>
                  <td><strong>{employeeProfile?.full_name ?? "Unknown employee"}</strong></td>
                  <td>{formatStatus(log.attendance_status)}</td>
                  <td>
                    {items.length > 0 ? items.map((item: any) => {
                      const category = getSingleRelation<any>(item.work_categories);
                      return (
                        <div className="workline" key={item.id}>
                          <strong>{category?.name ?? "Other"}</strong>
                          {" — "}{item.description || "No description"}
                          {" · "}{formatDuration(item.duration_minutes)}
                          {item.quantity != null
                            ? ` · ${item.quantity} ${item.unit ?? ""}`
                            : ""}
                        </div>
                      );
                    }) : <span className="muted">No work entries</span>}
                  </td>
                  <td>{formatDuration(log.total_minutes)}</td>
                  <td>
                    {log.remarks || "—"}
                    {log.review_comment && (
                      <div className="error">
                        <strong>Review:</strong> {log.review_comment}
                      </div>
                    )}
                  </td>
                  <td><span className="badge">{formatStatus(log.status)}</span></td>
                  <td>
                    {canReview ? (
                      <form action={reviewDailyLog} className="form compact">
                        <input type="hidden" name="id" value={log.id} />
                        <textarea
                          className="textarea compact"
                          name="review_comment"
                          placeholder="Correction reason when requesting changes"
                        />
                        <div className="actions">
                          <button
                            className="btn success"
                            name="decision"
                            value="checked"
                            type="submit"
                          >
                            Mark checked
                          </button>
                          <button
                            className="btn warning"
                            name="decision"
                            value="changes_requested"
                            type="submit"
                          >
                            Request changes
                          </button>
                        </div>
                      </form>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}

            {!error && visibleLogs.length === 0 && (
              <tr><td colSpan={7}>No logs submitted for this date.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
