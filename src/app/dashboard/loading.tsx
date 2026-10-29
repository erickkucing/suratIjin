import React from "react";

export default function DashboardLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Memuat dashboard kelas..."
      className="min-h-screen bg-[var(--canvas)] p-4 sm:p-6 lg:p-8 space-y-6"
    >
      {/* Header Skeleton */}
      <div className="card-paper p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-pulse border border-[var(--border)]">
        <div className="space-y-2">
          <div className="h-7 bg-[var(--surface-hover)] rounded-lg w-48 sm:w-64" />
          <div className="h-4 bg-[var(--surface-hover)] rounded-md w-36 sm:w-48" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-10 bg-[var(--surface-hover)] rounded-xl w-32" />
          <div className="h-10 bg-[var(--surface-hover)] rounded-xl w-10" />
        </div>
      </div>

      {/* Summary Cards Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="card-paper p-5 rounded-2xl space-y-3 animate-pulse border border-[var(--border)]"
          >
            <div className="flex items-center justify-between">
              <div className="h-4 bg-[var(--surface-hover)] rounded w-20" />
              <div className="w-8 h-8 rounded-xl bg-[var(--surface-hover)]" />
            </div>
            <div className="h-8 bg-[var(--surface-hover)] rounded-lg w-16" />
          </div>
        ))}
      </div>

      {/* Main Table Skeleton */}
      <div className="card-paper p-6 rounded-2xl space-y-4 animate-pulse border border-[var(--border)]">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-2 border-b border-[var(--border)]">
          <div className="h-6 bg-[var(--surface-hover)] rounded-md w-40" />
          <div className="h-9 bg-[var(--surface-hover)] rounded-xl w-60" />
        </div>
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4, 5].map((row) => (
            <div
              key={row}
              className="h-12 bg-[var(--surface-hover)] rounded-xl w-full"
            />
          ))}
        </div>
      </div>
      <span className="sr-only">Sedang memuat data dashboard kelas...</span>
    </div>
  );
}
