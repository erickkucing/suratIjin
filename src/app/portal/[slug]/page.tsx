import { notFound } from "next/navigation";
import { db } from "@/db";
import { classes, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkParentAccess } from "@/lib/auth";
import { getClassDashboardData } from "@/db/queries";
import { PortalClient } from "./portal-client";

interface PortalPageProps {
  params: Promise<{ slug: string }>;
}

export default async function PortalPage({ params }: PortalPageProps) {
  const { slug } = await params;

  const classItem = await db.query.classes.findFirst({
    where: eq(classes.slug, slug),
  });

  if (!classItem || !classItem.isActive) {
    notFound();
  }

  // Fetch teacher's name
  let teacherName = "Wali Kelas";
  if (classItem.waliKelasId) {
    const teacher = await db.query.users.findFirst({
      where: eq(users.id, classItem.waliKelasId),
    });
    if (teacher) {
      teacherName = teacher.displayName;
    }
  }

  const hasPassword = Boolean(classItem.parentPasswordHash);
  const isUnlocked = !hasPassword || (await checkParentAccess(slug));

  let dashboardData = null;
  if (isUnlocked) {
    dashboardData = await getClassDashboardData(classItem.id);
  }

  return (
    <PortalClient
      isUnlocked={isUnlocked}
      classSlug={slug}
      data={dashboardData}
      teacherName={teacherName}
      classNameTitle={classItem.name}
      academicYear={classItem.academicYear}
    />
  );
}
