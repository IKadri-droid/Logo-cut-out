<div align="center">
   <img src=".github/assets/logo.png" alt="Logo Cut-Out logo" width="220">

   <h1>Logo Cut-Out</h1>

   <p>Cut the background out of any image at full quality — entirely in your browser, nothing ever uploaded.</p>

   <a href="https://github.com/IKadri-droid/Logo-cut-out/actions/workflows/build.yml"><img src="https://github.com/IKadri-droid/Logo-cut-out/actions/workflows/build.yml/badge.svg" alt="Build"></a>

   <a href="#features">Features</a> &bull; <a href="#how-it-works">How it works</a> &bull; <a href="#installation">Installation</a> &bull; <a href="#tech-stack">Tech stack</a> &bull; <a href="#license">License</a>
</div>

---

## Features

- 🖼️ **Drag & drop or file picker** — PNG, JPEG or WebP in, transparent PNG out.
- ⚡ **Fully client-side** — nothing is ever sent to a server, whichever engine below handles the cut.
- 🎯 **Precision engine for logos and product shots** — a deterministic chroma-key, no neural network, no blur.
- 🔍 **Before/after preview** — check the cutout against a checkerboard before downloading.
- 📥 **Lossless export** — download the result as a PNG at the original image's resolution.

## How it works

Background removal here is a three-part problem: figuring out *which* pixels belong to the subject, keeping the pixels you already know are correct untouched, and — the part naive cutouts get wrong — not letting the background's color bleed into the edge pixels you keep.

That last part matters because most source images are already anti-aliased against their background: a logo's edge pixels aren't pure subject color, they're a blend with whatever was behind them. Slap an alpha mask on top of those pixels unchanged and you get a faint light/white halo around every edge — technically "the original pixels," but visibly degraded. Logo Cut-Out re-derives that edge ring instead of trusting it, with one of two engines depending on the image:

- **Flat/near-uniform background** (the common case for logos, product shots, icons — like the Microsoft logo or Poképixel-style cutouts this was built against): a border-connected flood fill (chroma key) finds the background with pixel precision, no model involved. Every pixel more than a couple of pixels from the cut keeps its exact source color; the thin boundary ring is re-matted against the nearest confirmed background/foreground colors, which is what removes the halo. Fast, deterministic, and available before any model even loads.
- **Anything else** (a real photographic background): an in-browser AI segmentation model (via [`@imgly/background-removal`](https://github.com/imgly/background-removal-js), on top of [ONNX Runtime Web](https://github.com/microsoft/onnxruntime), WASM/WebGPU) estimates the mask. The same edge re-matting pass then runs on its output to strip the background tint from its boundary, too.

Either way, the export is a PNG — a lossless format — so no compression artifacts sneak in at the finish line, and nothing ever leaves your machine: there is no upload step and no server component at all.

## Installation

Requires [Node.js](https://nodejs.org) 20+.

```bash
npm install
npm run dev      # http://localhost:5173
```

Production build:

```bash
npm run build     # outputs to dist/
npm run preview   # preview the build locally
```

To check the flat-background engine against a real file without opening a browser:

```bash
npm run verify:cutout -- path/to/image.png output.png
```

## Tech stack

- [React](https://github.com/facebook/react) + [Vite](https://github.com/vitejs/vite)
- [@imgly/background-removal](https://github.com/imgly/background-removal-js) — in-browser segmentation on top of ONNX Runtime Web
- [sharp](https://github.com/lovell/sharp) — rasterizes the SVG brand assets into the PNGs shipped in `public/` and `.github/assets/` (`npm run generate:assets`)

## License

Published under the **MIT** license — see [`LICENSE`](LICENSE).
