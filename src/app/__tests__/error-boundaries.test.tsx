import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import NotFound from "../not-found";
import ErrorBoundary from "../error";
import GlobalError from "../global-error";
import Loading from "../loading";
import DashboardLoading from "../dashboard/loading";

describe("Next.js App Boundaries & Fallbacks", () => {
  it("should render NotFound component with 404 message and navigation links", () => {
    const html = renderToStaticMarkup(<NotFound />);
    expect(html).toContain("404");
    expect(html).toContain("Halaman Tidak Ditemukan");
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/login"');
  });

  it("should render ErrorBoundary with retry button and safe messaging", () => {
    const dummyError = new Error("Database timeout test error");
    (dummyError as Error & { digest?: string }).digest = "ERR_TEST_123";
    const resetFn = vi.fn();
    const html = renderToStaticMarkup(<ErrorBoundary error={dummyError} reset={resetFn} />);
    expect(html).toContain("Gagal Memuat Halaman");
    expect(html).toContain("Coba Lagi");
    expect(html).toContain("ERR_TEST_123");
  });

  it("should render GlobalError with emergency html and body structure", () => {
    const dummyError = new Error("Fatal root layout error");
    const resetFn = vi.fn();
    const html = renderToStaticMarkup(<GlobalError error={dummyError} reset={resetFn} />);
    expect(html).toContain("<html");
    expect(html).toContain("<body");
    expect(html).toContain("Terjadi Kendala Sistem");
    expect(html).toContain("Muat Ulang Aplikasi");
  });

  it("should render Loading skeletons with polite accessible status", () => {
    const rootLoading = renderToStaticMarkup(<Loading />);
    expect(rootLoading).toContain('role="status"');
    expect(rootLoading).toContain("Memuat konten...");

    const dashboardLoading = renderToStaticMarkup(<DashboardLoading />);
    expect(dashboardLoading).toContain('role="status"');
    expect(dashboardLoading).toContain("Memuat dashboard kelas...");
  });
});
