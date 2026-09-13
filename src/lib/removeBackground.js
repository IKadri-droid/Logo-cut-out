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
 * True if any pixel is already partially or fully transparent — the image
 * has already been cut out (its own previous result, or any PNG with real
 * alpha). Re-running chroma-key on it would misread its cleared-to-black
 * transparent areas as a new, unrelated background and start eating into
 * the already-correct edges.
 */
function hasExistingTransparency(data) {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) return true;
  }
  return false;
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
 * If `file` already has any transparency, it's returned as-is: it has
 * already been cut out (most likely one of this app's own results fed back
 * in), and re-running chroma-key on it would misread its cleared,
 * already-transparent pixels as a brand new background to remove.
 *
 * Returns `{ blob, engine, fallbackReason? }`, `engine` being `"passthrough"`,
 * `"flat"`, `"ai-offline"` or `"ai-online"`.
 */
export async function cutOut(file, onProgress, { mode = "offline" } = {}) {
  const original = await loadImageData(file);

  if (hasExistingTransparency(original.data)) {
    onProgress?.(1, "already-transparent");
    const blob = await imageDataToPngBlob(original.data, original.width, original.height);
    return { blob, engine: "passthrough" };
  }

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
