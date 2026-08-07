"use server";
import { requireRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function reviewSubmission(formData:FormData){
  const {supabase}=await requireRole(["reviewer","team_lead","admin"]);
  const submissionId=String(formData.get("submission_id"));
  const taskId=String(formData.get("task_id"));
  const decision=String(formData.get("decision"));
  const comment=String(formData.get("comment")||"");
  const reassignTo=String(formData.get("reassign_to")||"")||null;
  const {error}=await supabase.rpc("review_task_submission",{
    p_submission_id:submissionId,
    p_decision:decision,
    p_comment:comment,
    p_reassign_to:reassignTo
  });
  if(error) redirect(`/reviews/${submissionId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/reviews");
  revalidatePath(`/tasks/${taskId}`);
  redirect("/reviews?updated=1");
}
