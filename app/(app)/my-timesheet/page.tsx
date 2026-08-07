import Link from "next/link";
import { requireProfile } from "@/lib/auth";

function duration(minutes: number | null | undefined) {
  const safe = typeof minutes === "number" ? Math.max(0, minutes) : 0;
  return `${Math.floor(safe / 60)}h ${safe % 60}m`;
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function MyTimesheet({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { supabase, profile } = await requireProfile();
  const params = await searchParams;
  const { data, error } = await supabase
    .from("daily_logs")
    .select(`
      id,
      work_date,
      attendance_status,
      status,
      total_minutes,
      remarks,
      daily_log_items(
        id,
        description,
        quantity,
        unit,
        work_categories(name)
      )
    `)
    .eq("employee_id", profile.id)
    .order("work_date", { ascending: false })
    .limit(60);

  const logs = data ?? [];

  return (
    <div>
      <h1>My Timesheet</h1>
      <p className="muted">Your daily records replace individual spreadsheet tabs.</p>
      {params.saved && <p className="notice">Daily log saved as {params.saved}.</p>}
      {error && <p className="error">Unable to load your timesheet: {error.message}</p>}

      <div className="card tablewrap">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Attendance</th>
              <th>Work completed</th>
              <th>Total time</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log: any) => {
              const items = Array.isArray(log.daily_log_items)
                ? log.daily_log_items
                : [];
              return (
                <tr key={log.id}>
                  <td>{new Date(`${log.work_date}T00:00:00`).toLocaleDateString()}</td>
                  <td>{log.attendance_status?.replaceAll("_", " ") ?? "—"}</td>
                  <td>
                    {items.slice(0, 3).map((item: any) => {
                      const category = relationOne<any>(item.work_categories);
                      return (
                        <div key={item.id ?? item.description}>
                          <strong>{category?.name ?? "Other"}:</strong>{" "}
                          {item.description}
                          {item.quantity != null
                            ? ` (${item.quantity} ${item.unit || ""})`
                            : ""}
                        </div>
                      );
                    })}
                    {items.length === 0 && <span className="muted">No entries</span>}
                  </td>
                  <td>{duration(log.total_minutes)}</td>
                  <td>
                    <span
                      className={`badge ${
                        log.status === "checked"
                          ? "progress"
                          : log.status === "changes_requested"
                            ? "blocked"
                            : ""
                      }`}
                    >
                      {log.status?.replaceAll("_", " ") ?? "unknown"}
                    </span>
                  </td>
                  <td>
                    <Link className="btn secondary" href={`/daily-log/new?date=${log.work_date}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
            {!error && logs.length === 0 && (
              <tr><td colSpan={6}>No daily logs yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
