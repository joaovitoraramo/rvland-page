import { describe, it, expect } from "vitest";
import { paraData } from "./hermes-tempo";

describe("paraData (timestamptz cru do driver)", () => {
  it("lê o formato do Postgres com offset curto, fração e Date", () => {
    expect(paraData("2026-11-23 12:00:00+00").toISOString()).toBe("2026-11-23T12:00:00.000Z");
    expect(paraData("2026-11-23 09:00:00-03").toISOString()).toBe("2026-11-23T12:00:00.000Z");
    expect(paraData("2026-11-23 12:00:00.123456+00").toISOString()).toBe("2026-11-23T12:00:00.123Z");
    expect(paraData("2026-11-23T12:00:00.000Z").toISOString()).toBe("2026-11-23T12:00:00.000Z");
    const d = new Date("2026-11-23T12:00:00.000Z");
    expect(paraData(d)).toBe(d);
  });
});
