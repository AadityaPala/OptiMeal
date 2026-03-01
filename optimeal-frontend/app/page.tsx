import { redirect } from "next/navigation";

export default function Home() {
  // For now, automatically send users to the main dashboard.
  // Later, you can add logic here to route first-time users to /onboarding.
  redirect("/dashboard");
}