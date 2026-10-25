"use client";

import React from "react";

interface StatCardProps {
  title: string;
  count: number;
  description: string;
  accentColor: "alpa" | "izin" | "sakit" | "warning";
  isActive?: boolean;
  onClick: () => void;
}

export function StatCard({
  title,
  count,
  description,
  accentColor,
  isActive = false,
  onClick,
}: StatCardProps) {
  const borderStyles = {
    alpa: "border-t-[var(--status-alpa-fg)] hover:border-red-500",
    izin: "border-t-[var(--status-izin-fg)] hover:border-blue-500",
    sakit: "border-t-[var(--board)] hover:border-emerald-500",
    warning: "border-t-[var(--terracotta)] hover:border-amber-600",
  };

  const badgeStyles = {
    alpa: "bg-[var(--status-alpa-bg)] text-[var(--status-alpa-fg)] border-[var(--status-alpa-border)]",
    izin: "bg-[var(--status-izin-bg)] text-[var(--status-izin-fg)] border-[var(--status-izin-border)]",
    sakit: "bg-[var(--status-sakit-bg)] text-[var(--status-sakit-fg)] border-[var(--status-sakit-border)]",
    warning: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`touch-target text-left w-full p-4 rounded-xl card-paper border-t-4 ${borderStyles[accentColor]} transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--board)] ${
        isActive
          ? "ring-2 ring-[var(--board)] shadow-md bg-[var(--canvas-subtle)]"
          : "hover:shadow-md hover:bg-[var(--canvas-subtle)]"
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
          {title}
        </span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${badgeStyles[accentColor]}`}
        >
          {isActive ? "Aktif" : "Filter"}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-extrabold font-heading text-[var(--ink)]">
          {count}
        </span>
        <span className="text-xs text-[var(--ink-subtle)]">siswa/kejadian</span>
      </div>
      <p className="mt-1 text-xs text-[var(--ink-muted)] line-clamp-1">{description}</p>
    </button>
  );
}
