import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export async function requireUser(){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");return {supabase,user};}
export async function getProfile(){const {supabase,user}=await requireUser();const {data}=await supabase.from("profiles").select("*").eq("id",user.id).maybeSingle();return {supabase,user,profile:data};}
export async function requireProfile(){const ctx=await getProfile();if(!ctx.profile)redirect("/setup");if(!ctx.profile.is_active)redirect("/inactive");return {...ctx,profile:ctx.profile};}
export async function requireRole(roles:string[]){const ctx=await requireProfile();if(!roles.includes(ctx.profile.role))redirect("/dashboard");return ctx;}
