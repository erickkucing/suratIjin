// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PwaSplashScreen } from "../pwa-splashscreen";

describe("PwaSplashScreen Component (WCAG 2.2 AA & PWA Lifecycle)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.documentElement.className = "";
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.documentElement.className = "";
  });

  it("renders with polite accessible status, aria-label, and hidden announcement", () => {
    render(
      <PwaSplashScreen
        appName="Sistem Surat Izin Siswa"
        schoolName="SMK Negeri 1 Surabaya"
        logoUrl="/custom-logo.png"
      />
    );

    const splash = screen.getByRole("status");
    expect(splash).toBeDefined();
    expect(splash.getAttribute("aria-live")).toBe("polite");
    expect(splash.getAttribute("aria-label")).toBe("Memuat Sistem Surat Izin Siswa");

    // Title and Subtitle
    expect(screen.getByText("Sistem Surat Izin Siswa")).toBeDefined();
    expect(screen.getByText("SMK Negeri 1 Surabaya")).toBeDefined();

    // Screen reader text for accessibility
    const srText = screen.getByText("Sedang memuat aplikasi...");
    expect(srText).toBeDefined();
    expect(srText.className).toContain("sr-only");
  });

  it("handles logo image loading error by falling back to standard icon", () => {
    render(
      <PwaSplashScreen
        appName="Presensi Sekolah"
        logoUrl="/broken-logo.png"
      />
    );

    const img = screen.getByRole("img", { name: "Presensi Sekolah" });
    expect(img.getAttribute("src")).toBe("/broken-logo.png");

    // Simulate error event
    fireEvent.error(img);
    expect(img.getAttribute("src")).toBe("/icons/icon-192x192.png");
  });

  it("dismisses automatically and cleans up classes when pwa-standalone-active is present", () => {
    document.documentElement.classList.add("pwa-standalone-active");

    const { unmount } = render(
      <PwaSplashScreen
        appName="Presensi Sekolah"
      />
    );

    const splash = document.getElementById("pwa-splash");
    expect(splash).not.toBeNull();

    // Simulate window load or document ready
    act(() => {
      window.dispatchEvent(new Event("load"));
    });

    // Check transition styles applied
    expect(splash?.style.opacity).toBe("0");
    expect(splash?.style.pointerEvents).toBe("none");

    // Fast forward 300ms transition timeout
    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(splash?.style.display).toBe("none");
    expect(document.documentElement.classList.contains("pwa-standalone-active")).toBe(false);

    unmount();
  });

  it("does not trigger dismiss when pwa-standalone-active is not on root element", () => {
    render(
      <PwaSplashScreen
        appName="Presensi Sekolah"
      />
    );

    const splash = document.getElementById("pwa-splash");
    expect(splash).not.toBeNull();

    act(() => {
      window.dispatchEvent(new Event("load"));
      vi.advanceTimersByTime(500);
    });

    // Opacity remains default because standalone mode was not active
    expect(splash?.style.opacity).toBe("");
  });
});
