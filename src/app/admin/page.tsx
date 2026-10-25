import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAdminOverviewData } from "@/db/queries";
import { getSystemSettings } from "@/lib/system-settings";
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
  const settings = await getSystemSettings();

  return (
    <AdminClient
      initialClasses={overview.classes}
      initialTeachers={overview.teachers}
      initialSettings={settings}
      superadminName={user.displayName}
    />
  );
}
