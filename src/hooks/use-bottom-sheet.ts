"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface UseBottomSheetOptions {
  isOpen: boolean;
  onClose: () => void;
  threshold?: number; // pixels to drag down before closing, default 80
}

export function useBottomSheetGesture({
  isOpen,
  onClose,
  threshold = 80,
}: UseBottomSheetOptions) {
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setOffsetY(0);
      setIsDragging(false);
    }
  }, [isOpen]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only enable on mobile viewports (< 640px)
    if (typeof window !== "undefined" && window.innerWidth >= 640) return;

    const target = e.target as HTMLElement;
    const isDragHandle = Boolean(target.closest("[data-drag-handle]"));
    const scrollContainer = sheetRef.current?.querySelector(".overflow-y-auto") as HTMLElement | null;

    // If touching inside a scrolled container (scrollTop > 0) and not on drag handle, let native scroll work
    if (!isDragHandle && scrollContainer && scrollContainer.scrollTop > 0) {
      return;
    }

    const touch = e.touches[0];
    startYRef.current = touch.clientY;
    startTimeRef.current = Date.now();
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;

      const touch = e.touches[0];
      const deltaY = touch.clientY - startYRef.current;

      // Only allow dragging downwards
      if (deltaY > 0) {
        setOffsetY(deltaY);
      } else {
        setOffsetY(0);
      }
    },
    [isDragging]
  );

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    const deltaY = offsetY;
    const elapsed = Date.now() - startTimeRef.current;
    const velocity = deltaY / Math.max(elapsed, 1);

    if (deltaY > threshold || (velocity > 0.45 && deltaY > 30)) {
      // Slide down and dismiss
      setOffsetY(400);
      setTimeout(() => {
        onClose();
        setOffsetY(0);
      }, 160);
    } else {
      // Spring back to top
      setOffsetY(0);
    }
  }, [isDragging, offsetY, threshold, onClose]);

  const sheetStyle: React.CSSProperties = {
    transform: offsetY > 0 ? `translateY(${offsetY}px)` : undefined,
    transition: isDragging ? "none" : "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
    willChange: "transform",
  };

  return {
    sheetRef,
    sheetStyle,
    isDragging,
    touchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
