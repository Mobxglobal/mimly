import { notFound } from "next/navigation";
import { getWorkspaceState } from "@/lib/actions/workspace";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

type PageProps = {
  params: Promise<{ workspaceId: string }>;
};

export default async function WorkspacePage({ params }: PageProps) {
  const { workspaceId } = await params;
  const { state, error } = await getWorkspaceState(workspaceId);
  if (error || !state) notFound();

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-200/85 via-sky-100/90 to-sky-50/95 px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-[1400px]">
        <WorkspaceShell workspaceId={workspaceId} initialState={state} />
      </div>
    </main>
  );
}
