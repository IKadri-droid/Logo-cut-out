import { removeBackground as removeBackgroundAI } from "@imgly/background-removal";
import { cutOutFlatBackground } from "./cutout/engine.js";
import { removeBackgroundOnline } from "./onlineRemoveBackground.js";

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
 * Cuts the subject out of `file`. `mode` picks what handles a non-flat
 * background: `"offline"` (default) uses the AI model bundled in the
 * browser, no network involved; `"online"` sends the image to a
 * user-configured Hugging Face model instead, for better quality on hard
 * cases, falling back to the offline model if that call fails for any
 * reason (no token, rate limit, network).
 *
 * A flat/near-uniform background always takes the deterministic
 * chroma-key path regardless of `mode` — no model does that better.
 *
 * Returns `{ blob, engine, fallbackReason? }`, `engine` being `"flat"`,
 * `"ai-offline"` or `"ai-online"`.
 */
export async function cutOut(file, onProgress, { mode = "offline" } = {}) {
  const original = await loadImageData(file);

  const flat = cutOutFlatBackground({ data: original.data, width: original.width, height: original.height });
  if (flat) {
    onProgress?.(1, "flat-background");
    const blob = await imageDataToPngBlob(flat.data, flat.width, flat.height);
    return { blob, engine: "flat" };
  }

  if (mode === "online") {
    try {
      const blob = await removeBackgroundOnline(file);
      onProgress?.(1, "online-ai");
      return { blob, engine: "ai-online" };
    } catch (err) {
      const blob = await removeBackgroundAI(file, {
        progress: (key, current, total) => onProgress?.(total > 0 ? current / total : 0, key),
      });
      return { blob, engine: "ai-offline", fallbackReason: err?.message };
    }
  }

  const blob = await removeBackgroundAI(file, {
    progress: (key, current, total) => onProgress?.(total > 0 ? current / total : 0, key),
  });
  return { blob, engine: "ai-offline" };
}
