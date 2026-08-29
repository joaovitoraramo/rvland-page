import { ImageResponse } from "next/og";
import { SITE_EN } from "@/lib/site-en";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "RVLand Devs — Websites for businesses";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "linear-gradient(135deg, #05070b 0%, #071018 55%, #04120e 100%)",
          padding: 72,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              color: "rgba(0,229,255,0.95)",
              letterSpacing: 6,
              textTransform: "uppercase",
            }}
          >
            Websites for businesses
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 92,
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1.05,
            }}
          >
            {SITE_EN.name}
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 24,
              fontSize: 42,
              color: "rgba(0,255,138,0.92)",
              lineHeight: 1.2,
            }}
          >
            No calls. Just text. Live in days.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              width: "100%",
              height: 3,
              background:
                "linear-gradient(90deg, rgba(0,229,255,0.9), rgba(255,255,255,0.25), rgba(0,255,138,0.9))",
            }}
          />
          <div
            style={{
              display: "flex",
              marginTop: 26,
              fontSize: 30,
              color: "rgba(255,255,255,0.72)",
            }}
          >
            Design · Copy · Hosting · Support
          </div>
        </div>
      </div>
    ),
    size
  );
}
