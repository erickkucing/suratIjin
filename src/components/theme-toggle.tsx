"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const hasDark = document.documentElement.classList.contains("dark");
    setIsDark(hasDark);
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("surat_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("surat_theme", "light");
    }
  };

  if (!mounted) {
    return (
      <div className="w-10 h-10 rounded-lg bg-black/5 dark:bg-white/5 animate-pulse" />
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="touch-target inline-flex items-center justify-center w-10 h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--canvas-subtle)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
      aria-label={isDark ? "Beralih ke mode terang" : "Beralih ke mode gelap"}
      title={isDark ? "Mode Terang" : "Mode Gelap"}
    >
      {isDark ? (
        <Sun className="w-5 h-5 text-amber-400" aria-hidden="true" />
      ) : (
        <Moon className="w-5 h-5 text-[var(--ink-muted)]" aria-hidden="true" />
      )}
    </button>
  );
}
