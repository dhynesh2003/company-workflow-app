"use server";

import { redirect } from "next/navigation";

import {
  homeForRole,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function login(
  formData: FormData
) {
  const supabase =
    await createClient();

  const email = String(
    formData.get("email") || ""
  ).trim();

  const password = String(
    formData.get("password") || ""
  );

  const {
    data,
    error,
  } =
    await supabase.auth.signInWithPassword({
      email,
      password,
    });

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent(
        error.message
      )}`
    );
  }

  const user = data.user;

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select(`
      role,
      is_active
    `)
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    redirect(
      `/login?error=${encodeURIComponent(
        profileError.message
      )}`
    );
  }

  if (!profile) {
    redirect("/setup");
  }

  if (!profile.is_active) {
    redirect("/inactive");
  }

  redirect(
    homeForRole(profile.role)
  );
}