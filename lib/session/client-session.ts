export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";

  let id = sessionStorage.getItem("mimly_session_id");

  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("mimly_session_id", id);
  }

  return id;
}
