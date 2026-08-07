export type AppRole =
  | "employee"
  | "reviewer"
  | "team_lead"
  | "admin"
  | "super_admin";

export type TaskStatus =
  | "not_started"
  | "in_progress"
  | "blocked"
  | "submitted"
  | "under_review"
  | "changes_requested"
  | "rejected"
  | "completed";

export type Priority =
  | "low"
  | "normal"
  | "high"
  | "critical";

export type AttendanceStatus =
  | "working"
  | "half_day"
  | "leave"
  | "holiday"
  | "week_off"
  | "permission"
  | "work_from_home";

export type DailyLogStatus =
  | "draft"
  | "submitted"
  | "checked"
  | "changes_requested";

export type SubmissionStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "changes_requested"
  | "rejected"
  | "approved";

export type ReviewDecision =
  | "approved"
  | "changes_requested"
  | "rejected"
  | "reassigned";

export interface Profile {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  job_title: string | null;
  role: AppRole;
  team_id: string | null;
  manager_id: string | null;
  is_active: boolean;
}