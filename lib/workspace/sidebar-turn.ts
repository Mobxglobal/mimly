import type { WorkspaceMessage } from "@/lib/actions/workspace";

export type SidebarTurnViewModel = {
  userMessage: WorkspaceMessage | null;
  assistantMessage: WorkspaceMessage | null;
  isLocked: boolean;
};

type SidebarTurnInput = {
  messages: WorkspaceMessage[];
  isAuthLocked: boolean;
  isAuthenticated: boolean;
  linkedAt: string | null;
};

function afterLinkedAt(
  messages: WorkspaceMessage[],
  isAuthenticated: boolean,
  linkedAt: string | null
): WorkspaceMessage[] {
  if (!isAuthenticated || !linkedAt) return messages;
  const linkedAtMs = Date.parse(linkedAt);
  if (Number.isNaN(linkedAtMs)) return messages;
  return messages.filter((message) => {
    const messageMs = Date.parse(message.created_at);
    if (Number.isNaN(messageMs)) return true;
    return messageMs >= linkedAtMs;
  });
}

export function getLatestSidebarTurn({
  messages,
  isAuthLocked,
  isAuthenticated,
  linkedAt,
}: SidebarTurnInput): SidebarTurnViewModel {
  const visibleMessages = afterLinkedAt(messages, isAuthenticated, linkedAt);
  const latestUser =
    [...visibleMessages]
      .reverse()
      .find((message) => message.role === "user" && message.message_type === "text") ?? null;

  if (isAuthLocked) {
    const blockedAuthMessage =
      [...visibleMessages]
        .reverse()
        .find(
          (message) =>
            message.message_type === "gate_notice" &&
            String(message.metadata?.reason ?? "") === "blocked_auth"
        ) ?? null;
    return {
      userMessage: latestUser,
      assistantMessage: blockedAuthMessage,
      isLocked: true,
    };
  }

  const assistantAfterUser = latestUser
    ? [...visibleMessages]
        .reverse()
        .find(
          (message) =>
            message.id !== latestUser.id &&
            message.role !== "user" &&
            Date.parse(message.created_at) >= Date.parse(latestUser.created_at)
        ) ?? null
    : null;

  const latestAssistant =
    assistantAfterUser ??
    [...visibleMessages]
      .reverse()
      .find((message) => message.role !== "user") ??
    null;

  return {
    userMessage: latestUser,
    assistantMessage: latestAssistant,
    isLocked: false,
  };
}
