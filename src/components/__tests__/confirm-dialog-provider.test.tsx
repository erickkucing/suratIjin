// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import {
  ConfirmDialogProvider,
  useConfirmDialog,
} from "../confirm-dialog-provider";

function TestConsumer() {
  const { confirm, alert } = useConfirmDialog();

  return (
    <div>
      <button
        onClick={async () => {
          const res = await confirm({
            title: "Hapus Siswa?",
            message: "Data siswa akan dihapus permanen.",
            confirmText: "Hapus",
            cancelText: "Batal",
            variant: "danger",
          });
          const resultEl = document.getElementById("result");
          if (resultEl) resultEl.textContent = res ? "CONFIRMED" : "CANCELLED";
        }}
      >
        Trigger Confirm Danger
      </button>

      <button
        onClick={async () => {
          await alert({
            title: "Informasi Penting",
            message: "Pemberitahuan telah berhasil disimpan.",
            confirmText: "Tutup",
            variant: "info",
          });
          const resultEl = document.getElementById("result");
          if (resultEl) resultEl.textContent = "ALERT_RESOLVED";
        }}
      >
        Trigger Alert Info
      </button>

      <div id="result">INITIAL</div>
    </div>
  );
}

describe("ConfirmDialogProvider Component & Accessibility", () => {
  it("renders the dialog with proper ARIA attributes when triggered", async () => {
    render(
      <ConfirmDialogProvider>
        <TestConsumer />
      </ConfirmDialogProvider>
    );

    expect(screen.queryByRole("alertdialog")).toBeNull();

    fireEvent.click(screen.getByText("Trigger Confirm Danger"));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("confirm-dialog-title");
    expect(dialog.getAttribute("aria-describedby")).toBe("confirm-dialog-desc");

    expect(screen.getByText("Hapus Siswa?")).toBeDefined();
    expect(screen.getByText("Data siswa akan dihapus permanen.")).toBeDefined();
  });

  it("resolves true when user clicks the Confirm button", async () => {
    render(
      <ConfirmDialogProvider>
        <TestConsumer />
      </ConfirmDialogProvider>
    );

    fireEvent.click(screen.getByText("Trigger Confirm Danger"));
    const confirmBtn = await screen.findByRole("button", { name: "Hapus" });

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText("CONFIRMED")).toBeDefined();
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });

  it("resolves false when user clicks the Cancel button", async () => {
    render(
      <ConfirmDialogProvider>
        <TestConsumer />
      </ConfirmDialogProvider>
    );

    fireEvent.click(screen.getByText("Trigger Confirm Danger"));
    const cancelBtn = await screen.findByRole("button", { name: "Batal" });

    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.getByText("CANCELLED")).toBeDefined();
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });

  it("resolves false when user presses Escape key", async () => {
    render(
      <ConfirmDialogProvider>
        <TestConsumer />
      </ConfirmDialogProvider>
    );

    fireEvent.click(screen.getByText("Trigger Confirm Danger"));
    await screen.findByRole("alertdialog");

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.getByText("CANCELLED")).toBeDefined();
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });

  it("renders Alert variant with single confirmation button and resolves upon click", async () => {
    render(
      <ConfirmDialogProvider>
        <TestConsumer />
      </ConfirmDialogProvider>
    );

    fireEvent.click(screen.getByText("Trigger Alert Info"));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toBeDefined();
    expect(screen.getByText("Informasi Penting")).toBeDefined();
    expect(screen.getByText("Pemberitahuan telah berhasil disimpan.")).toBeDefined();

    // In alert mode, cancel button is not rendered
    expect(screen.queryByText("Batal")).toBeNull();

    const okBtn = screen.getByRole("button", { name: "Tutup" });
    fireEvent.click(okBtn);

    await waitFor(() => {
      expect(screen.getByText("ALERT_RESOLVED")).toBeDefined();
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });

  it("prioritizes cancel button focus on dangerous actions for safe-focus WCAG compliance", async () => {
    render(
      <ConfirmDialogProvider>
        <TestConsumer />
      </ConfirmDialogProvider>
    );

    fireEvent.click(screen.getByText("Trigger Confirm Danger"));
    const cancelBtn = await screen.findByRole("button", { name: "Batal" });

    // Wait for the safe focus timer
    await waitFor(() => {
      expect(document.activeElement).toBe(cancelBtn);
    });
  });
});
