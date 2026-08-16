"use client";

import * as React from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function TiltCard({
  title,
  desc,
  icon,
  bullets,
  tag,
}: {
  title: string;
  desc: string;
  icon: React.ReactNode;
  bullets?: readonly string[];
  tag?: string;
}) {
  const shellRef = React.useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = React.useState<React.CSSProperties>({});
  const [glow, setGlow] = React.useState({ x: 50, y: 45, a: 0 });

  const onMove = (e: React.MouseEvent) => {
    const el = shellRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;

    const rotY = (px - 0.5) * 8;
    const rotX = (0.5 - py) * 8;

    setStyle({
      transform: `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
    });
    setGlow({ x: px * 100, y: py * 100, a: 1 });
  };

  const onLeave = () => {
    setStyle({ transform: `perspective(900px) rotateX(0deg) rotateY(0deg)` });
    setGlow((g) => ({ ...g, a: 0 }));
  };

  return (
    <div
      ref={shellRef}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="group isolate relative h-full min-h-[380px] overflow-hidden rounded-2xl"
    >
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-200"
        style={{
          opacity: glow.a,
          background: `radial-gradient(520px circle at ${glow.x}% ${glow.y}%, rgba(0,229,255,0.20), rgba(0,255,138,0.10) 36%, transparent 70%)`,
        }}
      />

      <Card
        className={[
          "relative h-full rounded-2xl border-white/10 bg-[rgba(10,14,20,0.72)]",
          "shadow-[0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-md",
          "will-change-transform",
          "flex flex-col",
        ].join(" ")}
        style={style}
      >
        <CardHeader className="pb-5">
          <div className="flex items-start gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5">
              {icon}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start gap-x-2 gap-y-2">
                <CardTitle className="min-w-[12ch] flex-1 text-base leading-snug text-white">
                  {title}
                </CardTitle>

                {tag ? (
                  <Badge
                    className={[
                      "shrink-0",
                      "border-white/10 bg-white/5 text-white/80 hover:bg-white/10",
                      "px-2.5 py-1 text-[11px] leading-none",
                      "whitespace-nowrap",
                      "max-w-full truncate",
                    ].join(" ")}
                    title={tag}
                  >
                    {tag}
                  </Badge>
                ) : null}
              </div>

              <CardDescription className="mt-2 text-sm leading-relaxed text-white/70">
                {desc}
              </CardDescription>
            </div>
          </div>

          <div className="mt-4 h-px w-full bg-white/10" />
        </CardHeader>

        <CardContent className="flex flex-1 flex-col pt-0 pb-6">
          {bullets?.length ? (
            <ul className="mt-1 space-y-3 text-sm text-white/80">
              {bullets.slice(0, 3).map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <span className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[rgba(0,229,255,0.9)]" />
                  <span className="leading-relaxed">{b}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-white/75">—</div>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-6 text-xs text-white/55">
            <span className="inline-flex h-6 items-center rounded-full border border-white/10 bg-white/5 px-2.5">
              sob medida
            </span>
            <span className="inline-flex h-6 items-center rounded-full border border-white/10 bg-white/5 px-2.5">
              do zero
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
