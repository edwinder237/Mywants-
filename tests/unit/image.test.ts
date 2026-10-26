import { describe, expect, it } from "vitest";
import { IMAGE_DATA_URL, ImageError, compressImage, dataUrlBytes, fitWithin } from "@/lib/image";

describe("fitWithin", () => {
  it("scales the longest edge down and keeps aspect ratio", () => {
    expect(fitWithin(4032, 3024, 1024)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(3024, 4032, 1024)).toEqual({ width: 768, height: 1024 });
  });
  it("never upscales and handles degenerate sizes", () => {
    expect(fitWithin(300, 200, 1024)).toEqual({ width: 300, height: 200 });
    expect(fitWithin(0, 10, 1024)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(10000, 1, 1024)).toEqual({ width: 1024, height: 1 });
  });
});

describe("dataUrlBytes", () => {
  it("computes decoded size from base64 length and padding", () => {
    expect(dataUrlBytes("data:image/jpeg;base64,AAAA")).toBe(3);
    expect(dataUrlBytes("data:image/jpeg;base64,AAA=")).toBe(2);
    expect(dataUrlBytes("data:image/jpeg;base64,AA==")).toBe(1);
  });
});

describe("IMAGE_DATA_URL", () => {
  it("accepts only base64 raster data URLs", () => {
    expect(IMAGE_DATA_URL.test("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
    expect(IMAGE_DATA_URL.test("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(IMAGE_DATA_URL.test("https://example.com/a.jpg")).toBe(false);
    expect(IMAGE_DATA_URL.test("data:image/png;base64,<script>")).toBe(false);
  });
});

describe("compressImage", () => {
  it("rejects non-images and oversized sources before decoding", async () => {
    await expect(compressImage(new File(["x"], "a.txt", { type: "text/plain" }))).rejects.toBeInstanceOf(ImageError);
    const huge = new File(["x"], "a.jpg", { type: "image/jpeg" });
    Object.defineProperty(huge, "size", { value: 30_000_000 });
    await expect(compressImage(huge)).rejects.toThrow(/too large/);
  });
});
