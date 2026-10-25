import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAdminOverviewData } from "@/db/queries";
import { AdminClient } from "./admin-client";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  if (user.role !== "superadmin") {
    redirect("/dashboard");
  }

  const overview = await getAdminOverviewData();

  return (
    <AdminClient
      initialClasses={overview.classes}
      initialTeachers={overview.teachers}
      superadminName={user.displayName}
    />
  );
}
