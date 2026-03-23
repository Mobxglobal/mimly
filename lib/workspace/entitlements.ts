import { createWorkspaceAdminClient } from "@/lib/workspace/auth";

export type WorkspacePlanCode = "starter_pack" | "unlimited";

type EntitlementRow = {
  id: string;
  plan_code: WorkspacePlanCode;
  status: "active" | "inactive";
  starts_at: string;
  ends_at: string | null;
};

function isNotExpired(endsAt: string | null): boolean {
  if (!endsAt) return true;
  const t = new Date(endsAt).getTime();
  if (Number.isNaN(t)) return false;
  return t > Date.now();
}

function isActiveEntitlement(row: EntitlementRow): boolean {
  if (row.status !== "active") return false;
  if (row.plan_code !== "starter_pack" && row.plan_code !== "unlimited") return false;
  return isNotExpired(row.ends_at);
}

export async function getActiveEntitlement(userId: string): Promise<EntitlementRow | null> {
  const admin = createWorkspaceAdminClient();
  const { data, error } = await admin
    .schema("public")
    .from("entitlements")
    .select("id, plan_code, status, starts_at, ends_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("plan_code", ["starter_pack", "unlimited"])
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("[workspace-entitlements] select failed", error);
    return null;
  }

  const rows = (data ?? []) as EntitlementRow[];
  return rows.find(isActiveEntitlement) ?? null;
}

export async function hasActiveEntitlement(userId: string): Promise<boolean> {
  const row = await getActiveEntitlement(userId);
  return Boolean(row);
}

export async function hasActiveEntitlementForPlan(
  userId: string,
  planCode: WorkspacePlanCode
): Promise<boolean> {
  const row = await getActiveEntitlement(userId);
  return Boolean(row && row.plan_code === planCode);
}
