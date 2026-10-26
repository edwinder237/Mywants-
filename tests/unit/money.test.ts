import { describe, expect, it } from "vitest";
import { centsToInput, formatPrice, parsePriceToCents } from "@/lib/money";

describe("parsePriceToCents", () => {
  it.each([
    ["143.84", 14384],
    ["$143.84", 14384],
    [" 143 ", 14300],
    ["143.8", 14380],
    ["1,299.00", 129900],
    ["143,84", 14384],
    ["0", 0],
  ])("parses %s", (raw, cents) => {
    expect(parsePriceToCents(raw)).toBe(cents);
  });

  it.each(["", "abc", "-5", "1.234", "1.2.3", "12e3"])("rejects %s", (raw) => {
    expect(parsePriceToCents(raw)).toBeNull();
  });

  it("avoids floating point drift", () => {
    expect(parsePriceToCents("0.29")).toBe(29);
    expect(parsePriceToCents("1.10")).toBe(110);
  });
});

describe("formatPrice", () => {
  it("formats CAD minor units", () => {
    expect(formatPrice(14384, "CAD")).toBe("$143.84");
    expect(centsToInput(14384)).toBe("143.84");
  });

  it("falls back for unknown currency codes", () => {
    expect(formatPrice(100, "ZZZ")).toMatch(/1\.00/);
  });
});
