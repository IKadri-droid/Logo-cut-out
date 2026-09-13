import { removeBackground as removeBackgroundAI } from "@imgly/background-removal";
import { cutOutFlatBackground } from "./cutout/engine.js";

async function loadImageData(source) {
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function imageDataToPngBlob(data, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(new ImageData(data, width, height), 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))), "image/png");
  });
}

/**
 * Cuts the subject out of `file`, picking the engine the image actually
 * needs instead of always reaching for a neural network:
 *
 * - Flat/near-uniform background (the common case for logos, product shots,
 *   icons): a deterministic chroma-key (border-connected flood fill) plus
 *   edge re-matting runs synchronously on this machine. Every pixel that
 *   isn't within a couple of pixels of the cut keeps its exact source
 *   color; the boundary ring is re-derived from the nearest confirmed
 *   background/foreground colors instead of the source's own
 *   background-tinted blend there, which is what removes the light halo a
 *   naive alpha cutout leaves behind. No model, no download, no loss.
 * - Anything else (a real photographic background): an in-browser AI
 *   segmentation model (WASM/WebGPU, via `@imgly/background-removal`)
 *   estimates a soft alpha mask directly, which is returned as-is — a
 *   photographic mask can legitimately have partial transparency far from
 *   any hard edge (hair, motion blur, glow), so re-snapping it to the
 *   nearest "confident" color like the flat-background path does would
 *   corrupt exactly those pixels.
 *
 * Returns `{ blob, engine }`, `engine` being `"flat"` or `"ai"`.
 */
export async function cutOut(file, onProgress) {
  const original = await loadImageData(file);

  const flat = cutOutFlatBackground({ data: original.data, width: original.width, height: original.height });
  if (flat) {
    onProgress?.(1, "flat-background");
    const blob = await imageDataToPngBlob(flat.data, flat.width, flat.height);
    return { blob, engine: "flat" };
  }

  const blob = await removeBackgroundAI(file, {
    progress: (key, current, total) => onProgress?.(total > 0 ? current / total : 0, key),
  });
  return { blob, engine: "ai" };
}
