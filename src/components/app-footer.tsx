import React from "react";
import { DEFAULT_SYSTEM_SETTINGS } from "@/lib/system-settings-constants";

interface AppFooterProps {
  text?: string | null;
  className?: string;
}

export function AppFooter({ text, className = "" }: AppFooterProps) {
  const currentYear = new Date().getFullYear();
  const displayText = text?.trim() || DEFAULT_SYSTEM_SETTINGS.footerText;

  return (
    <footer
      className={`py-4 text-center text-xs text-[var(--ink-muted)] select-none ${className}`}
      role="contentinfo"
    >
      &copy; {currentYear} {displayText}
    </footer>
  );
}
