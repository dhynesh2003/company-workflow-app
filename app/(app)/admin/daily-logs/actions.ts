"use server";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function reviewDailyLog(formData:FormData){
  const {supabase,profile}=await requireRole(["admin","team_lead","reviewer"]);
  const id=String(formData.get("id"));
  const decision=String(formData.get("decision"));
  const comment=String(formData.get("review_comment")||"").trim();
  if(decision==="changes_requested"&&comment.length<3) redirect(`/admin/daily-logs?error=${encodeURIComponent("Explain what must be corrected")}`);
  const {error}=await supabase.from("daily_logs").update({status:decision,reviewed_by:profile.id,reviewed_at:new Date().toISOString(),review_comment:comment||null}).eq("id",id);
  if(error) redirect(`/admin/daily-logs?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/daily-logs");
}
