"use client";

import { useEffect, useRef, useState } from "react";

interface Options {
  onRefresh: () => void | Promise<void>;
  threshold?: number; // px
  disabled?: boolean;
}

export function usePullToRefresh({ onRefresh, threshold = 80, disabled = false }: Options) {
  const [pulling, setPulling] = useState(false);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const active = useRef(false);
  const distanceRef = useRef(0);
  const pullingRef = useRef(false);
  const refreshingRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const resetTimeoutRef = useRef<number | null>(null);
  const onRefreshRef = useRef(onRefresh);
  const thresholdRef = useRef(threshold);
  const disabledRef = useRef(disabled);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    thresholdRef.current = threshold;
  }, [threshold]);

  useEffect(() => {
    disabledRef.current = disabled;
    if (disabled) {
      active.current = false;
      startY.current = null;
      distanceRef.current = 0;
      pullingRef.current = false;
      setPulling(false);
      setDistance(0);
    }
  }, [disabled]);

  useEffect(() => {
    refreshingRef.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const publish = () => {
      frameRef.current = null;
      setPulling(pullingRef.current);
      setDistance(distanceRef.current);
    };

    const schedulePublish = () => {
      if (frameRef.current != null) return;
      frameRef.current = window.requestAnimationFrame(publish);
    };

    const onStart = (e: TouchEvent) => {
      if (disabledRef.current) return;
      if (window.scrollY > 2) return;
      startY.current = e.touches[0].clientY;
      active.current = true;
    };

    const onMove = (e: TouchEvent) => {
      if (disabledRef.current) return;
      if (!active.current || startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy < 0) {
        pullingRef.current = false;
        distanceRef.current = 0;
        schedulePublish();
        return;
      }
      if (window.scrollY > 2) {
        active.current = false;
        pullingRef.current = false;
        distanceRef.current = 0;
        schedulePublish();
        return;
      }
      pullingRef.current = true;
      // damping
      distanceRef.current = Math.min(dy * 0.5, thresholdRef.current * 1.5);
      schedulePublish();
    };

    const onEnd = async () => {
      if (!active.current) return;
      active.current = false;
      startY.current = null;
      const armed = distanceRef.current >= thresholdRef.current;
      pullingRef.current = false;
      schedulePublish();
      if (armed && !refreshingRef.current) {
        refreshingRef.current = true;
        setRefreshing(true);
        try {
          await Promise.resolve(onRefreshRef.current());
        } finally {
          resetTimeoutRef.current = window.setTimeout(() => {
            refreshingRef.current = false;
            setRefreshing(false);
            distanceRef.current = 0;
            pullingRef.current = false;
            schedulePublish();
          }, 400);
        }
      } else {
        distanceRef.current = 0;
        schedulePublish();
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      if (resetTimeoutRef.current != null) {
        window.clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  return { pulling, distance, refreshing, armed: distance >= threshold };
}
