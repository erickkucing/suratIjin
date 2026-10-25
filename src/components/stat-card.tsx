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
  const dotStyles = {
    alpa: "bg-[var(--status-alpa-fg)]",
    izin: "bg-[var(--status-izin-fg)]",
    sakit: "bg-[var(--status-sakit-fg)]",
    warning: "bg-[var(--status-sakit-fg)]",
  };

  const badgeStyles = {
    alpa: "bg-[var(--status-alpa-bg)] text-[var(--status-alpa-fg)] border-[var(--status-alpa-border)]",
    izin: "bg-[var(--status-izin-bg)] text-[var(--status-izin-fg)] border-[var(--status-izin-border)]",
    sakit: "bg-[var(--status-sakit-bg)] text-[var(--status-sakit-fg)] border-[var(--status-sakit-border)]",
    warning: "bg-[var(--status-sakit-bg)] text-[var(--status-sakit-fg)] border-[var(--status-sakit-border)]",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`touch-target text-left w-full p-4 sm:p-5 rounded-2xl card-paper transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] ${
        isActive
          ? "ring-2 ring-[var(--primary)] shadow-sm bg-[var(--canvas-subtle)]"
          : "hover:shadow-sm hover:bg-[var(--canvas-subtle)]"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${dotStyles[accentColor]}`} />
          <span className="text-xs font-semibold text-[var(--ink-muted)]">
            {title}
          </span>
        </div>
        <span
          className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${badgeStyles[accentColor]}`}
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
