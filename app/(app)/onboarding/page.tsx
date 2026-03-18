import { redirect } from "next/navigation";

export default function OnboardingPage() {
  // Auth happens at the end of onboarding for MVP.
  redirect("/onboarding/analyze");
}
