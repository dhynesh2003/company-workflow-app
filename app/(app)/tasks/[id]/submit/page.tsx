import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { DraftForm } from "@/components/draft-form";
import { SubmitButton } from "@/components/submit-button";
import { FlashMessage } from "@/components/flash-message";
import { submitWork } from "./actions";

export default async function SubmitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase, profile } = await requireProfile();
  const { data: task } = await supabase.from("tasks").select("id,title,status,assigned_to,required_evidence").eq("id", id).maybeSingle();
  if (!task) notFound();
  if (task.assigned_to !== profile.id) redirect(`/tasks/${id}`);

  return (
    <div className="grid">
      <div className="page-head"><div><h1>Submit work</h1><p>{task.title}</p></div></div>
      {query.error && <FlashMessage type="error">{query.error}</FlashMessage>}
      <section className="card">
        <p><strong>Required evidence:</strong> {task.required_evidence || "No special evidence specified."}</p>
        <DraftForm action={submitWork} className="form" storageKey={`task-submission-${id}-${profile.id}`} statusLabel="Submission draft">
          <input type="hidden" name="task_id" value={id} />
          <label className="label">Completion note<textarea className="textarea" name="completion_note" required minLength={5} placeholder="Explain what was completed and any important details." /></label>
          <label className="label">External link (optional)<input className="input" type="url" name="external_link" placeholder="https://..." /></label>
          <div className="grid grid2">
            <label className="label">Hours spent<input className="input" type="number" min="0" name="hours" defaultValue="0" /></label>
            <label className="label">Minutes<input className="input" type="number" min="0" max="59" name="minutes" defaultValue="0" /></label>
          </div>
          <label className="label">Evidence files<input className="input file-input" type="file" name="files" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.mp4,.zip" /><span className="muted">Up to 10 files, maximum 50 MB each. Files are checked before upload.</span></label>
          <SubmitButton pendingText="Uploading and submitting...">Submit for review</SubmitButton>
        </DraftForm>
      </section>
    </div>
  );
}
