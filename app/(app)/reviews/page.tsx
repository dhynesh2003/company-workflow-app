import Link from "next/link";
import { requireRole } from "@/lib/auth";

type ReviewQueueProps = {
  searchParams: Promise<{
    updated?: string;
  }>;
};

function getSingleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function ReviewQueue({ searchParams }: ReviewQueueProps) {
  const { supabase, profile } = await requireRole([
    "reviewer",
    "team_lead",
    "admin",
  ]);

  const params = await searchParams;

  let query = supabase
    .from("submission_approval_steps")
    .select(`
      id,
      status,
      step_order,
      reviewer_id,
      created_at,
      task_submissions!inner(
        id,
        version_number,
        submitted_at,
        status,
        completion_note,
        tasks!inner(
          id,
          title,
          priority,
          due_date,
          assigned_to,
          profiles!tasks_assigned_to_fkey(full_name)
        )
      )
    `)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (profile.role !== "admin") {
    query = query.eq("reviewer_id", profile.id);
  }

  const { data, error } = await query;
  const reviewRows = data ?? [];

  return (
    <div className="grid">
      <div>
        <h1>Review Queue</h1>
        <p className="muted">Work currently waiting for your decision.</p>
      </div>

      {params.updated && <p className="notice">Review decision saved.</p>}

      {error && (
        <p className="error">Unable to load review queue: {error.message}</p>
      )}

      <div className="card tablewrap">
        <table className="table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Employee</th>
              <th>Version</th>
              <th>Priority</th>
              <th>Submitted</th>
              <th>Step</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {reviewRows.map((row: any) => {
              const submission = getSingleRelation<any>(row.task_submissions);
              const task = getSingleRelation<any>(submission?.tasks);
              const employee = getSingleRelation<any>(task?.profiles);

              if (!submission || !task) return null;

              return (
                <tr key={row.id}>
                  <td><strong>{task.title}</strong></td>
                  <td>{employee?.full_name ?? "Unknown employee"}</td>
                  <td>Version {submission.version_number}</td>
                  <td><span className="badge">{task.priority}</span></td>
                  <td>
                    {submission.submitted_at
                      ? new Date(submission.submitted_at).toLocaleString()
                      : "—"}
                  </td>
                  <td>{row.step_order}</td>
                  <td>
                    <Link className="btn" href={`/reviews/${submission.id}`}>
                      Open review
                    </Link>
                  </td>
                </tr>
              );
            })}

            {!error && reviewRows.length === 0 && (
              <tr><td colSpan={7}>Nothing is waiting for review.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
