import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkspaceState } from "@/lib/actions/workspace";

function buildWorkspaceName(prompt: string): string {
  const raw = prompt.trim();
  if (!raw) return "New Workspace";
  const stripped = raw
    .replace(/^help me create\s*/i, "")
    .replace(/^create\s*/i, "")
    .replace(/^make\s*/i, "")
    .replace(/^memes?\s*for\s*/i, "")
    .replace(/^some\s*/i, "")
    .replace(/^a\s*/i, "")
    .replace(/^an\s*/i, "")
    .replace(/\s*for social media$/i, "")
    .trim();
  const words = (stripped || raw)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  const base = words.join(" ");
  return base ? `${base} Content` : "Workspace Content";
}

type PageProps = {
  params: Promise<{ workspaceId: string }>;
};

export default async function WorkspaceSettingsPage({ params }: PageProps) {
  const { workspaceId } = await params;
  const { state, error } = await getWorkspaceState(workspaceId);
  if (error || !state) notFound();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_bottom,_rgba(251,146,60,0.18)_0%,_rgba(255,255,255,1)_32%)] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-3xl border border-stone-200/90 bg-white/95 p-6 shadow-[0_8px_30px_rgba(10,10,10,0.05)]">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-semibold text-stone-900">Workspace settings</h1>
            <Link
              href={`/workspace/${workspaceId}`}
              className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50"
            >
              Back to workspace
            </Link>
          </div>

          <div className="mt-6">
            <label
              htmlFor="workspace-name"
              className="mb-2 block text-sm font-medium text-stone-700"
            >
              Workspace name
            </label>
            <input
              id="workspace-name"
              defaultValue={buildWorkspaceName(state.workspace.initial_prompt)}
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />
            <p className="mt-2 text-xs text-stone-500">
              Name editing is available in this MVP settings view. Persistent save can be wired next.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

