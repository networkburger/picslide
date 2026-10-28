import type { StoredPhoto } from "./storage";

const PUZZLE_SIZE = 1536;
const THUMB_SIZE = 320;

/** Open the system photo picker. Resolves with the chosen files (possibly empty). */
export function pickFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.addEventListener("change", () => resolve(Array.from(input.files ?? [])));
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

async function decode(file: Blob): Promise<ImageBitmap> {
  // createImageBitmap honours EXIF orientation by default in current browsers.
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Fallback via <img> for formats createImageBitmap won't take directly.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function squareCrop(src: ImageBitmap, size: number): Promise<Blob> {
  const side = Math.min(src.width, src.height);
  const sx = (src.width - side) / 2;
  const sy = (src.height - side) / 2;
  const out = Math.min(size, side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = out;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, sx, sy, side, side, 0, 0, out, out);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.88),
  );
}

/** Decode, centre-crop to a square and downscale a picked photo. */
export async function importPhoto(file: File): Promise<StoredPhoto> {
  const bitmap = await decode(file);
  try {
    const [image, thumb] = await Promise.all([squareCrop(bitmap, PUZZLE_SIZE), squareCrop(bitmap, THUMB_SIZE)]);
    return { id: newId(), created: Date.now(), image, thumb };
  } finally {
    bitmap.close();
  }
}

// crypto.randomUUID needs a secure context, which plain-http LAN dev servers aren't.
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
