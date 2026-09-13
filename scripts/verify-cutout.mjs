// Manual QA helper for the flat-background chroma-key engine: runs it
// against a real file with Node + sharp (no browser needed) so a
// regression in edge color/alpha is visible without opening the app.
//
// Usage: node scripts/verify-cutout.mjs <input-image> [output.png]
import sharp from "sharp";
import { cutOutFlatBackground } from "../src/lib/cutout/engine.js";

const srcPath = process.argv[2];
const outPath = process.argv[3] || "cutout-verify.png";

if (!srcPath) {
  console.error("Usage: node scripts/verify-cutout.mjs <input-image> [output.png]");
  process.exit(1);
}

const { data, info } = await sharp(srcPath).raw().ensureAlpha().toBuffer({ resolveWithObject: true });

const result = cutOutFlatBackground({ data, width: info.width, height: info.height });
if (!result) {
  console.log("Background not detected as uniform - this image would fall back to the AI engine in the app.");
  process.exit(1);
}

await sharp(Buffer.from(result.data), { raw: { width: result.width, height: result.height, channels: 4 } })
  .png()
  .toFile(outPath);

console.log("Wrote", outPath);
