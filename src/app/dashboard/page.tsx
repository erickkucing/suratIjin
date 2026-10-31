import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { classes } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { getClassDashboardData } from "@/db/queries";
import { getSystemSettings } from "@/lib/system-settings";
import { AppFooter } from "@/components/app-footer";
import { DashboardClient } from "./dashboard-client";

interface DashboardPageProps {
  searchParams: Promise<{ classId?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const { classId: paramClassId } = await searchParams;

  // Fetch classes accessible to this user
  let userClasses = [];
  if (user.role === "superadmin") {
    userClasses = await db.query.classes.findMany({
      where: eq(classes.isActive, true),
      orderBy: asc(classes.name),
    });
  } else {
    userClasses = await db.query.classes.findMany({
      where: eq(classes.waliKelasId, user.id),
      orderBy: asc(classes.name),
    });

    // If teacher has no assigned class, check all active classes
    if (userClasses.length === 0) {
      userClasses = await db.query.classes.findMany({
        where: eq(classes.isActive, true),
        orderBy: asc(classes.name),
      });
    }
  }

  if (userClasses.length === 0) {
    const settings = await getSystemSettings();
    return (
      <div className="min-h-screen flex flex-col justify-between p-6 bg-[var(--canvas)] text-[var(--ink)]">
        <div className="flex-1 flex items-center justify-center">
          <div className="card-paper p-8 rounded-2xl max-w-md text-center space-y-4">
            <h1 className="text-xl font-bold font-heading">Belum Ada Kelas Tersedia</h1>
            <p className="text-sm text-[var(--ink-muted)]">
              Hubungi Superadmin untuk membuat kelas atau menugaskan Anda sebagai Wali Kelas.
            </p>
            <a
              href="/login"
              className="inline-block px-4 py-2 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-sm font-semibold transition-colors"
            >
              Kembali ke Login
            </a>
          </div>
        </div>
        <AppFooter text={settings.footerText} />
      </div>
    );
  }

  let selectedClassId = userClasses[0].id;
  if (paramClassId) {
    const parsed = parseInt(paramClassId, 10);
    if (!isNaN(parsed) && userClasses.some((c) => c.id === parsed)) {
      selectedClassId = parsed;
    }
  }

  const dashboardData = await getClassDashboardData(selectedClassId);
  const settings = await getSystemSettings();

  return (
    <DashboardClient
      initialData={dashboardData}
      user={user}
      classesList={userClasses}
      currentClassId={selectedClassId}
      logoUrl={settings.logoUrl}
      footerText={settings.footerText}
      aiEnabled={settings.aiEnabled}
    />
  );
}
