import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) {
    if (user.role === "superadmin") {
      redirect("/admin");
    } else {
      redirect("/dashboard");
    }
  }

  redirect("/login");
}
