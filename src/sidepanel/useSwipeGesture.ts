import { useEffect, useRef, useCallback } from "react";

interface SwipeGestureOptions {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  threshold?: number;
  disabled?: boolean;
}

export function useSwipeGesture(
  ref: React.RefObject<HTMLElement | null>,
  { onSwipeLeft, onSwipeRight, threshold = 30, disabled = false }: SwipeGestureOptions
) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const wheelAccumRef = useRef(0);
  const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownRef = useRef(false);
  const cooldownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSwipe = useCallback(
    (deltaX: number, deltaY: number) => {
      // During cooldown, ignore swipes to prevent double-firing
      if (cooldownRef.current) return;

      const absDx = Math.abs(deltaX);
      const absDy = Math.abs(deltaY);

      // Must exceed threshold
      if (absDx < threshold) return;

      // Horizontal distance must be greater than vertical (angle < 30° from horizontal)
      // tan(30°) ≈ 0.577, so absDy/absDx must be < 0.577
      if (absDy / absDx >= 0.577) return;

      // Start cooldown to prevent rapid double-firing
      cooldownRef.current = true;
      cooldownTimeoutRef.current = setTimeout(() => {
        cooldownRef.current = false;
      }, 300);

      if (deltaX > 0) {
        onSwipeRight();
      } else {
        onSwipeLeft();
      }
    },
    [onSwipeLeft, onSwipeRight, threshold]
  );

  useEffect(() => {
    if (disabled || !ref.current) return;

    const el = ref.current;

    // Touch events
    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    };

    const onTouchMove = () => {
      // We track but don't prevent default — let vertical scrolling work
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      touchStartRef.current = null;
      handleSwipe(deltaX, deltaY);
    };

    // Trackpad wheel events (deltaX accumulation)
    const onWheel = (e: WheelEvent) => {
      // Only handle horizontal-dominant wheel events (trackpad swipes)
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;

      wheelAccumRef.current += e.deltaX;

      // Reset accumulation after a pause
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
      wheelTimeoutRef.current = setTimeout(() => {
        const accum = wheelAccumRef.current;
        wheelAccumRef.current = 0;
        // deltaX positive = scroll right = swipe left (next)
        // deltaX negative = scroll left = swipe right (prev)
        if (Math.abs(accum) >= threshold) {
          if (accum > 0) {
            onSwipeLeft();
          } else {
            onSwipeRight();
          }
        }
      }, 50);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
      if (cooldownTimeoutRef.current) clearTimeout(cooldownTimeoutRef.current);
      cooldownRef.current = false;
    };
  }, [ref, disabled, handleSwipe, threshold, onSwipeLeft, onSwipeRight]);
}
