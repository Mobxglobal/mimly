import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateDefaultWorkspaceForUser } from "@/lib/workspace/default-workspace";

export default async function WorkspaceEntryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    redirect("/login?next=/workspace");
  }

  const workspaceId = await getOrCreateDefaultWorkspaceForUser(user.id);
  redirect(`/workspace/${workspaceId}`);
}
