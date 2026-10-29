"use client";

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
} from "react";
import { AlertTriangle, AlertCircle, Info, CheckCircle2, Trash2 } from "lucide-react";

export type DialogVariant = "danger" | "warning" | "info" | "success";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
}

export interface AlertOptions {
  title: string;
  message: string;
  confirmText?: string;
  variant?: DialogVariant;
}

interface DialogState {
  isOpen: boolean;
  type: "confirm" | "alert";
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  variant: DialogVariant;
  resolve?: (value: boolean) => void;
}

interface ConfirmDialogContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions) => Promise<void>;
}

const ConfirmDialogContext = createContext<ConfirmDialogContextValue | null>(null);

export function useConfirmDialog(): ConfirmDialogContextValue {
  const context = useContext(ConfirmDialogContext);
  if (!context) {
    throw new Error("useConfirmDialog must be used within a ConfirmDialogProvider");
  }
  return context;
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [dialogState, setDialogState] = useState<DialogState>({
    isOpen: false,
    type: "confirm",
    title: "",
    message: "",
    confirmText: "Ya",
    cancelText: "Batal",
    variant: "info",
  });

  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return new Promise<boolean>((resolve) => {
      setDialogState({
        isOpen: true,
        type: "confirm",
        title: options.title,
        message: options.message,
        confirmText: options.confirmText ?? (options.variant === "danger" ? "Hapus" : "Ya"),
        cancelText: options.cancelText ?? "Batal",
        variant: options.variant ?? "info",
        resolve,
      });
    });
  }, []);

  const alert = useCallback((options: AlertOptions): Promise<void> => {
    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return new Promise<void>((resolve) => {
      setDialogState({
        isOpen: true,
        type: "alert",
        title: options.title,
        message: options.message,
        confirmText: options.confirmText ?? "Mengerti",
        cancelText: "",
        variant: options.variant ?? "info",
        resolve: () => resolve(),
      });
    });
  }, []);

  const handleClose = useCallback(
    (result: boolean) => {
      if (dialogState.resolve) {
        dialogState.resolve(result);
      }
      setDialogState((prev) => ({ ...prev, isOpen: false }));

      // Kembalikan fokus ke elemen pemicu dialog
      if (previousActiveElementRef.current) {
        previousActiveElementRef.current.focus();
      }
    },
    [dialogState]
  );

  // Focus management & keyboard trap
  useEffect(() => {
    if (!dialogState.isOpen) return;

    // Kunci scroll halaman belakang
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Fokus awal: jika aksi bahaya (danger), utamakan tombol Batal agar tidak terhapus tak sengaja
    const timer = setTimeout(() => {
      if (dialogState.type === "confirm" && dialogState.variant === "danger") {
        cancelBtnRef.current?.focus();
      } else {
        confirmBtnRef.current?.focus();
      }
    }, 40);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose(false);
        return;
      }

      if (e.key === "Tab") {
        if (!dialogRef.current) return;
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const focusableArray = Array.from(focusable).filter(
          (el) => !el.hasAttribute("disabled") && el.offsetParent !== null
        );

        if (focusableArray.length === 0) return;

        const firstElement = focusableArray[0];
        const lastElement = focusableArray[focusableArray.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [dialogState.isOpen, dialogState.type, dialogState.variant, handleClose]);

  const renderIcon = () => {
    switch (dialogState.variant) {
      case "danger":
        return (
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 flex items-center justify-center shrink-0">
            <Trash2 className="w-6 h-6" aria-hidden="true" />
          </div>
        );
      case "warning":
        return (
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6" aria-hidden="true" />
          </div>
        );
      case "success":
        return (
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
          </div>
        );
      default:
        return (
          <div className="w-12 h-12 rounded-full bg-[var(--primary-light)] text-[var(--primary)] border border-[var(--border)] flex items-center justify-center shrink-0">
            <Info className="w-6 h-6" aria-hidden="true" />
          </div>
        );
    }
  };

  const getConfirmButtonClasses = () => {
    if (dialogState.variant === "danger") {
      return "bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white focus-visible:ring-red-500";
    }
    return "bg-[var(--primary)] hover:bg-[var(--primary-hover)] active:scale-[0.98] text-white focus-visible:ring-[var(--primary)]";
  };

  return (
    <ConfirmDialogContext.Provider value={{ confirm, alert }}>
      {children}

      {dialogState.isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 dark:bg-black/75 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={() => handleClose(false)}
        >
          <div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-desc"
            className="w-full sm:max-w-md bg-[var(--surface)] text-[var(--ink)] rounded-t-2xl sm:rounded-2xl border border-[var(--border)] shadow-2xl p-5 sm:p-6 overflow-hidden max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile drag handle indicator */}
            <div
              className="w-12 h-1 bg-[var(--border)] rounded-full mx-auto mb-4 sm:hidden shrink-0"
              aria-hidden="true"
            />

            <div className="flex items-start gap-4 mb-5">
              {renderIcon()}
              <div className="flex-1 min-w-0 pt-0.5">
                <h3
                  id="confirm-dialog-title"
                  className="text-base sm:text-lg font-bold text-[var(--ink)] leading-snug tracking-tight font-sans"
                >
                  {dialogState.title}
                </h3>
                <p
                  id="confirm-dialog-desc"
                  className="mt-1.5 text-xs sm:text-sm text-[var(--ink-muted)] leading-relaxed whitespace-pre-line"
                >
                  {dialogState.message}
                </p>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2.5 pt-2">
              {dialogState.type === "confirm" && (
                <button
                  ref={cancelBtnRef}
                  type="button"
                  onClick={() => handleClose(false)}
                  className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border border-[var(--border)] text-[var(--ink)] bg-[var(--surface)] hover:bg-[var(--canvas-subtle)] active:scale-[0.98] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)]"
                >
                  {dialogState.cancelText}
                </button>
              )}

              <button
                ref={confirmBtnRef}
                type="button"
                onClick={() => handleClose(true)}
                className={`w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${getConfirmButtonClasses()}`}
              >
                {dialogState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmDialogContext.Provider>
  );
}
