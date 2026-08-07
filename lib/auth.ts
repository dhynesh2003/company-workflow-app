import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type AppRole =
  | "employee"
  | "reviewer"
  | "team_lead"
  | "admin"
  | "super_admin";

export function homeForRole(role: string): string {
  if (role === "super_admin") {
    return "/super-admin/dashboard";
  }

  if (role === "team_lead") {
    return "/team/dashboard";
  }

  return "/dashboard";
}

export async function requireUser() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, user };
}

export async function getProfile() {
  const { supabase, user } =
    await requireUser();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return {
    supabase,
    user,
    profile: data,
  };
}

export async function requireProfile() {
  const ctx = await getProfile();

  if (!ctx.profile) {
    redirect("/setup");
  }

  if (!ctx.profile.is_active) {
    redirect("/inactive");
  }

  return {
    ...ctx,
    profile: ctx.profile,
  };
}

export async function requireRole(
  roles: string[]
) {
  const ctx = await requireProfile();

  if (!roles.includes(ctx.profile.role)) {
    redirect(
      homeForRole(ctx.profile.role)
    );
  }

  return ctx;
}

export async function requireSuperAdmin() {
  return requireRole(["super_admin"]);
}