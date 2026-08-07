"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth";

function getText(
  formData: FormData,
  key: string
): string {
  const value = formData.get(key);

  return typeof value === "string"
    ? value.trim()
    : "";
}

function redirectWithError(
  workDate: string,
  message: string
): never {
  const dateQuery = workDate
    ? `date=${encodeURIComponent(workDate)}&`
    : "";

  redirect(
    `/daily-log/new?${dateQuery}error=${encodeURIComponent(
      message
    )}`
  );
}

export async function saveDailyLog(
  formData: FormData
): Promise<never> {
  const { supabase, profile } =
    await requireProfile();

  const workDate = getText(
    formData,
    "work_date"
  );

  const attendanceStatus =
    getText(
      formData,
      "attendance_status"
    ) || "working";

  const shouldSubmit =
    formData.get("intent") === "submit";

  /*
   * Validate work date
   */

  if (!workDate) {
    redirectWithError(
      "",
      "Work date is required."
    );
  }

  const selectedDate =
    new Date(`${workDate}T23:59:59`);

  const maximumAllowedDate =
    new Date(Date.now() + 86_400_000);

  if (
    Number.isNaN(
      selectedDate.getTime()
    )
  ) {
    redirectWithError(
      workDate,
      "The selected work date is invalid."
    );
  }

  if (
    selectedDate >
    maximumAllowedDate
  ) {
    redirectWithError(
      workDate,
      "Future dates are not allowed."
    );
  }

  /*
   * Check whether an existing log is locked.
   */

  const {
    data: existingLog,
    error: existingLogError,
  } = await supabase
    .from("daily_logs")
    .select(`
      id,
      status
    `)
    .eq(
      "employee_id",
      profile.id
    )
    .eq(
      "work_date",
      workDate
    )
    .maybeSingle();

  if (existingLogError) {
    redirectWithError(
      workDate,
      existingLogError.message
    );
  }

  if (
    existingLog?.status ===
    "checked"
  ) {
    redirectWithError(
      workDate,
      "Checked logs cannot be edited."
    );
  }

  /*
   * Save or update the daily-log parent row.
   *
   * Keep the parent in draft status while
   * child items are being rebuilt.
   */

  const {
    data: savedLog,
    error: saveLogError,
  } = await supabase
    .from("daily_logs")
    .upsert(
      {
        organization_id:
          profile.organization_id,

        employee_id:
          profile.id,

        work_date:
          workDate,

        attendance_status:
          attendanceStatus,

        summary:
          getText(
            formData,
            "summary"
          ) || null,

        remarks:
          getText(
            formData,
            "remarks"
          ) || null,

        status:
          "draft",

        submitted_at:
          null,

        review_comment:
          null,

        reviewed_by:
          null,

        reviewed_at:
          null,
      },
      {
        onConflict:
          "employee_id,work_date",
      }
    )
    .select("id")
    .single();

  if (saveLogError) {
    redirectWithError(
      workDate,
      saveLogError.message
    );
  }

  if (!savedLog) {
    redirectWithError(
      workDate,
      "Unable to save the daily log."
    );
  }

  const dailyLogId =
    String(savedLog.id);

  /*
   * Remove existing child entries before
   * inserting the current form entries.
   */

  const {
    error: deleteItemsError,
  } = await supabase
    .from("daily_log_items")
    .delete()
    .eq(
      "daily_log_id",
      dailyLogId
    );

  if (deleteItemsError) {
    redirectWithError(
      workDate,
      deleteItemsError.message
    );
  }

  /*
   * Read repeated form fields.
   */

  const descriptions =
    formData
      .getAll("description")
      .map((value) =>
        String(value).trim()
      );

  const categoryIds =
    formData
      .getAll("category_id")
      .map((value) =>
        String(value).trim()
      );

  const taskIds =
    formData
      .getAll("task_id")
      .map((value) =>
        String(value).trim()
      );

  const hoursValues =
    formData
      .getAll("hours")
      .map((value) =>
        Number(value)
      );

  const minuteValues =
    formData
      .getAll("minutes")
      .map((value) =>
        Number(value)
      );

  const quantities =
    formData
      .getAll("quantity")
      .map((value) =>
        String(value).trim()
      );

  const units =
    formData
      .getAll("unit")
      .map((value) =>
        String(value).trim()
      );

  const completionStatuses =
    formData
      .getAll(
        "completion_status"
      )
      .map((value) =>
        String(value).trim()
      );

  /*
   * Build valid work-item rows.
   */

  const items = descriptions
    .map(
      (
        description,
        index
      ) => {
        const rawHours =
          hoursValues[index];

        const rawMinutes =
          minuteValues[index];

        const safeHours =
          Number.isFinite(rawHours)
            ? Math.max(
                0,
                Math.floor(rawHours)
              )
            : 0;

        const safeMinutes =
          Number.isFinite(rawMinutes)
            ? Math.max(
                0,
                Math.min(
                  59,
                  Math.floor(rawMinutes)
                )
              )
            : 0;

        const quantityValue =
          quantities[index];

        const parsedQuantity =
          quantityValue
            ? Number(quantityValue)
            : null;

        return {
          daily_log_id:
            dailyLogId,

          category_id:
            categoryIds[index] || null,

          task_id:
            taskIds[index] || null,

          description,

          duration_minutes:
            safeHours * 60 +
            safeMinutes,

          quantity:
            parsedQuantity !== null &&
            Number.isFinite(
              parsedQuantity
            )
              ? parsedQuantity
              : null,

          unit:
            units[index] || null,

          completion_status:
            completionStatuses[
              index
            ] || "in_progress",

          sort_order:
            index,
        };
      }
    )
    .filter(
      (
        item
      ): item is {
        daily_log_id: string;
        category_id: string;
        task_id: string | null;
        description: string;
        duration_minutes: number;
        quantity: number | null;
        unit: string | null;
        completion_status: string;
        sort_order: number;
      } =>
        Boolean(
          item.description &&
            item.category_id
        )
    );

  /*
   * Working days require at least one work
   * entry before final submission.
   */

  const noWorkEntryRequired =
    [
      "leave",
      "holiday",
      "week_off",
    ].includes(
      attendanceStatus
    );

  if (
    shouldSubmit &&
    !noWorkEntryRequired &&
    items.length === 0
  ) {
    redirectWithError(
      workDate,
      "Add at least one work entry before submitting."
    );
  }

  /*
   * Insert child entries.
   */

  if (items.length > 0) {
    const {
      error: insertItemsError,
    } = await supabase
      .from("daily_log_items")
      .insert(items);

    if (insertItemsError) {
      redirectWithError(
        workDate,
        insertItemsError.message
      );
    }
  }

  /*
   * Finalize the parent only after all child
   * entries were inserted successfully.
   */

  const {
    error: finalizeError,
  } = await supabase
    .from("daily_logs")
    .update({
      status:
        shouldSubmit
          ? "submitted"
          : "draft",

      submitted_at:
        shouldSubmit
          ? new Date().toISOString()
          : null,
    })
    .eq(
      "id",
      dailyLogId
    );

  if (finalizeError) {
    redirectWithError(
      workDate,
      finalizeError.message
    );
  }

  /*
   * Refresh all affected screens.
   */

  revalidatePath(
    "/my-timesheet"
  );

  revalidatePath(
    "/dashboard"
  );

  revalidatePath(
    "/admin/daily-logs"
  );

  revalidatePath(
    "/daily-log/new"
  );

  redirect(
    `/my-timesheet?saved=${
      shouldSubmit
        ? "submitted"
        : "draft"
    }`
  );
}