"use server";

import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  email: string | null;
  brand_name: string | null;
  what_you_do: string | null;
  audience: string | null;
  country: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !data) return null;
  return data as Profile;
}

export type UpsertProfileInput = {
  email: string;
  brand_name: string;
  what_you_do: string;
  audience: string;
  country: string;
  completeOnboarding?: boolean;
};

export async function upsertProfile(input: UpsertProfileInput): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const row = {
    id: user.id,
    email: input.email.trim() || null,
    brand_name: input.brand_name.trim() || null,
    what_you_do: input.what_you_do.trim() || null,
    audience: input.audience.trim() || null,
    country: input.country.trim() || null,
    updated_at: new Date().toISOString(),
    ...(input.completeOnboarding
      ? { onboarding_completed_at: new Date().toISOString() }
      : {}),
  };

  const { error } = await supabase.from("profiles").upsert(row, {
    onConflict: "id",
  });

  return { error: error?.message ?? null };
}
