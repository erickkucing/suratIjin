"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface UseBottomSheetOptions {
  isOpen: boolean;
  onClose: () => void;
  isExpanded?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
  threshold?: number; // pixels to drag down before closing, default 50
}

export function useBottomSheetGesture({
  isOpen,
  onClose,
  isExpanded = false,
  onExpand,
  onCollapse,
  threshold = 50,
}: UseBottomSheetOptions) {
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const isDragTargetRef = useRef(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setOffsetY(0);
      setIsDragging(false);
      isDragTargetRef.current = false;
    }
  }, [isOpen]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only enable on mobile viewports (< 640px)
    if (typeof window !== "undefined" && window.innerWidth >= 640) return;

    const target = e.target as HTMLElement;

    // Do not initiate drag gesture on interactive elements (buttons, inputs, links)
    if (target.closest("button, input, select, textarea, a, [role='button']")) {
      return;
    }

    const isDragTarget = Boolean(target.closest("[data-drag-handle], [data-sheet-header]"));
    const scrollContainer = sheetRef.current?.querySelector(".overflow-y-auto") as HTMLElement | null;

    // If touching inside scrollable content (not header) while scrolled down, let native scroll handle it
    if (!isDragTarget && scrollContainer && scrollContainer.scrollTop > 5) {
      return;
    }

    const touch = e.touches[0];
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    startTimeRef.current = Date.now();
    isDragTargetRef.current = isDragTarget;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;

      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - startXRef.current);
      const deltaY = touch.clientY - startYRef.current;

      // Ignore horizontal swipes completely to prevent sheet interference
      if (deltaX > 15 && deltaX > Math.abs(deltaY) * 1.2) {
        setIsDragging(false);
        setOffsetY(0);
        return;
      }
      const scrollContainer = sheetRef.current?.querySelector(".overflow-y-auto") as HTMLElement | null;

      // Swiping upwards on handle or content: expand bottom sheet
      if (deltaY < -15) {
        if (!isExpanded) {
          onExpand?.();
        }
        // If swiping inside scrollable content, hand over to native scroll
        if (!isDragTargetRef.current) {
          setIsDragging(false);
          setOffsetY(0);
        }
        return;
      }

      // Dragging downwards (pull to collapse or dismiss)
      if (deltaY > 0) {
        if (isDragTargetRef.current) {
          // Direct 1:1 tactile drag on handle or header
          setOffsetY(deltaY);
        } else if (!scrollContainer || scrollContainer.scrollTop <= 0) {
          // Pulling down from content at top of scroll
          setOffsetY(deltaY * 0.85);
        } else {
          // Content is scrolled, let native scroll handle it
          setOffsetY(0);
          setIsDragging(false);
        }
      } else {
        setOffsetY(0);
      }
    },
    [isDragging, isExpanded, onExpand]
  );

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    const deltaY = offsetY;
    const elapsed = Date.now() - startTimeRef.current;
    const velocity = deltaY / Math.max(elapsed, 1);

    // 2-Step Snap: If modal is currently expanded, dragging down collapses back to normal height
    if (isExpanded) {
      if (deltaY > 35 || (velocity > 0.25 && deltaY > 15)) {
        onCollapse?.();
      }
      setOffsetY(0);
      return;
    }

    // Normal state: dragging down beyond threshold dismisses modal
    if (deltaY > threshold || (velocity > 0.25 && deltaY > 20)) {
      // Slide down and dismiss smoothly
      setOffsetY(window.innerHeight || 500);
      setTimeout(() => {
        onClose();
        setOffsetY(0);
      }, 180);
    } else {
      // Spring smoothly back to top
      setOffsetY(0);
    }
  }, [isDragging, isExpanded, offsetY, threshold, onCollapse, onClose]);

  const sheetStyle: React.CSSProperties = {
    transform: offsetY > 0 ? `translateY(${offsetY}px)` : undefined,
    transition: isDragging ? "none" : "transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)",
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
