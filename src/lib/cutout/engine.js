const DEFAULT_SHADING_RESIDUAL = 32;
const DEFAULT_DARK_BG_DISTANCE = 22;
const DARK_BG_BRIGHTNESS = 45;
const DEFAULT_EDGE_BAND = 4;
const DEFAULT_MATCH_RADIUS = 6;
const UNIFORM_STD_LIMIT = 14;

const BG = 1;
const FG = 2;
const EDGE = 3;

function readPixel(data, width, x, y) {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

function sampleBorderPixels(data, width, height) {
  const samples = [];
  const stepX = Math.max(1, Math.floor(width / 100));
  const stepY = Math.max(1, Math.floor(height / 100));
  for (let x = 0; x < width; x += stepX) {
    samples.push(readPixel(data, width, x, 0));
    samples.push(readPixel(data, width, x, height - 1));
  }
  for (let y = 0; y < height; y += stepY) {
    samples.push(readPixel(data, width, 0, y));
    samples.push(readPixel(data, width, width - 1, y));
  }
  return samples;
}

function meanColor(samples) {
  const sum = [0, 0, 0];
  for (const [r, g, b] of samples) {
    sum[0] += r;
    sum[1] += g;
    sum[2] += b;
  }
  return sum.map((v) => v / samples.length);
}

function stdDevColor(samples, mean) {
  const sum = [0, 0, 0];
  for (const [r, g, b] of samples) {
    sum[0] += (r - mean[0]) ** 2;
    sum[1] += (g - mean[1]) ** 2;
    sum[2] += (b - mean[2]) ** 2;
  }
  return sum.map((v) => Math.sqrt(v / samples.length));
}

function colorDistance(r, g, b, ref) {
  const dr = r - ref[0];
  const dg = g - ref[1];
  const db = b - ref[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * How far a color sits from being "the background color, uniformly
 * darkened" — a physically accurate model of a drop shadow or soft
 * vignette, which dims light without shifting its hue. A real subject
 * edge has high residual (its hue differs from the background's), while
 * every point of a shadow gradient, however dark, has a low one.
 *
 * This model is meaningless for a near-black background: hue itself is
 * undefined at zero brightness, so any dark pixel — including genuinely
 * dark artwork (black linework, a dark jacket) — reads as "background,
 * darkened all the way to zero", however saturated its real color is.
 * Callers should use plain color distance instead when `ref` is that dark.
 */
function shadingResidual(r, g, b, ref) {
  const refMagSq = ref[0] * ref[0] + ref[1] * ref[1] + ref[2] * ref[2] || 1;
  const rawScale = (r * ref[0] + g * ref[1] + b * ref[2]) / refMagSq;
  const scale = Math.max(0, Math.min(1.2, rawScale));
  const dr = r - scale * ref[0];
  const dg = g - scale * ref[1];
  const db = b - scale * ref[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Samples the canvas border to decide whether the image sits on a
 * (near-)flat background — the case the precision chroma-key path targets.
 */
export function detectUniformBackground(data, width, height) {
  const samples = sampleBorderPixels(data, width, height);
  const color = meanColor(samples);
  const std = stdDevColor(samples, color);
  return { color, isUniform: std.every((s) => s < UNIFORM_STD_LIMIT) };
}

/**
 * Border-connected flood fill: a pixel joins the background region if it
 * fits the "darkened background" model above, however far its raw
 * brightness has drifted — which is what lets this consume a full drop
 * shadow gradient in one pass without needing a fragile pixel-to-pixel
 * tolerance walk (that can leak into the subject through any soft
 * highlight on its surface). For a near-black background, where that
 * model degenerates, a plain, tight color distance is used instead.
 */
function floodBackgroundMask(data, width, height, bgColor, residualLimit, darkBgDistance) {
  const size = width * height;
  const mask = new Uint8Array(size);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;

  const bgBrightness = (bgColor[0] + bgColor[1] + bgColor[2]) / 3;
  const exceedsLimit =
    bgBrightness < DARK_BG_BRIGHTNESS
      ? (r, g, b) => colorDistance(r, g, b, bgColor) > darkBgDistance
      : (r, g, b) => shadingResidual(r, g, b, bgColor) > residualLimit;

  const enqueue = (idx) => {
    if (mask[idx]) return;
    const i = idx * 4;
    if (exceedsLimit(data[i], data[i + 1], data[i + 2])) return;
    mask[idx] = 1;
    queue[tail++] = idx;
  };

  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % width;
    const y = (idx / width) | 0;
    if (x > 0) enqueue(idx - 1);
    if (x < width - 1) enqueue(idx + 1);
    if (y > 0) enqueue(idx - width);
    if (y < height - 1) enqueue(idx + width);
  }

  return mask;
}

function nearestIndexWithState(state, width, height, idx, targetState, maxRadius) {
  const x0 = idx % width;
  const y0 = (idx / width) | 0;
  let best = -1;
  let bestDist = Infinity;
  for (let dy = -maxRadius; dy <= maxRadius; dy++) {
    const y = y0 + dy;
    if (y < 0 || y >= height) continue;
    for (let dx = -maxRadius; dx <= maxRadius; dx++) {
      const x = x0 + dx;
      if (x < 0 || x >= width) continue;
      const n = y * width + x;
      if (state[n] !== targetState) continue;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
  }
  return best;
}

/**
 * Re-derives clean edges around a background mask instead of trusting the
 * source pixels' own (background-tinted) color right at the cut: pixels far
 * from the boundary keep their exact original value, pixels within
 * `edgeBand` of it are re-matted against the nearest confirmed background
 * and foreground colors, which removes the light/white fringe that a raw
 * alpha cutout leaves behind.
 */
function matteEdges(data, width, height, backgroundMask, edgeBand, matchRadius) {
  const size = width * height;
  const state = new Uint8Array(size);
  for (let i = 0; i < size; i++) state[i] = backgroundMask[i] ? BG : 0;

  let frontier = [];
  for (let i = 0; i < size; i++) if (state[i] === BG) frontier.push(i);
  for (let step = 0; step < edgeBand && frontier.length; step++) {
    const next = [];
    for (const idx of frontier) {
      const x = idx % width;
      const y = (idx / width) | 0;
      const neighbors = [];
      if (x > 0) neighbors.push(idx - 1);
      if (x < width - 1) neighbors.push(idx + 1);
      if (y > 0) neighbors.push(idx - width);
      if (y < height - 1) neighbors.push(idx + width);
      for (const n of neighbors) {
        if (state[n] === 0) {
          state[n] = EDGE;
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  for (let i = 0; i < size; i++) if (state[i] === 0) state[i] = FG;

  const out = new Uint8ClampedArray(data.length);
  for (let idx = 0; idx < size; idx++) {
    const i = idx * 4;
    if (state[idx] === BG) continue; // stays fully transparent [0,0,0,0]
    if (state[idx] === FG) {
      out[i] = data[i];
      out[i + 1] = data[i + 1];
      out[i + 2] = data[i + 2];
      out[i + 3] = 255;
      continue;
    }

    const bgIdx = nearestIndexWithState(state, width, height, idx, BG, matchRadius);
    const fgIdx = nearestIndexWithState(state, width, height, idx, FG, matchRadius);
    if (bgIdx === -1 || fgIdx === -1) {
      out[i] = data[i];
      out[i + 1] = data[i + 1];
      out[i + 2] = data[i + 2];
      out[i + 3] = 255;
      continue;
    }

    const bi = bgIdx * 4;
    const fi = fgIdx * 4;
    const bg = [data[bi], data[bi + 1], data[bi + 2]];
    const fg = [data[fi], data[fi + 1], data[fi + 2]];
    const vec = [fg[0] - bg[0], fg[1] - bg[1], fg[2] - bg[2]];
    const denom = vec[0] * vec[0] + vec[1] * vec[1] + vec[2] * vec[2] || 1;
    const dot = (data[i] - bg[0]) * vec[0] + (data[i + 1] - bg[1]) * vec[1] + (data[i + 2] - bg[2]) * vec[2];
    const t = Math.max(0, Math.min(1, dot / denom));

    if (t <= 0) continue; // stays fully transparent

    // The nearest foreground pixel only calibrates how much of this pixel's
    // own color is background bleed (t) — the output color is this pixel's
    // own value with that bleed subtracted, never a neighbor's color, or
    // fine detail (hair, thin strokes) next to the cut gets flattened to
    // whatever unrelated tone happens to be nearby.
    const inv = 1 - t;
    out[i] = clamp255((data[i] - inv * bg[0]) / t);
    out[i + 1] = clamp255((data[i + 1] - inv * bg[1]) / t);
    out[i + 2] = clamp255((data[i + 2] - inv * bg[2]) / t);
    out[i + 3] = Math.round(t * 255);
  }
  return out;
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * Precision path for logos and product shots on a (near-)flat background:
 * a deterministic, non-AI chroma-key (border-connected flood fill) with
 * edge re-matting, so colors are exact everywhere except a thin re-derived
 * boundary ring. Returns null when the background isn't uniform enough —
 * callers should fall back to the AI segmentation engine in that case.
 */
export function cutOutFlatBackground(imageData, options = {}) {
  const { data, width, height } = imageData;
  const {
    residualLimit = DEFAULT_SHADING_RESIDUAL,
    darkBgDistance = DEFAULT_DARK_BG_DISTANCE,
    edgeBand = DEFAULT_EDGE_BAND,
    matchRadius = DEFAULT_MATCH_RADIUS,
  } = options;

  const { color: bgColor, isUniform } = detectUniformBackground(data, width, height);
  if (!isUniform) return null;

  const backgroundMask = floodBackgroundMask(data, width, height, bgColor, residualLimit, darkBgDistance);
  const out = matteEdges(data, width, height, backgroundMask, edgeBand, matchRadius);
  return { data: out, width, height };
}
