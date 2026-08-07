"use server";

import { randomUUID } from "crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth";

type ApprovalStep = {
  id: string;
  step_order: number;
  reviewer_id: string | null;
};

type TaskRecord = {
  id: string;
  assigned_to: string | null;
  status: string;
  task_approval_steps:
    | ApprovalStep[]
    | null;
};

function fail(
  taskId: string,
  message: string
): never {
  redirect(
    `/tasks/${taskId}/submit?error=${encodeURIComponent(
      message
    )}`
  );
}

function getText(
  formData: FormData,
  key: string
): string {
  const value = formData.get(key);

  return typeof value === "string"
    ? value.trim()
    : "";
}

function getSafeNumber(
  value: FormDataEntryValue | null
): number {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

export async function submitWork(
  formData: FormData
): Promise<never> {
  const { supabase, profile } =
    await requireProfile();

  const taskId = getText(
    formData,
    "task_id"
  );

  if (!taskId) {
    redirect(
      "/my-work?error=Task%20ID%20is%20missing"
    );
  }

  /*
   * Load and validate task
   */

  const {
    data: taskData,
    error: taskError,
  } = await supabase
    .from("tasks")
    .select(`
      id,
      assigned_to,
      status,
      task_approval_steps (
        id,
        step_order,
        reviewer_id
      )
    `)
    .eq("id", taskId)
    .maybeSingle();

  if (taskError) {
    fail(
      taskId,
      taskError.message
    );
  }

  if (!taskData) {
    fail(
      taskId,
      "Task not found."
    );
  }

  const task =
    taskData as unknown as TaskRecord;

  if (
    task.assigned_to !==
    profile.id
  ) {
    fail(
      taskId,
      "Only the assigned employee can submit this work."
    );
  }

  if (
    [
      "completed",
      "cancelled",
    ].includes(task.status)
  ) {
    fail(
      taskId,
      "This task can no longer be submitted."
    );
  }

  /*
   * Validate approval chain
   */

  const approvalSteps =
    (
      task.task_approval_steps ??
      []
    )
      .filter(
        (
          step
        ): step is ApprovalStep & {
          reviewer_id: string;
        } =>
          Boolean(step.reviewer_id)
      )
      .sort(
        (
          firstStep,
          secondStep
        ) =>
          firstStep.step_order -
          secondStep.step_order
      );

  if (
    approvalSteps.length === 0
  ) {
    fail(
      taskId,
      "This task has no reviewer. Ask an admin or team lead to assign Reviewer 1."
    );
  }

  if (
    approvalSteps.some(
      (step) =>
        step.reviewer_id ===
        profile.id
    )
  ) {
    fail(
      taskId,
      "You cannot review your own submitted work."
    );
  }

  const reviewerIds =
    approvalSteps.map(
      (step) =>
        step.reviewer_id
    );

  if (
    new Set(reviewerIds).size !==
    reviewerIds.length
  ) {
    fail(
      taskId,
      "The approval chain contains a duplicate reviewer."
    );
  }

  /*
   * Validate submission fields
   */

  const completionNote =
    getText(
      formData,
      "completion_note"
    );

  const externalLink =
    getText(
      formData,
      "external_link"
    );

  const rawHours =
    getSafeNumber(
      formData.get("hours")
    );

  const rawMinutes =
    getSafeNumber(
      formData.get("minutes")
    );

  const hours =
    Math.max(
      0,
      Math.floor(rawHours)
    );

  const minutes =
    Math.max(
      0,
      Math.min(
        59,
        Math.floor(rawMinutes)
      )
    );

  const timeSpentMinutes =
    hours * 60 + minutes;

  if (
    !completionNote &&
    !externalLink &&
    formData
      .getAll("files")
      .every(
        (entry) =>
          !(
            entry instanceof File
          ) ||
          entry.size === 0
      )
  ) {
    fail(
      taskId,
      "Add a completion note, external link or evidence file before submitting."
    );
  }

  if (externalLink) {
    try {
      const url =
        new URL(externalLink);

      if (
        ![
          "http:",
          "https:",
        ].includes(
          url.protocol
        )
      ) {
        fail(
          taskId,
          "External link must use http or https."
        );
      }
    } catch {
      fail(
        taskId,
        "Enter a valid external link."
      );
    }
  }

  /*
   * Validate files
   */

  const files =
    formData
      .getAll("files")
      .filter(
        (
          entry
        ): entry is File =>
          entry instanceof File &&
          entry.size > 0
      );

  if (files.length > 10) {
    fail(
      taskId,
      "Maximum 10 files per submission."
    );
  }

  const maximumFileSize =
    50 * 1024 * 1024;

  const allowedMimeTypes =
    new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "image/jpeg",
      "image/png",
      "image/webp",
      "text/plain",
      "text/csv",
      "application/zip",
      "application/x-zip-compressed",
    ]);

  for (const file of files) {
    if (
      file.size >
      maximumFileSize
    ) {
      fail(
        taskId,
        `${file.name} is larger than 50 MB.`
      );
    }

    if (
      file.type &&
      !allowedMimeTypes.has(
        file.type
      )
    ) {
      fail(
        taskId,
        `${file.name} has an unsupported file type.`
      );
    }
  }

  /*
   * Create submission
   */

  const {
    data: submissionResult,
    error: submissionError,
  } = await supabase.rpc(
    "create_task_submission",
    {
      p_task_id:
        taskId,

      p_completion_note:
        completionNote || null,

      p_external_link:
        externalLink || null,

      p_time_spent_minutes:
        timeSpentMinutes,
    }
  );

  if (submissionError) {
    fail(
      taskId,
      submissionError.message
    );
  }

  if (!submissionResult) {
    fail(
      taskId,
      "No submission ID was returned."
    );
  }

  const submissionId =
    String(submissionResult);

  /*
   * Upload evidence files
   */

  const uploadedPaths: string[] =
    [];

  try {
    for (const file of files) {
      const cleanFileName =
        file.name
          .normalize("NFKD")
          .replace(
            /[^A-Za-z0-9._-]/g,
            "_"
          )
          .replace(
            /_+/g,
            "_"
          )
          .slice(0, 140);

      const storagePath =
        `${profile.organization_id}/` +
        `${profile.id}/` +
        `${submissionId}/` +
        `${randomUUID()}-${cleanFileName}`;

      const bytes =
        Buffer.from(
          await file.arrayBuffer()
        );

      const {
        error: uploadError,
      } = await supabase.storage
        .from("task-evidence")
        .upload(
          storagePath,
          bytes,
          {
            contentType:
              file.type ||
              "application/octet-stream",

            upsert:
              false,

            cacheControl:
              "3600",
          }
        );

      if (uploadError) {
        throw new Error(
          `File upload failed for ${file.name}: ${uploadError.message}`
        );
      }

      uploadedPaths.push(
        storagePath
      );

      const {
        error: metadataError,
      } = await supabase
        .from("submission_files")
        .insert({
          organization_id:
            profile.organization_id,

          submission_id:
            submissionId,

          file_name:
            file.name,

          storage_path:
            storagePath,

          mime_type:
            file.type || null,

          file_size:
            file.size,

          uploaded_by:
            profile.id,
        });

      if (metadataError) {
        throw new Error(
          metadataError.message
        );
      }
    }
  } catch (uploadFailure) {
    if (
      uploadedPaths.length > 0
    ) {
      await supabase.storage
        .from("task-evidence")
        .remove(uploadedPaths);
    }

    const message =
      uploadFailure instanceof Error
        ? uploadFailure.message
        : "Unable to upload the evidence files.";

    fail(
      taskId,
      message
    );
  }

  /*
   * Refresh affected screens
   */

  revalidatePath(
    `/tasks/${taskId}`
  );

  revalidatePath(
    `/tasks/${taskId}/submit`
  );

  revalidatePath(
    "/my-work"
  );

  revalidatePath(
    "/reviews"
  );

  revalidatePath(
    "/dashboard"
  );

  redirect(
    `/tasks/${taskId}?submitted=1`
  );
}