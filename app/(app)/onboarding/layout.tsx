import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateDefaultWorkspaceForUser } from "@/lib/workspace/default-workspace";

export default async function OnboardingLayout({
  children: _children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.id) {
    const workspaceId = await getOrCreateDefaultWorkspaceForUser(user.id);
    redirect(`/workspace/${workspaceId}`);
  }

  redirect("/");
}
