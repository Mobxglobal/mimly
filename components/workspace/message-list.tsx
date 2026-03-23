import type { WorkspaceMessage } from "@/lib/actions/workspace";

function getText(content: Record<string, unknown>): string {
  const value = content?.text;
  if (typeof value === "string" && value.trim()) return value;
  return JSON.stringify(content);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(d);
}

function badgeClass(type: WorkspaceMessage["message_type"]): string {
  if (type === "gate_notice") return "border-amber-200 bg-amber-50 text-amber-700";
  if (type === "generation_result")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (type === "status") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-stone-200 bg-stone-100 text-stone-600";
}

export function MessageList({
  messages,
  onPillClick,
}: {
  messages: WorkspaceMessage[];
  onPillClick?: (message: string) => void | Promise<void>;
}) {
  return (
    <div className="space-y-3 pt-1">
      {messages.map((message) => {
        const isUser = message.role === "user";
        const isAssistant = message.role === "assistant";
        const pillRows = Array.isArray(message.metadata?.ui_pills)
          ? (message.metadata.ui_pills as Array<{
              label?: unknown;
              message?: unknown;
              kind?: unknown;
            }>)
              .map((pill) => ({
                label: typeof pill.label === "string" ? pill.label : "",
                message:
                  typeof pill.message === "string" ? pill.message : "",
                kind: pill.kind === "format" ? "format" : "action",
              }))
              .filter((pill) => pill.label && pill.message)
          : [];
        return (
          <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[78%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-[0_3px_12px_rgba(20,20,20,0.04)] ${
                isUser
                  ? "border border-stone-200 bg-white text-stone-900"
                  : isAssistant
                    ? "border border-sky-100 bg-sky-50/65 text-stone-800"
                    : "border border-stone-200 bg-stone-50 text-stone-700"
              }`}
            >
            <p className="whitespace-pre-wrap">{getText(message.content)}</p>
            {isAssistant && pillRows.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2.5">
                {pillRows.slice(0, 4).map((pill, index) => (
                  <button
                    key={`${message.id}-pill-${index}-${pill.label}`}
                    type="button"
                    onClick={() => {
                      if (!onPillClick) return;
                      void onPillClick(pill.message);
                    }}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                      pill.kind === "format"
                        ? "border-sky-200 bg-white text-sky-700 hover:bg-sky-50"
                        : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className={`mt-1.5 text-[10px] text-stone-400 ${isUser ? "text-right" : "text-left"}`}>
              {formatTime(message.created_at)}
            </div>
            </div>
          </div>
        );
      })}
      {messages.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 text-sm text-stone-500">
          <p>You are all set. Ask for your next batch and I will generate fresh directions.</p>
          <p className="mt-2 text-xs text-stone-500">Choose a format to start:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              { label: "Square Image", message: "Create a square image meme for this direction." },
              { label: "Square Video", message: "Create a square video meme for this direction." },
              { label: "Square Text", message: "Create a square text meme for this direction." },
              { label: "Slideshow", message: "Create a vertical slideshow for this direction." },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => {
                  if (!onPillClick) return;
                  void onPillClick(option.message);
                }}
                className="rounded-full border border-sky-200 bg-sky-50/70 px-2.5 py-1 text-[11px] font-medium text-sky-700 transition hover:bg-sky-100"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
