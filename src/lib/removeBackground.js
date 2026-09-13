import { removeBackground } from "@imgly/background-removal";

/**
 * Cuts the subject out of `file` entirely in the browser (WASM/WebGPU).
 * Only the alpha mask is estimated by the model; every kept pixel's RGB
 * value is the original file's, never re-encoded before this call, and the
 * result is returned as a lossless PNG at the source image's resolution.
 */
export async function cutOut(file, onProgress) {
  return removeBackground(file, {
    progress: (key, current, total) => {
      onProgress?.(total > 0 ? current / total : 0, key);
    },
  });
}
