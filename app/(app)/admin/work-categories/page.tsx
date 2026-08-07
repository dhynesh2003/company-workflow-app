import { requireRole } from "@/lib/auth";
import { addCategory, toggleCategory } from "./actions";

export default async function Categories() {
  const { supabase } = await requireRole(["admin"]);
  const { data, error } = await supabase
    .from("work_categories")
    .select("*")
    .order("name");

  const categories = data ?? [];

  return (
    <div className="grid">
      <div>
        <h1>Work Categories</h1>
        <p className="muted">
          Add new production types without changing the database structure.
        </p>
      </div>

      {error && (
        <p className="error">Unable to load work categories: {error.message}</p>
      )}

      <section className="card">
        <form action={addCategory} className="grid grid4">
          <label className="label">
            Category name
            <input className="input" name="name" required />
          </label>
          <label className="label">
            Measurement
            <select className="select" name="measurement_type">
              <option value="time">Time</option>
              <option value="quantity">Quantity</option>
              <option value="time_and_quantity">Time and quantity</option>
              <option value="text_only">Text only</option>
            </select>
          </label>
          <label className="label">
            Default unit
            <input
              className="input"
              name="default_unit"
              placeholder="files, videos, quizzes"
            />
          </label>
          <button className="btn" style={{ alignSelf: "end" }}>
            Add category
          </button>
        </form>
      </section>

      <section className="card tablewrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Measurement</th>
              <th>Unit</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category: any) => (
              <tr key={category.id}>
                <td>{category.name}</td>
                <td>{category.measurement_type?.replaceAll("_", " ") ?? "—"}</td>
                <td>{category.default_unit || "—"}</td>
                <td>{category.is_active ? "Active" : "Inactive"}</td>
                <td>
                  <form action={toggleCategory}>
                    <input type="hidden" name="id" value={category.id} />
                    <input
                      type="hidden"
                      name="active"
                      value={String(category.is_active)}
                    />
                    <button className="btn secondary">
                      {category.is_active ? "Disable" : "Enable"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {!error && categories.length === 0 && (
              <tr><td colSpan={5}>No work categories found.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
