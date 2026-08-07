"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function ids(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .map(String)
    .map((value) => value.trim())
    .filter(Boolean);
}

function teamError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createTeam(formData: FormData): Promise<never> {
  const { supabase } = await requireRole(["admin"]);

  const name = text(formData, "name");
  const description = text(formData, "description");
  const teamLeadId = text(formData, "team_lead_id") || null;
  const memberIds = ids(formData, "member_ids");

  if (name.length < 2) {
    teamError("/admin/teams", "Enter a valid team name.");
  }

  const { data: teamId, error } = await supabase.rpc(
    "create_team_with_members",
    {
      p_name: name,
      p_description: description || null,
      p_team_lead_id: teamLeadId,
      p_member_ids: memberIds,
    }
  );

  if (error) {
    teamError("/admin/teams", error.message);
  }

  if (!teamId) {
    teamError("/admin/teams", "The team could not be created.");
  }

  revalidatePath("/admin/teams");
  revalidatePath("/admin/users");
  revalidatePath("/admin/hierarchy");
  revalidatePath("/tasks/new");

  redirect(`/admin/teams/${teamId}?saved=created`);
}

export async function updateTeam(formData: FormData): Promise<never> {
  const { supabase } = await requireRole(["admin"]);

  const teamId = text(formData, "team_id");
  const name = text(formData, "name");
  const description = text(formData, "description");
  const teamLeadId = text(formData, "team_lead_id") || null;
  const isActive = formData.get("is_active") === "on";

  if (!teamId) {
    redirect("/admin/teams?error=Team%20ID%20is%20missing");
  }

  const { error } = await supabase.rpc("update_team_details", {
    p_team_id: teamId,
    p_name: name,
    p_description: description || null,
    p_team_lead_id: teamLeadId,
    p_is_active: isActive,
  });

  if (error) {
    teamError(`/admin/teams/${teamId}`, error.message);
  }

  revalidatePath("/admin/teams");
  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath("/admin/users");
  revalidatePath("/admin/hierarchy");
  revalidatePath("/tasks/new");

  redirect(`/admin/teams/${teamId}?saved=details`);
}

export async function saveMembers(formData: FormData): Promise<never> {
  const { supabase } = await requireRole(["admin", "team_lead"]);

  const teamId = text(formData, "team_id");
  const memberIds = ids(formData, "member_ids");

  if (!teamId) {
    redirect("/admin/teams?error=Team%20ID%20is%20missing");
  }

  const { error } = await supabase.rpc("save_team_members", {
    p_team_id: teamId,
    p_member_ids: memberIds,
  });

  if (error) {
    teamError(`/admin/teams/${teamId}`, error.message);
  }

  revalidatePath("/admin/teams");
  revalidatePath(`/admin/teams/${teamId}`);
  revalidatePath("/admin/users");
  revalidatePath("/admin/hierarchy");
  revalidatePath("/tasks/new");
  revalidatePath("/dashboard");

  redirect(`/admin/teams/${teamId}?saved=members`);
}
