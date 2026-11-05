import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth/session";

export default async function HomePage() {
  const session = await getSessionFromCookies();
  if (session?.role === "superadmin") {
    redirect("/superadmin/dashboard");
  }
  if (session?.role === "admin") {
    redirect("/admin/dashboard");
  }
  if (session?.role === "student") {
    redirect("/dashboard");
  }
  redirect("/auth");
}
