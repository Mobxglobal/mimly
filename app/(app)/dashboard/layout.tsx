import { getProfile } from "@/lib/actions/profile";
import { DashboardGenerationProvider } from "@/components/dashboard/dashboard-generation-context";
import { dashboardGenerationMode } from "@/lib/onboarding/generation-mode";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const profile = await getProfile();
  const mode = dashboardGenerationMode(profile?.generation_mode);

  return (
    <DashboardGenerationProvider mode={mode}>{children}</DashboardGenerationProvider>
  );
}
