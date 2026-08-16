"use client";

import * as React from "react";

/** Glow do hero seguindo o ponteiro, clipado no card pai. */
export function HeroGlow() {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = React.useState({ x: 55, y: 30 });

  const raf = React.useRef<number | null>(null);
  const latest = React.useRef({ x: 55, y: 30 });

  React.useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();

      const inside =
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom;

      if (!inside) return;

      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top) / r.height) * 100;

      latest.current = {
        x: Math.max(0, Math.min(100, x)),
        y: Math.max(0, Math.min(100, y)),
      };

      if (raf.current) return;
      raf.current = window.requestAnimationFrame(() => {
        raf.current = null;
        setPos(latest.current);
      });
    };

    window.addEventListener("pointermove", onMove, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(950px circle at ${pos.x}% ${pos.y}%, rgba(0,229,255,0.22), rgba(0,255,138,0.12) 45%, rgba(0,0,0,0) 72%)`,
        }}
      />
      <div className="rv-aurora absolute inset-0 opacity-70" />
      <div className="rv-scan absolute inset-0 opacity-20" />
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.06] via-transparent to-transparent" />
    </div>
  );
}
