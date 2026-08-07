import Link from "next/link";

import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  History,
  RotateCcw,
  XCircle,
} from "lucide-react";

import { requireRole } from "@/lib/auth";

type PersonReference = {
  full_name: string | null;
};

type TaskReference = {
  id: string;
  title: string;
  priority: string | null;
  assigned_to: string | null;
  profiles:
    | PersonReference
    | PersonReference[]
    | null;
};

type ReviewRecord = {
  decision: string;
  comment: string | null;
  created_at: string;
  reviewer_id: string;
};

type SubmissionReference = {
  id: string;
  version_number: number;
  status: string;
  submitted_at: string;
  tasks:
    | TaskReference
    | TaskReference[]
    | null;
  submission_reviews:
    | ReviewRecord[]
    | null;
};

type ApprovalStepRow = {
  id: string;
  submission_id: string;
  step_order: number;
  reviewer_id: string;
  status: string;
  task_submissions:
    | SubmissionReference
    | SubmissionReference[]
    | null;
};

function firstRelation<T>(
  value: T | T[] | null | undefined
): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function formatLabel(
  value: string | null | undefined
) {
  return value
    ? value.replaceAll("_", " ")
    : "—";
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString();
}

function getLatestDecision(
  submission: SubmissionReference,
  reviewerId: string
): ReviewRecord | null {
  const reviews =
    submission.submission_reviews ?? [];

  const matching = reviews
    .filter(
      (review) =>
        review.reviewer_id === reviewerId
    )
    .sort(
      (first, second) =>
        new Date(second.created_at).getTime() -
        new Date(first.created_at).getTime()
    );

  return matching[0] ?? null;
}

function OutcomeBadge({
  status,
}: {
  status: string;
}) {
  const label = formatLabel(status);

  if (status === "approved") {
    return (
      <span className="review-outcome review-outcome-approved">
        <CheckCircle2 size={15} />
        {label}
      </span>
    );
  }

  if (status === "changes_requested") {
    return (
      <span className="review-outcome review-outcome-changes">
        <RotateCcw size={15} />
        {label}
      </span>
    );
  }

  if (
    status === "rejected"
  ) {
    return (
      <span className="review-outcome review-outcome-rejected">
        <XCircle size={15} />
        {label}
      </span>
    );
  }

  return (
    <span className="review-outcome review-outcome-pending">
      <Clock3 size={15} />
      {label}
    </span>
  );
}

export default async function ReviewsPage() {
  const { supabase, profile } =
    await requireRole([
      "reviewer",
      "team_lead",
      "admin",
    ]);

  let query = supabase
    .from("submission_approval_steps")
    .select(`
      id,
      submission_id,
      step_order,
      reviewer_id,
      status,

      task_submissions!inner (
        id,
        version_number,
        status,
        submitted_at,

        tasks!inner (
          id,
          title,
          priority,
          assigned_to,

          profiles!tasks_assigned_to_fkey (
            full_name
          )
        ),

        submission_reviews (
          decision,
          comment,
          created_at,
          reviewer_id
        )
      )
    `)
    .order("id", {
      ascending: false,
    });

  /*
   * A normal reviewer / team lead sees the
   * submissions for which they are an approval
   * reviewer. Admin can see all approval steps
   * permitted by RLS.
   */
  if (profile.role !== "admin") {
    query = query.eq(
      "reviewer_id",
      profile.id
    );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const rows =
    (data ?? []) as unknown as ApprovalStepRow[];

  const normalized = rows
    .map((step) => {
      const submission =
        firstRelation(
          step.task_submissions
        );

      if (!submission) {
        return null;
      }

      const task =
        firstRelation(
          submission.tasks
        );

      if (!task) {
        return null;
      }

      const employee =
        firstRelation(
          task.profiles
        );

      const review =
        getLatestDecision(
          submission,
          step.reviewer_id
        );

      return {
        step,
        submission,
        task,
        employeeName:
          employee?.full_name ??
          "Unknown employee",
        review,
      };
    })
    .filter(
      (
        item
      ): item is NonNullable<
        typeof item
      > => item !== null
    )
    .sort(
      (first, second) =>
        new Date(
          second.submission.submitted_at
        ).getTime() -
        new Date(
          first.submission.submitted_at
        ).getTime()
    );

  const pending = normalized.filter(
    ({ step }) =>
      step.status === "pending"
  );

  const history = normalized.filter(
    ({ step }) =>
      step.status !== "pending"
  );

  return (
    <div className="grid review-queue-page">
      <div className="page-head">
        <div>
          <h1>Review Queue</h1>

          <p>
            Current review work and your
            complete decision history.
          </p>
        </div>
      </div>

      <section className="card review-queue-section">
        <div className="review-queue-section-head">
          <div>
            <h2>Waiting for review</h2>

            <p className="muted">
              Work currently waiting for your
              decision.
            </p>
          </div>

          <span className="review-count-badge">
            {pending.length}
          </span>
        </div>

        {pending.length > 0 ? (
          <div className="tablewrap">
            <table className="table review-queue-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Employee</th>
                  <th>Version</th>
                  <th>Priority</th>
                  <th>Submitted</th>
                  <th>Step</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {pending.map(
                  ({
                    step,
                    submission,
                    task,
                    employeeName,
                  }) => (
                    <tr key={step.id}>
                      <td>
                        <strong>
                          {task.title}
                        </strong>
                      </td>

                      <td>
                        {employeeName}
                      </td>

                      <td>
                        Version{" "}
                        {
                          submission.version_number
                        }
                      </td>

                      <td>
                        <span
                          className={`priority priority-${task.priority ?? "normal"}`}
                        >
                          {task.priority ??
                            "normal"}
                        </span>
                      </td>

                      <td>
                        {formatDate(
                          submission.submitted_at
                        )}
                      </td>

                      <td>
                        Step{" "}
                        {step.step_order}
                      </td>

                      <td>
                        <OutcomeBadge status="pending" />
                      </td>

                      <td>
                        <Link
                          href={`/reviews/${submission.id}`}
                          className="dashboard-open-icon"
                          aria-label={`Review ${task.title}`}
                          title={`Review ${task.title}`}
                        >
                          <ArrowUpRight
                            size={18}
                          />
                        </Link>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="review-empty">
            <CheckCircle2 size={24} />

            <div>
              <strong>
                Nothing is waiting for review.
              </strong>

              <span>
                New submissions will appear
                here when your step becomes
                active.
              </span>
            </div>
          </div>
        )}
      </section>

      <section className="card review-queue-section">
        <div className="review-queue-section-head">
          <div>
            <h2>
              Past review history
            </h2>

            <p className="muted">
              Approved, change-requested,
              rejected and reassigned work
              remains visible here.
            </p>
          </div>

          <div className="review-history-title-icon">
            <History size={21} />
          </div>
        </div>

        {history.length > 0 ? (
          <div className="tablewrap">
            <table className="table review-queue-table review-history-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Employee</th>
                  <th>Version</th>
                  <th>Step</th>
                  <th>What happened</th>
                  <th>Reviewed</th>
                  <th>Comment</th>
                  <th>Open</th>
                </tr>
              </thead>

              <tbody>
                {history.map(
                  ({
                    step,
                    submission,
                    task,
                    employeeName,
                    review,
                  }) => {
                    const outcome =
                      review?.decision ??
                      step.status;

                    return (
                      <tr key={step.id}>
                        <td>
                          <strong>
                            {task.title}
                          </strong>
                        </td>

                        <td>
                          {employeeName}
                        </td>

                        <td>
                          Version{" "}
                          {
                            submission.version_number
                          }
                        </td>

                        <td>
                          Step{" "}
                          {step.step_order}
                        </td>

                        <td>
                          <OutcomeBadge
                            status={
                              outcome
                            }
                          />
                        </td>

                        <td>
                          {formatDate(
                            review?.created_at ??
                              submission.submitted_at
                          )}
                        </td>

                        <td className="review-history-comment">
                          {review?.comment ||
                            "No comment"}
                        </td>

                        <td>
                          <Link
                            href={`/reviews/${submission.id}`}
                            className="dashboard-open-icon"
                            aria-label={`Open ${task.title} review history`}
                            title={`Open ${task.title} review history`}
                          >
                            <ArrowUpRight
                              size={18}
                            />
                          </Link>
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="review-empty">
            <History size={24} />

            <div>
              <strong>
                No previous reviews yet.
              </strong>

              <span>
                Completed review decisions
                will remain here instead of
                disappearing.
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}