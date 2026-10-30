// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppFooter } from "../app-footer";
import { DEFAULT_SYSTEM_SETTINGS } from "@/lib/system-settings-constants";

describe("AppFooter Component", () => {
  it("renders default footer text when no text prop is provided", () => {
    render(<AppFooter />);
    const currentYear = new Date().getFullYear();
    const footerElement = screen.getByRole("contentinfo");

    expect(footerElement).toBeDefined();
    expect(footerElement.textContent).toContain(`© ${currentYear} ${DEFAULT_SYSTEM_SETTINGS.footerText}`);
  });

  it("renders custom footer text configured by admin", () => {
    const customAdminText = "SMK Negeri 1 Surabaya - Hak Cipta Dilindungi.";
    render(<AppFooter text={customAdminText} />);
    const currentYear = new Date().getFullYear();
    const footerElement = screen.getByRole("contentinfo");

    expect(footerElement).toBeDefined();
    expect(footerElement.textContent).toContain(`© ${currentYear} ${customAdminText}`);
  });

  it("handles whitespace-only text prop by falling back to default", () => {
    render(<AppFooter text="   " />);
    const currentYear = new Date().getFullYear();
    const footerElement = screen.getByRole("contentinfo");

    expect(footerElement).toBeDefined();
    expect(footerElement.textContent).toContain(`© ${currentYear} ${DEFAULT_SYSTEM_SETTINGS.footerText}`);
  });

  it("applies custom className correctly", () => {
    render(<AppFooter text="Custom Text" className="custom-class pb-20" />);
    const footerElement = screen.getByRole("contentinfo");

    expect(footerElement.className).toContain("custom-class");
    expect(footerElement.className).toContain("pb-20");
  });
});
