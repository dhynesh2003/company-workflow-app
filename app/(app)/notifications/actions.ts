"use server";
import { requireProfile } from "@/lib/auth";
import { revalidatePath } from "next/cache";
export async function markNotificationRead(formData:FormData){
 const {supabase,profile}=await requireProfile();
 const id=String(formData.get("id")||"");
 await supabase.from("notifications").update({is_read:true,read_at:new Date().toISOString()}).eq("id",id).eq("recipient_id",profile.id);
 revalidatePath("/notifications");revalidatePath("/dashboard");
}
export async function markAllNotificationsRead(){
 const {supabase,profile}=await requireProfile();
 await supabase.from("notifications").update({is_read:true,read_at:new Date().toISOString()}).eq("recipient_id",profile.id).eq("is_read",false);
 revalidatePath("/notifications");revalidatePath("/dashboard");
}
