import Link from "next/link";
import type { ReactNode } from "react";

import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  History,
  RotateCcw,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import { notFound } from "next/navigation";

import { SubmitButton } from "@/components/submit-button";
import { requireRole } from "@/lib/auth";

import { reviewSubmission } from "../actions";

type ReviewPageProps = {
  params: Promise<{
    id: string;
  }>;

  searchParams: Promise<{
    error?: string;
  }>;
};

type PersonReference = {
  full_name: string | null;
  email?: string | null;
  role?: string | null;
};

type TaskReference = {
  id: string;
  title: string;
  description: string | null;
  expected_output: string | null;
  required_evidence: string | null;
  priority: string | null;
  due_date: string | null;
  status: string;
  assigned_to: string;
  profiles: PersonReference | null;
};

type SubmissionFile = {
  id: string;
  file_name: string;
  file_size: number | null;
  storage_path: string;
  mime_type?: string | null;
};

type ApprovalStep = {
  id: string;
  step_order: number;
  reviewer_id: string;
  status: string;
  profiles: PersonReference | null;
};

type SubmissionReview = {
  id: string;
  decision: string;
  comment: string | null;
  created_at: string;
  profiles: PersonReference | null;
};

type SubmissionRecord = {
  id: string;
  submitted_by: string;
  version_number: number;
  time_spent_minutes: number | null;
  completion_note: string | null;
  external_link: string | null;
  status: string;
  tasks: TaskReference;
  submission_files: SubmissionFile[] | null;
  submission_approval_steps:
    | ApprovalStep[]
    | null;
  submission_reviews:
    | SubmissionReview[]
    | null;
};

type ReviewerOption = {
  id: string;
  full_name: string;
  role: string;
};

type FileWithUrl = SubmissionFile & {
  url: string | null;
};

function formatDuration(
  minutes: number | null
): string {
  const safeMinutes =
    Number.isFinite(minutes)
      ? Math.max(
          0,
          Math.floor(minutes ?? 0)
        )
      : 0;

  const hours =
    Math.floor(safeMinutes / 60);

  const remainingMinutes =
    safeMinutes % 60;

  return `${hours}h ${remainingMinutes}m`;
}

function formatLabel(
  value: string | null | undefined
): string {
  return value
    ? value.replaceAll("_", " ")
    : "—";
}

function formatDate(
  value: string | null
): string {
  if (!value) {
    return "No due date";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Invalid date"
    : date.toLocaleString();
}

function getDecisionIcon(
  decision: string
): ReactNode {
  if (decision === "approved") {
    return <CheckCircle2 size={17} />;
  }

  if (
    decision === "rejected"
  ) {
    return <XCircle size={17} />;
  }

  if (
    decision ===
    "changes_requested"
  ) {
    return <RotateCcw size={17} />;
  }

  return <History size={17} />;
}

export default async function ReviewPage({
  params,
  searchParams,
}: ReviewPageProps) {
  const { id } = await params;
  const pageParams =
    await searchParams;

  const { supabase, profile } =
    await requireRole([
      "reviewer",
      "team_lead",
      "admin",
    ]);

  const {
    data: submissionData,
    error: submissionError,
  } = await supabase
    .from("task_submissions")
    .select(`
      id,
      submitted_by,
      version_number,
      time_spent_minutes,
      completion_note,
      external_link,
      status,

      tasks!inner (
        id,
        title,
        description,
        expected_output,
        required_evidence,
        priority,
        due_date,
        status,
        assigned_to,

        profiles!tasks_assigned_to_fkey (
          full_name,
          email
        )
      ),

      submission_files (
        id,
        file_name,
        file_size,
        storage_path,
        mime_type
      ),

      submission_approval_steps (
        id,
        step_order,
        reviewer_id,
        status,

        profiles!submission_approval_steps_reviewer_id_fkey (
          full_name,
          role
        )
      ),

      submission_reviews (
        id,
        decision,
        comment,
        created_at,

        profiles!submission_reviews_reviewer_id_fkey (
          full_name
        )
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (submissionError) {
    throw new Error(
      submissionError.message
    );
  }

  if (!submissionData) {
    notFound();
  }

  const submission =
    submissionData as unknown as SubmissionRecord;

  const approvalSteps =
    submission
      .submission_approval_steps ??
    [];

  const reviewHistory =
    submission.submission_reviews ??
    [];

  const submissionFiles =
    submission.submission_files ??
    [];

  const pendingStep =
    approvalSteps.find(
      (step) =>
        step.status === "pending"
    );

  const canAct =
    profile.role === "admin" ||
    pendingStep?.reviewer_id ===
      profile.id;

  const {
    data: reviewerData,
    error: reviewerError,
  } = await supabase
    .from("profiles")
    .select(`
      id,
      full_name,
      role
    `)
    .eq(
      "organization_id",
      profile.organization_id
    )
    .eq("is_active", true)
    .in("role", [
      "reviewer",
      "team_lead",
      "admin",
    ])
    .neq(
      "id",
      submission.submitted_by
    )
    .order("full_name");

  if (reviewerError) {
    throw new Error(
      reviewerError.message
    );
  }

  const reviewers =
    (reviewerData ??
      []) as ReviewerOption[];

  const files: FileWithUrl[] =
    await Promise.all(
      submissionFiles.map(
        async (file) => {
          const {
            data: signedUrlData,
          } = await supabase.storage
            .from("task-evidence")
            .createSignedUrl(
              file.storage_path,
              900
            );

          return {
            ...file,
            url:
              signedUrlData
                ?.signedUrl ?? null,
          };
        }
      )
    );

  const sortedApprovalSteps =
    [...approvalSteps].sort(
      (firstStep, secondStep) =>
        firstStep.step_order -
        secondStep.step_order
    );

  const sortedReviewHistory =
    [...reviewHistory].sort(
      (
        firstReview,
        secondReview
      ) =>
        new Date(
          firstReview.created_at
        ).getTime() -
        new Date(
          secondReview.created_at
        ).getTime()
    );

  return (
    <div className="grid">
      <div className="page-head">
        <div>
          <Link
            href="/reviews"
            className="review-back-link"
          >
            <ArrowLeft size={17} />
            Review queue
          </Link>

          <h1>Review submission</h1>

          <p>
            {submission.tasks.title}
            {" · "}
            Version{" "}
            {
              submission.version_number
            }
          </p>
        </div>

        <span
          className={`badge status-${submission.status}`}
        >
          {formatLabel(
            submission.status
          )}
        </span>
      </div>

      {pageParams.error && (
        <p className="error">
          {pageParams.error}
        </p>
      )}

      <section className="card review-summary-card">
        <div className="review-summary-grid">
          <div className="review-requirement-column">
            <div className="review-section-title">
              <div className="review-section-icon">
                <FileText size={21} />
              </div>

              <div>
                <h2>
                  Task requirement
                </h2>

                <p className="muted">
                  Original instructions
                  provided to the employee.
                </p>
              </div>
            </div>

            <div className="review-copy-block review-requirement-content">
              <p>
                {
                  submission.tasks
                    .description ||
                  "No description provided."
                }
              </p>

              <div className="review-detail">
                <strong>
                  Expected output
                </strong>

                <span>
                  {submission.tasks
                    .expected_output ||
                    "—"}
                </span>
              </div>

              <div className="review-detail">
                <strong>
                  Required evidence
                </strong>

                <span>
                  {submission.tasks
                    .required_evidence ||
                    "—"}
                </span>
              </div>
            </div>
          </div>

          <div className="review-facts">
            <ReviewFact
              icon={
                <UserRound
                  size={18}
                />
              }
              label="Employee"
              value={
                submission.tasks
                  .profiles
                  ?.full_name ||
                "Unknown employee"
              }
            />

            <ReviewFact
              icon={
                <ShieldCheck
                  size={18}
                />
              }
              label="Priority"
              value={formatLabel(
                submission.tasks
                  .priority
              )}
            />

            <ReviewFact
              icon={
                <CalendarClock
                  size={18}
                />
              }
              label="Due"
              value={formatDate(
                submission.tasks
                  .due_date
              )}
            />

            <ReviewFact
              icon={
                <Clock3 size={18} />
              }
              label="Time reported"
              value={formatDuration(
                submission
                  .time_spent_minutes
              )}
            />

            <ReviewFact
              icon={
                <FileCheck2Icon />
              }
              label="Submission status"
              value={formatLabel(
                submission.status
              )}
            />
          </div>
        </div>
      </section>

      <section className="card">
        <div className="review-section-title">
          <div className="review-section-icon">
            <FileCheck2Icon />
          </div>

          <div>
            <h2>
              Employee submission
            </h2>

            <p className="muted">
              Completion note, links and
              supporting evidence.
            </p>
          </div>
        </div>

        <div className="review-submission-note">
          {submission.completion_note ||
            "No completion note was provided."}
        </div>

        {submission.external_link && (
          <a
            className="btn secondary review-external-link"
            href={
              submission.external_link
            }
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={17} />
            Open external work
          </a>
        )}

        <h3>Evidence files</h3>

        <div className="filelist">
          {files.map((file) => (
            <div
              className="file review-file"
              key={file.id}
            >
              <div className="review-file-info">
                <div className="review-file-icon">
                  <FileText size={19} />
                </div>

                <div>
                  <strong>
                    {file.file_name}
                  </strong>

                  <div className="muted">
                    {Math.ceil(
                      (file.file_size ??
                        0) / 1024
                    )}{" "}
                    KB
                  </div>
                </div>
              </div>

              {file.url && (
                <a
                  className="dashboard-open-icon"
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${file.file_name}`}
                  title={`Open ${file.file_name}`}
                >
                  <Download size={18} />
                </a>
              )}
            </div>
          ))}

          {files.length === 0 && (
            <p className="muted">
              No file was attached.
            </p>
          )}
        </div>
      </section>

      <section className="card">
        <div className="review-section-title">
          <div className="review-section-icon">
            <ShieldCheck size={21} />
          </div>

          <div>
            <h2>
              Approval progress
            </h2>

            <p className="muted">
              Current reviewer chain and
              decision status.
            </p>
          </div>
        </div>

        <div className="stepper">
          {sortedApprovalSteps.map(
            (step) => (
              <div
                className={`step ${step.status}`}
                key={step.id}
              >
                <strong>
                  Step{" "}
                  {step.step_order}:{" "}
                  {step.profiles
                    ?.full_name ||
                    "Unknown reviewer"}
                </strong>

                <span>
                  {formatLabel(
                    step.status
                  )}
                </span>
              </div>
            )
          )}
        </div>
      </section>

      {sortedReviewHistory.length >
        0 && (
        <section className="card">
          <div className="review-section-title">
            <div className="review-section-icon">
              <History size={21} />
            </div>

            <div>
              <h2>Review history</h2>

              <p className="muted">
                Previous decisions and
                reviewer comments.
              </p>
            </div>
          </div>

          <div className="review-history-list">
            {sortedReviewHistory.map(
              (review) => (
                <div
                  className="history review-history-item"
                  key={review.id}
                >
                  <div className="review-history-heading">
                    <span className={`review-decision-icon decision-${review.decision}`}>
                      {getDecisionIcon(
                        review.decision
                      )}
                    </span>

                    <div>
                      <strong>
                        {review.profiles
                          ?.full_name ||
                          "Unknown reviewer"}
                      </strong>

                      <span>
                        {formatLabel(
                          review.decision
                        )}
                      </span>
                    </div>
                  </div>

                  <p>
                    {review.comment ||
                      "No comment"}
                  </p>

                  <small className="muted">
                    {formatDate(
                      review.created_at
                    )}
                  </small>
                </div>
              )
            )}
          </div>
        </section>
      )}

      {canAct && pendingStep && (
        <section className="card review-decision-card">
          <div className="review-section-title">
            <div className="review-section-icon">
              <ShieldCheck size={21} />
            </div>

            <div>
              <h2>Your decision</h2>

              <p className="muted">
                Review this submission and
                choose the next action.
              </p>
            </div>
          </div>

          <form
            action={reviewSubmission}
            className="form"
          >
            <input
              type="hidden"
              name="submission_id"
              value={id}
            />

            <input
              type="hidden"
              name="task_id"
              value={
                submission.tasks.id
              }
            />

            <label className="label">
              Review comment

              <textarea
                className="textarea"
                name="comment"
                placeholder="Required for changes, rejection or reassignment."
              />
            </label>

            <label className="label">
              Reassign to

              <select
                className="select"
                name="reassign_to"
                defaultValue=""
              >
                <option value="">
                  Choose another reviewer
                </option>

                {reviewers.map(
                  (reviewer) => (
                    <option
                      key={
                        reviewer.id
                      }
                      value={
                        reviewer.id
                      }
                    >
                      {
                        reviewer.full_name
                      }
                      {" — "}
                      {formatLabel(
                        reviewer.role
                      )}
                    </option>
                  )
                )}
              </select>
            </label>

            <div className="actions review-actions">
              <SubmitButton
                className="btn success"
                name="decision"
                value="approved"
                pendingText="Approving..."
              >
                Approve this step
              </SubmitButton>

              <SubmitButton
                className="btn warning"
                name="decision"
                value="changes_requested"
                pendingText="Saving decision..."
              >
                Request changes
              </SubmitButton>

              <SubmitButton
                className="btn danger"
                name="decision"
                value="rejected"
                pendingText="Rejecting..."
                confirmMessage="Reject this submission?"
              >
                Reject
              </SubmitButton>

              <SubmitButton
                className="btn secondary"
                name="decision"
                value="reassigned"
                pendingText="Reassigning..."
              >
                Reassign reviewer
              </SubmitButton>
            </div>
          </form>
        </section>
      )}

      {!canAct && pendingStep && (
        <p className="notice">
          This review is currently waiting
          for{" "}
          {pendingStep.profiles
            ?.full_name ||
            "another reviewer"}
          .
        </p>
      )}

      <Link
        href={`/tasks/${submission.tasks.id}`}
        className="btn secondary review-task-link"
      >
        <History size={17} />
        View complete task history
      </Link>
    </div>
  );
}

type ReviewFactProps = {
  icon: ReactNode;
  label: string;
  value: string;
};

function ReviewFact({
  icon,
  label,
  value,
}: ReviewFactProps) {
  return (
    <div className="review-fact">
      <div className="review-fact-icon">
        {icon}
      </div>

      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function FileCheck2Icon() {
  return (
    <CheckCircle2 size={20} />
  );
}