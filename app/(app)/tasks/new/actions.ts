"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";

function getText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function redirectWithError(message: string): never {
  redirect(`/tasks/new?error=${encodeURIComponent(message)}`);
}

export async function createTask(formData: FormData): Promise<never> {
  const { supabase, profile } = await requireRole(["admin", "team_lead"]);

  const title = getText(formData, "title");
  const description = getText(formData, "description");
  const assignedTo = getText(formData, "assigned_to");
  const expectedOutput = getText(formData, "expected_output");
  const requiredEvidence = getText(formData, "required_evidence");
  const priority = getText(formData, "priority") || "normal";
  const startDate = getText(formData, "start_date");
  const dueDateInput = getText(formData, "due_date");
  const reviewer1 = getText(formData, "reviewer_1");
  const reviewer2 = getText(formData, "reviewer_2");
  const reviewer3 = getText(formData, "reviewer_3");

  const reviewerIds = [reviewer1, reviewer2, reviewer3].filter(
    (reviewerId): reviewerId is string => reviewerId.length > 0
  );

  if (!title) redirectWithError("Enter a task title.");
  if (!description) redirectWithError("Enter a task description.");
  if (!assignedTo) redirectWithError("Choose the employee who will complete the task.");
  if (!reviewer1) redirectWithError("Reviewer 1 is required.");
  if (reviewerIds.includes(assignedTo)) {
    redirectWithError("The assigned employee cannot review their own work.");
  }
  if (new Set(reviewerIds).size !== reviewerIds.length) {
    redirectWithError("Each review step must use a different reviewer.");
  }
  if (!startDate) redirectWithError("Choose a start date.");
  if (!dueDateInput) redirectWithError("Choose a due date and time.");

  const dueDate = new Date(dueDateInput);
  if (Number.isNaN(dueDate.getTime())) {
    redirectWithError("The selected due date is invalid.");
  }

  const { data: assignee, error: assigneeError } = await supabase
    .from("profiles")
    .select("id,organization_id,team_id,is_active")
    .eq("id", assignedTo)
    .maybeSingle();

  if (assigneeError) redirectWithError(assigneeError.message);
  if (!assignee) redirectWithError("Employee not found.");
  if (!assignee.is_active) redirectWithError("The selected employee is inactive.");
  if (assignee.organization_id !== profile.organization_id) {
    redirectWithError("The selected employee belongs to another company.");
  }
  if (profile.role === "team_lead" && assignee.team_id !== profile.team_id) {
    redirectWithError("Team leads can assign work only inside their own team.");
  }

  const { data: reviewerProfiles, error: reviewerError } = await supabase
    .from("profiles")
    .select("id,role,is_active,organization_id,team_id")
    .in("id", reviewerIds);

  if (reviewerError) redirectWithError(reviewerError.message);
  if (!reviewerProfiles) redirectWithError("Unable to load the selected reviewers.");
  if (reviewerProfiles.length !== reviewerIds.length) {
    redirectWithError("One or more selected reviewers were not found.");
  }

  for (const reviewer of reviewerProfiles) {
    if (!reviewer.is_active) redirectWithError("Every reviewer must be active.");
    if (reviewer.organization_id !== profile.organization_id) {
      redirectWithError("Every reviewer must belong to this company.");
    }
    if (!["reviewer", "team_lead", "admin"].includes(reviewer.role)) {
      redirectWithError(
        "Every reviewer must have the reviewer, team lead, or admin role."
      );
    }
  }

  const { data: createdTask, error: taskError } = await supabase
    .from("tasks")
    .insert({
      organization_id: profile.organization_id,
      team_id: assignee.team_id,
      title,
      description,
      expected_output: expectedOutput || null,
      required_evidence: requiredEvidence || null,
      priority,
      status: "not_started",
      assigned_to: assignedTo,
      created_by: profile.id,
      current_reviewer_id: reviewer1,
      start_date: startDate,
      due_date: dueDate.toISOString(),
    })
    .select("id")
    .single();

  if (taskError) redirectWithError(taskError.message);
  if (!createdTask) redirectWithError("The task could not be created.");

  const taskId = String(createdTask.id);
  const approvalSteps = reviewerIds.map((reviewerId, index) => ({
    task_id: taskId,
    step_order: index + 1,
    reviewer_id: reviewerId,
  }));

  const { error: stepError } = await supabase
    .from("task_approval_steps")
    .insert(approvalSteps);

  if (stepError) {
    await supabase.from("tasks").delete().eq("id", taskId);
    redirectWithError(
      `Task was cancelled because the reviewer chain failed: ${stepError.message}`
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin/tasks");
  revalidatePath("/my-work");
  revalidatePath("/reviews");
  redirect(`/tasks/${taskId}`);
}
