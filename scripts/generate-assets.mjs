import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const inkSvg = await readFile(join(root, "src/assets/logo-ink.svg"));
const accentSvg = await readFile(join(root, "src/assets/logo-accent.svg"));

const ACCENT = "#1f7a72";
const INK = "#24211a";

async function ensureDir(path) {
  await mkdir(dirname(path), { recursive: true });
}

async function writePng(buffer, path) {
  await ensureDir(path);
  await writeFile(path, buffer);
  console.log(`wrote ${path}`);
}

// Mask sources used by the app itself via CSS mask-image (transparent background).
await writePng(await sharp(inkSvg).resize(512, 512).png().toBuffer(), join(root, "public/logo-ink.png"));
await writePng(await sharp(accentSvg).resize(512, 512).png().toBuffer(), join(root, "public/logo-accent.png"));

// Recolor a white-on-transparent mask by keeping its alpha and replacing its RGB.
async function recolor(maskBuffer, size, color) {
  const solid = await sharp({ create: { width: size, height: size, channels: 4, background: color } })
    .png()
    .toBuffer();
  return sharp(solid).composite([{ input: maskBuffer, blend: "dest-in" }]).png().toBuffer();
}

// Composited mark: ink + accent (teal), on a transparent background.
async function composite(size, inkColor) {
  const inkMask = await sharp(inkSvg).resize(size, size).png().toBuffer();
  const inkColored = await recolor(inkMask, size, inkColor);
  const accentMask = await sharp(accentSvg).resize(size, size).png().toBuffer();
  const accentColored = await recolor(accentMask, size, ACCENT);
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: inkColored }, { input: accentColored, blend: "over" }])
    .png()
    .toBuffer();
}

// Favicons: dark ink so the mark stays visible on light browser chrome.
await writePng(await composite(32, INK), join(root, "public/favicon-32.png"));
await writePng(await composite(64, INK), join(root, "public/favicon-64.png"));

// README banner: white ink on a black card, matching the WMI banner convention.
const bannerSize = 440;
const composited = await composite(bannerSize, "#ffffff");
const banner = await sharp({
  create: { width: bannerSize, height: bannerSize, channels: 4, background: "#000000" },
})
  .composite([{ input: composited }])
  .png()
  .toBuffer();

await writePng(banner, join(root, ".github/assets/logo.png"));
