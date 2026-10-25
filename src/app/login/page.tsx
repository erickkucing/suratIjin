import { School } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "./login-form";
import { getSystemSettings } from "@/lib/system-settings";

interface LoginPageProps {
  searchParams?: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const settings = await getSystemSettings();
  const resolvedParams = searchParams ? await searchParams : {};
  const nextPath = resolvedParams.next || "/dashboard";

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[var(--canvas)] text-[var(--ink)]">
      <header className="px-6 py-4 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center gap-3">
          {settings.logoUrl ? (
            <img
              src={settings.logoUrl}
              alt="Logo Sekolah"
              className="w-9 h-9 sm:w-10 sm:h-10 object-contain shrink-0"
            />
          ) : (
            <div className="p-2 rounded-xl bg-[var(--primary-light)] text-[var(--primary)] shadow-xs flex items-center justify-center shrink-0">
              <School className="w-5 h-5" />
            </div>
          )}
          <div>
            <h1 className="text-base font-bold font-heading text-[var(--ink)]">
              {settings.appName}
            </h1>
            <p className="text-xs text-[var(--ink-muted)]">Arsip Digital &amp; Rekapitulasi Presensi</p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md card-journal-elevated rounded-2xl overflow-hidden border border-[var(--border)]">
          <div className="px-6 pt-8 pb-2 text-center bg-[var(--surface)]">
            {settings.logoUrl ? (
              <div className="mb-3 flex justify-center">
                <img
                  src={settings.logoUrl}
                  alt="Logo Sekolah"
                  className="w-16 h-16 object-contain"
                />
              </div>
            ) : (
              <div className="inline-flex p-3 rounded-2xl bg-[var(--primary-light)] text-[var(--primary)] mb-3">
                <School className="w-6 h-6" />
              </div>
            )}
            <h2 className="text-xl font-bold font-heading text-[var(--ink)]">Selamat Datang</h2>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              Masuk sebagai Wali Kelas atau Superadmin
            </p>
          </div>

          <LoginForm nextPath={nextPath} />
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-[var(--ink-muted)]">
        &copy; {new Date().getFullYear()} {settings.appName}. Dibuat untuk kenyamanan guru dan orang tua.
      </footer>
    </div>
  );
}
