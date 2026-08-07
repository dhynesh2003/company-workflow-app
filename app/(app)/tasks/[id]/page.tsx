import Link from "next/link";
import { notFound } from "next/navigation";

import { requireProfile } from "@/lib/auth";
import { updateTaskStatus } from "../../my-work/actions";

type PersonRef = { full_name: string | null; email?: string | null };
type ApprovalStep = { step_order: number; reviewer_id: string; profiles: PersonRef | PersonRef[] | null };
type SubmissionApprovalStep = { step_order: number; status: string; reviewer_id: string; profiles: PersonRef | PersonRef[] | null };
type SubmissionReview = { decision: string; comment: string | null; created_at: string; profiles: PersonRef | PersonRef[] | null };
type SubmissionFile = { id: string; file_name: string; storage_path: string; file_size: number | null };
type TaskSubmission = {
  id: string;
  version_number: number;
  status: string;
  completion_note: string | null;
  external_link: string | null;
  time_spent_minutes: number | null;
  submitted_at: string;
  submission_files: SubmissionFile[] | null;
  submission_approval_steps: SubmissionApprovalStep[] | null;
  submission_reviews: SubmissionReview[] | null;
};
type TaskRecord = {
  id: string;
  title: string;
  description: string | null;
  expected_output: string | null;
  required_evidence: string | null;
  priority: string | null;
  due_date: string | null;
  status: string;
  blocker_reason: string | null;
  assigned_to: string | null;
  assignee: PersonRef | PersonRef[] | null;
  creator: PersonRef | PersonRef[] | null;
  reviewer: PersonRef | PersonRef[] | null;
  task_approval_steps: ApprovalStep[] | null;
  task_submissions: TaskSubmission[] | null;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}
function duration(minutes: number | null) {
  const safe = Math.max(0, Math.floor(minutes ?? 0));
  return `${Math.floor(safe / 60)}h ${safe % 60}m`;
}
function formatLabel(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "—";
}
function formatDate(value: string | null) {
  if (!value) return "No due date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No due date" : date.toLocaleString();
}

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string; error?: string }>;
}) {
  const { id } = await params;
  const p = await searchParams;
  const { supabase, profile } = await requireProfile();

  const { data: rawTask, error } = await supabase
    .from("tasks")
    .select(`
      *,
      assignee:profiles!tasks_assigned_to_fkey(full_name,email),
      creator:profiles!tasks_created_by_fkey(full_name),
      reviewer:profiles!tasks_current_reviewer_id_fkey(full_name),
      task_approval_steps(
        step_order,reviewer_id,
        profiles!task_approval_steps_reviewer_id_fkey(full_name)
      ),
      task_submissions(
        id,version_number,status,completion_note,external_link,time_spent_minutes,submitted_at,
        submission_files(id,file_name,storage_path,file_size),
        submission_approval_steps(
          step_order,status,reviewer_id,
          profiles!submission_approval_steps_reviewer_id_fkey(full_name)
        ),
        submission_reviews(
          decision,comment,created_at,
          profiles!submission_reviews_reviewer_id_fkey(full_name)
        )
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!rawTask) notFound();

  const t = rawTask as unknown as TaskRecord;
  const assignee = firstRelation(t.assignee);
  const creator = firstRelation(t.creator);
  const currentReviewer = firstRelation(t.reviewer);
  const own = t.assigned_to === profile.id;
  const canSubmit = own && ["not_started", "in_progress", "blocked", "changes_requested", "rejected"].includes(t.status);
  const submissions = [...(t.task_submissions ?? [])].sort((a, b) => b.version_number - a.version_number);
  const approvalSteps = [...(t.task_approval_steps ?? [])].sort((a, b) => a.step_order - b.step_order);
  const currentReviewerText = currentReviewer?.full_name ?? (["completed", "approved"].includes(t.status) ? "Review completed" : "Not assigned yet");

  return (
    <div className="grid task-detail-page">
      <div className="task-detail-head">
        <div>
          <h1>{t.title}</h1>
          <p className="muted">Assigned to <strong>{assignee?.full_name ?? "Unassigned"}</strong></p>
        </div>
        {canSubmit && <Link href={`/tasks/${id}/submit`} className="btn task-submit-button">Submit work for review</Link>}
      </div>

      {p.submitted && <p className="notice">Work submitted. It is now waiting for review.</p>}
      {p.error && <p className="error">{p.error}</p>}

      <section className="card task-overview-card">
        <div className="task-overview-grid">
          <div className="task-requirement-panel">
            <div className="task-section-heading">
              <span>Task requirement</span>
              <p>Original instructions and expected deliverables.</p>
            </div>

            <div className="task-description-box">
              <span className="task-field-label">Description</span>
              <p>{t.description || "No description provided."}</p>
            </div>

            <div className="task-requirement-row">
              <span className="task-field-label">Expected output</span>
              <p>{t.expected_output || "Not specified"}</p>
            </div>

            <div className="task-requirement-row">
              <span className="task-field-label">Required evidence</span>
              <p>{t.required_evidence || "Not specified"}</p>
            </div>
          </div>

          <aside className="task-facts-panel">
            <TaskFact label="Priority" value={formatLabel(t.priority)} />
            <TaskFact label="Due" value={formatDate(t.due_date)} />
            <TaskFact label="Created by" value={creator?.full_name ?? "Not recorded"} />
            <TaskFact label="Status" value={formatLabel(t.status)} badgeClass={`status-${t.status}`} />
            <TaskFact label="Current reviewer" value={currentReviewerText} />
            {t.blocker_reason && <div className="task-blocker-box"><strong>Blocker</strong><span>{t.blocker_reason}</span></div>}
          </aside>
        </div>
      </section>

      <section className="card task-approval-card">
        <div className="task-section-heading">
          <span>Configured approval chain</span>
          <p>Reviewers assigned to this task in approval order.</p>
        </div>

        {approvalSteps.length ? (
          <div className="task-approval-list">
            {approvalSteps.map((step) => {
              const reviewer = firstRelation(step.profiles);
              return (
                <div className="task-approval-step" key={`${step.step_order}-${step.reviewer_id}`}>
                  <span className="task-step-number">{step.step_order}</span>
                  <div>
                    <strong>Step {step.step_order}</strong>
                    <span>{reviewer?.full_name ?? "Reviewer not found"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="error">No reviewers configured. Edit or recreate this task with a reviewer.</p>
        )}
      </section>

      {own && ["not_started", "in_progress", "blocked"].includes(t.status) && (
        <section className="card">
          <div className="task-section-heading">
            <span>Update work status</span>
            <p>Keep the team informed about your current progress.</p>
          </div>
          <form action={updateTaskStatus} className="form">
            <input type="hidden" name="id" value={t.id} />
            <label className="label">Status
              <select className="select" name="status" defaultValue={t.status}>
                <option value="not_started">Not started</option>
                <option value="in_progress">In progress</option>
                <option value="blocked">Blocked</option>
              </select>
            </label>
            <label className="label">Blocker reason
              <textarea className="textarea" name="blocker_reason" defaultValue={t.blocker_reason ?? ""} />
            </label>
            <button className="btn">Save status</button>
          </form>
        </section>
      )}

      <section className="card task-history-card">
        <div className="task-section-heading">
          <span>Submission history</span>
          <p>Previous work versions, review progress and feedback.</p>
        </div>

        {submissions.map((s) => {
          const steps = [...(s.submission_approval_steps ?? [])].sort((a, b) => a.step_order - b.step_order);
          return (
            <article className="submission task-submission-card" key={s.id}>
              <div className="task-submission-head">
                <div><strong>Version {s.version_number}</strong><span className={`badge status-${s.status}`}>{formatLabel(s.status)}</span></div>
                <small className="muted">{formatDate(s.submitted_at)}</small>
              </div>
              <p className="task-submission-note">{s.completion_note || "No completion note provided."}</p>
              <div className="task-submission-meta">
                <span><strong>Time reported:</strong> {duration(s.time_spent_minutes)}</span>
                <span><strong>Files:</strong> {s.submission_files?.length ?? 0}</span>
              </div>
              {s.external_link && <a className="textlink" target="_blank" rel="noreferrer" href={s.external_link}>Open external link</a>}

              {!!steps.length && (
                <div className="stepper">
                  {steps.map((step) => {
                    const reviewer = firstRelation(step.profiles);
                    return (
                      <div className={`step ${step.status}`} key={`${s.id}-${step.step_order}`}>
                        <strong>{reviewer?.full_name ?? `Step ${step.step_order}`}</strong>
                        <span>{formatLabel(step.status)}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {(s.submission_reviews ?? []).map((r) => {
                const reviewer = firstRelation(r.profiles);
                return (
                  <div className="history task-review-history" key={`${r.created_at}-${r.decision}`}>
                    <strong>{reviewer?.full_name ?? "Reviewer"}</strong> — {formatLabel(r.decision)}
                    <div>{r.comment || "No comment"}</div>
                  </div>
                );
              })}
            </article>
          );
        })}

        {!submissions.length && <p className="muted">No work has been submitted yet.</p>}
      </section>
    </div>
  );
}

function TaskFact({ label, value, badgeClass }: { label: string; value: string; badgeClass?: string }) {
  return (
    <div className="task-fact-row">
      <span>{label}</span>
      {badgeClass ? <strong className={`badge ${badgeClass}`}>{value}</strong> : <strong>{value}</strong>}
    </div>
  );
}