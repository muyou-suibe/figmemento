"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import styles from "./catalog-storefront.module.css";

export function useFusionReveal() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const showImmediately = window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window);
    if (showImmediately) {
      element.dataset.revealState = "visible";
      return;
    }

    element.dataset.revealState = "pending";
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        element.dataset.revealState = "visible";
        observer.unobserve(element);
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -30px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return ref;
}

export function FusionRevealSection({
  children,
  className = "",
  delay,
  ...props
}: ComponentPropsWithoutRef<"section"> & { children: ReactNode; delay?: "stagger" }) {
  const ref = useFusionReveal();

  return (
    <section
      {...props}
      ref={ref}
      className={`${styles.fusionReveal} ${delay === "stagger" ? styles.fusionRevealStagger : ""} ${className}`.trim()}
    >
      {children}
    </section>
  );
}

export function FusionCountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [displayValue, setDisplayValue] = useState(0);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      if (reduced) {
        setDisplayValue(value);
        return;
      }
      const startTime = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - startTime) / 1200);
        setDisplayValue(Math.round(value * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    if (reduced || !("IntersectionObserver" in window)) {
      start();
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        start();
        observer.disconnect();
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -30px 0px" });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [value]);

  return <b ref={ref} data-count={value}>{displayValue}{suffix}</b>;
}
