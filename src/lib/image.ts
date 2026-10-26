// Local image handling: downscale and re-encode photos before storing them in
// IndexedDB so a few phone pictures can't bloat storage or exhaust the quota.

/** Longest edge, in pixels, of a stored image. Enough for a sharp detail view on a 3x phone. */
export const MAX_IMAGE_EDGE = 1024;
/** Target ceiling for the stored data URL. */
export const MAX_IMAGE_BYTES = 300_000;
/** Refuse absurd source files before decoding them. */
export const MAX_SOURCE_BYTES = 25_000_000;

const ATTEMPTS: { edge: number; quality: number }[] = [
  { edge: MAX_IMAGE_EDGE, quality: 0.82 },
  { edge: MAX_IMAGE_EDGE, quality: 0.7 },
  { edge: 768, quality: 0.7 },
  { edge: 512, quality: 0.65 },
];

export class ImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageError";
  }
}

/** Scale (width, height) to fit within `max` on the longest edge, never upscaling. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Approximate decoded byte size of a base64 data URL. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const base64 = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Fall through to <img>, which some Safari versions decode more reliably.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new ImageError("That image couldn't be read. Try a JPEG or PNG.");
  }
}

/**
 * Downscale and JPEG-encode an image file into a compact data URL.
 * Throws ImageError with a user-facing message on failure.
 */
export async function compressImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new ImageError("Choose an image file.");
  if (file.size > MAX_SOURCE_BYTES) throw new ImageError("That image is too large. Choose one under 25 MB.");

  const decoded = await decode(file);
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageError("This browser can't process images.");
    for (const attempt of ATTEMPTS) {
      const size = fitWithin(decoded.width, decoded.height, attempt.edge);
      canvas.width = size.width;
      canvas.height = size.height;
      // JPEG has no alpha: paint white under transparent PNGs.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.drawImage(decoded.source, 0, 0, size.width, size.height);
      const dataUrl = canvas.toDataURL("image/jpeg", attempt.quality);
      if (dataUrlBytes(dataUrl) <= MAX_IMAGE_BYTES) return dataUrl;
    }
    throw new ImageError("That image is too detailed to store. Try a smaller photo.");
  } finally {
    decoded.close();
  }
}
