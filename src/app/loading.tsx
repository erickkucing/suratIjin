import React from "react";

export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Memuat konten..."
      className="min-h-screen flex items-center justify-center p-6 bg-[var(--canvas)]"
    >
      <div className="card-paper p-8 rounded-2xl max-w-sm w-full space-y-4 animate-pulse border border-[var(--border)]">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-[var(--surface-hover)]" />
        <div className="h-5 bg-[var(--surface-hover)] rounded-md w-3/4 mx-auto" />
        <div className="space-y-2 pt-2">
          <div className="h-3 bg-[var(--surface-hover)] rounded w-full" />
          <div className="h-3 bg-[var(--surface-hover)] rounded w-5/6 mx-auto" />
        </div>
        <span className="sr-only">Sedang memuat data...</span>
      </div>
    </div>
  );
}
