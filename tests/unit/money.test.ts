import { describe, expect, it } from "vitest";
import { centsToInput, formatPrice, parsePriceToCents } from "@/lib/money";

describe("parsePriceToCents", () => {
  it.each([
    ["143.84", 14384],
    ["$143.84", 14384],
    ["CAD 143.84", 14384],
    [" 143 ", 14300],
    ["143.8", 14380],
    ["1,299.00", 129900],
    ["143,84", 14384],
    ["0", 0],
  ])("parses %s", (raw, cents) => {
    expect(parsePriceToCents(raw)).toBe(cents);
  });

  it.each(["", "abc", "-5", "1.234", "1.2.3", "12e3", "€5"])("rejects %s", (raw) => {
    expect(parsePriceToCents(raw)).toBeNull();
  });

  it("avoids floating point drift", () => {
    expect(parsePriceToCents("0.29")).toBe(29);
    expect(parsePriceToCents("1.10")).toBe(110);
    expect(parsePriceToCents("143.84")).toBe(14384);
  });
});

describe("formatPrice", () => {
  it("formats integer cents as CAD", () => {
    expect(formatPrice(14384)).toBe("$143.84");
    expect(formatPrice(0)).toBe("$0.00");
    expect(formatPrice(129900)).toBe("$1,299.00");
    expect(centsToInput(14384)).toBe("143.84");
  });
});
