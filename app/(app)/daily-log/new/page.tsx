import { requireProfile } from "@/lib/auth";

import { saveDailyLog } from "./actions";

type DailyLogPageProps = {
  searchParams: Promise<{
    date?: string;
    error?: string;
  }>;
};

type WorkCategory = {
  id: string;
  name: string;
  measurement_type: string | null;
  default_unit: string | null;
};

type TaskOption = {
  id: string;
  title: string;
};

type DailyLogItem = {
  id?: string;
  category_id: string | null;
  task_id: string | null;
  description: string | null;
  duration_minutes: number | null;
  quantity: number | null;
  unit: string | null;
  completion_status: string | null;
};

type DailyLogRecord = {
  id: string;
  attendance_status: string | null;
  summary: string | null;
  remarks: string | null;
  status: string | null;
  daily_log_items: DailyLogItem[] | null;
};

function createEmptyRow(): DailyLogItem {
  return {
    id: undefined,
    category_id: "",
    task_id: "",
    description: "",
    duration_minutes: 0,
    quantity: null,
    unit: "",
    completion_status: "in_progress",
  };
}

export default async function DailyLogPage({
  searchParams,
}: DailyLogPageProps) {
  const { supabase, profile } =
    await requireProfile();

  const params = await searchParams;

  const workDate =
    params.date ||
    new Date().toISOString().slice(0, 10);

  const [
    categoryResult,
    taskResult,
    logResult,
  ] = await Promise.all([
    supabase
      .from("work_categories")
      .select(`
        id,
        name,
        measurement_type,
        default_unit
      `)
      .eq(
        "organization_id",
        profile.organization_id
      )
      .eq("is_active", true)
      .order("name"),

    supabase
      .from("tasks")
      .select(`
        id,
        title
      `)
      .eq(
        "organization_id",
        profile.organization_id
      )
      .eq("assigned_to", profile.id)
      .not(
        "status",
        "in",
        '("completed","cancelled")'
      )
      .order("due_date", {
        ascending: true,
        nullsFirst: false,
      }),

    supabase
      .from("daily_logs")
      .select(`
        id,
        attendance_status,
        summary,
        remarks,
        status,
        daily_log_items (
          id,
          category_id,
          task_id,
          description,
          duration_minutes,
          quantity,
          unit,
          completion_status,
          sort_order
        )
      `)
      .eq("employee_id", profile.id)
      .eq("work_date", workDate)
      .maybeSingle(),
  ]);

  if (categoryResult.error) {
    throw new Error(
      categoryResult.error.message
    );
  }

  if (taskResult.error) {
    throw new Error(
      taskResult.error.message
    );
  }

  if (logResult.error) {
    throw new Error(
      logResult.error.message
    );
  }

  const categories: WorkCategory[] =
    (categoryResult.data ??
      []) as WorkCategory[];

  const tasks: TaskOption[] =
    (taskResult.data ??
      []) as TaskOption[];

  const log =
    logResult.data as DailyLogRecord | null;

  const existingItems: DailyLogItem[] =
    log?.daily_log_items ?? [];

  const rows: DailyLogItem[] =
    existingItems.length > 0
      ? existingItems
      : Array.from(
          { length: 4 },
          createEmptyRow
        );

  const isLocked =
    log?.status === "checked";

  return (
    <div className="grid">
      <div className="page-head">
        <div>
          <h1>Daily Work Log</h1>

          <p>
            Record each work item,
            duration, output count and
            remarks.
          </p>
        </div>

        {log?.status && (
          <span
            className={`badge status-${log.status}`}
          >
            {log.status.replaceAll(
              "_",
              " "
            )}
          </span>
        )}
      </div>

      {params.error && (
        <p className="error">
          {params.error}
        </p>
      )}

      {isLocked && (
        <p className="notice">
          This daily log has already been
          checked and can no longer be
          edited.
        </p>
      )}

      <form
        action={saveDailyLog}
        className="grid"
      >
        <section className="card grid grid2">
          <label className="label">
            Date

            <input
              className="input"
              type="date"
              name="work_date"
              defaultValue={workDate}
              required
              disabled={isLocked}
            />
          </label>

          <label className="label">
            Attendance

            <select
              className="select"
              name="attendance_status"
              defaultValue={
                log?.attendance_status ||
                "working"
              }
              disabled={isLocked}
            >
              <option value="working">
                Working
              </option>

              <option value="work_from_home">
                Work from home
              </option>

              <option value="half_day">
                Half day
              </option>

              <option value="leave">
                Leave
              </option>

              <option value="permission">
                Permission
              </option>

              <option value="holiday">
                Holiday
              </option>

              <option value="week_off">
                Week off
              </option>
            </select>
          </label>
        </section>

        <section className="card">
          <div className="section-heading">
            <div>
              <h2>Work entries</h2>

              <p className="muted">
                Use one row for each type
                of work. Empty rows are
                ignored.
              </p>
            </div>
          </div>

          <div className="tablewrap">
            <table className="table logtable">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Related task</th>
                  <th>Description</th>
                  <th>Hours</th>
                  <th>Minutes</th>
                  <th>Count</th>
                  <th>Unit</th>
                  <th>Work status</th>
                </tr>
              </thead>

              <tbody>
                {rows.map(
                  (
                    row,
                    index
                  ) => {
                    const durationMinutes =
                      row.duration_minutes ??
                      0;

                    const selectedCategory =
                      categories.find(
                        (category) =>
                          category.id ===
                          row.category_id
                      );

                    const rowKey =
                      row.id ??
                      `row-${index}`;

                    return (
                      <tr key={rowKey}>
                        <td>
                          <select
                            className="select"
                            name="category_id"
                            defaultValue={
                              row.category_id ??
                              ""
                            }
                            disabled={isLocked}
                          >
                            <option value="">
                              Choose
                            </option>

                            {categories.map(
                              (
                                category
                              ) => (
                                <option
                                  key={
                                    category.id
                                  }
                                  value={
                                    category.id
                                  }
                                >
                                  {
                                    category.name
                                  }
                                </option>
                              )
                            )}
                          </select>
                        </td>

                        <td>
                          <select
                            className="select"
                            name="task_id"
                            defaultValue={
                              row.task_id ??
                              ""
                            }
                            disabled={isLocked}
                          >
                            <option value="">
                              Independent work
                            </option>

                            {tasks.map(
                              (task) => (
                                <option
                                  key={
                                    task.id
                                  }
                                  value={
                                    task.id
                                  }
                                >
                                  {
                                    task.title
                                  }
                                </option>
                              )
                            )}
                          </select>
                        </td>

                        <td>
                          <input
                            className="input wide"
                            name="description"
                            defaultValue={
                              row.description ??
                              ""
                            }
                            placeholder="What did you complete?"
                            disabled={isLocked}
                          />
                        </td>

                        <td>
                          <input
                            className="input small"
                            type="number"
                            min="0"
                            max="23"
                            name="hours"
                            defaultValue={Math.floor(
                              durationMinutes /
                                60
                            )}
                            disabled={isLocked}
                          />
                        </td>

                        <td>
                          <input
                            className="input small"
                            type="number"
                            min="0"
                            max="59"
                            name="minutes"
                            defaultValue={
                              durationMinutes %
                              60
                            }
                            disabled={isLocked}
                          />
                        </td>

                        <td>
                          <input
                            className="input small"
                            type="number"
                            min="0"
                            step="0.5"
                            name="quantity"
                            defaultValue={
                              row.quantity ??
                              ""
                            }
                            disabled={isLocked}
                          />
                        </td>

                        <td>
                          <input
                            className="input"
                            name="unit"
                            defaultValue={
                              row.unit ??
                              selectedCategory
                                ?.default_unit ??
                              ""
                            }
                            placeholder="files/videos"
                            disabled={isLocked}
                          />
                        </td>

                        <td>
                          <select
                            className="select"
                            name="completion_status"
                            defaultValue={
                              row.completion_status ??
                              "in_progress"
                            }
                            disabled={isLocked}
                          >
                            <option value="in_progress">
                              In progress
                            </option>

                            <option value="completed">
                              Completed
                            </option>

                            <option value="blocked">
                              Blocked
                            </option>
                          </select>
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card form">
          <label className="label">
            Daily summary

            <textarea
              className="textarea"
              name="summary"
              defaultValue={
                log?.summary ?? ""
              }
              placeholder="Summarize the day’s overall progress."
              disabled={isLocked}
            />
          </label>

          <label className="label">
            Remarks

            <textarea
              className="textarea"
              name="remarks"
              defaultValue={
                log?.remarks ?? ""
              }
              placeholder="Leave reason, delay, correction, support required..."
              disabled={isLocked}
            />
          </label>

          {!isLocked && (
            <div className="actions">
              <button
                className="btn secondary"
                type="submit"
                name="intent"
                value="draft"
              >
                Save draft
              </button>

              <button
                className="btn"
                type="submit"
                name="intent"
                value="submit"
              >
                Submit daily log
              </button>
            </div>
          )}
        </section>
      </form>
    </div>
  );
}