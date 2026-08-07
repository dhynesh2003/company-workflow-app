import Link from "next/link";
import { Search } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { EmptyState } from "@/components/empty-state";
import { FlashMessage } from "@/components/flash-message";

type MyWorkProps = {
  searchParams: Promise<{ q?: string; status?: string; priority?: string; error?: string }>;
};

export default async function MyWork({ searchParams }: MyWorkProps) {
  const params = await searchParams;
  const { supabase, profile } = await requireProfile();

  let query = supabase
    .from("tasks")
    .select("id,title,priority,status,due_date,profiles!tasks_created_by_fkey(full_name)")
    .eq("assigned_to", profile.id)
    .order("due_date");

  if (params.status) query = query.eq("status", params.status);
  if (params.priority) query = query.eq("priority", params.priority);
  if (params.q?.trim()) query = query.ilike("title", `%${params.q.trim()}%`);

  const { data, error } = await query;
  const tasks = data ?? [];

  return (
    <div className="grid">
      <div className="page-head"><div><h1>My Work</h1><p>Tasks assigned directly to you.</p></div></div>
      {params.error && <FlashMessage type="error">{params.error}</FlashMessage>}
      {error && <FlashMessage type="error">Unable to load work: {error.message}</FlashMessage>}

      <form className="filter-bar" method="get">
        <label className="search-field"><Search size={18} /><input name="q" defaultValue={params.q ?? ""} placeholder="Search task title" /></label>
        <select name="status" defaultValue={params.status ?? ""}>
          <option value="">All statuses</option><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="submitted">Submitted</option><option value="changes_requested">Changes requested</option><option value="completed">Completed</option>
        </select>
        <select name="priority" defaultValue={params.priority ?? ""}>
          <option value="">All priorities</option><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option>
        </select>
        <button className="btn secondary">Apply filters</button>
        <Link href="/my-work" className="btn ghost">Reset</Link>
      </form>

      <div className="card">
        {tasks.length ? (
          <div className="tablewrap"><table className="table"><thead><tr><th>Task</th><th>Priority</th><th>Status</th><th>Due</th><th></th></tr></thead><tbody>
            {tasks.map((task: any) => <tr key={task.id}><td><strong>{task.title}</strong></td><td><span className={`priority priority-${task.priority}`}>{task.priority}</span></td><td><span className={`badge status-${task.status}`}>{task.status.replaceAll("_", " ")}</span></td><td>{task.due_date ? new Date(task.due_date).toLocaleString() : "—"}</td><td><Link className="btn secondary" href={`/tasks/${task.id}`}>Open</Link></td></tr>)}
          </tbody></table></div>
        ) : <EmptyState title="No matching tasks" description="No tasks match the current search and filters." actionHref="/my-work" actionLabel="Clear filters" />}
      </div>
    </div>
  );
}
