import { redirect } from "next/navigation";

export default function Home() {
  // Unauthenticated users are sent to /login.
  // The login page itself will forward already-authenticated users to /dashboard.
  redirect("/login");
}