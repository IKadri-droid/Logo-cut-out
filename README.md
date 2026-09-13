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
- ⚡ **Fully client-side** — the neural network runs in your browser via WebAssembly/WebGPU; no image is ever sent to a server.
- 🔍 **Before/after preview** — check the cutout against a checkerboard before downloading.
- 📥 **Lossless export** — download the result as a PNG at the original image's resolution.

## How it works

Background removal here is a two-part problem: figuring out *which* pixels belong to the subject, and keeping the pixels you already know are correct untouched.

Logo Cut-Out draws your image onto a canvas at its native resolution and only asks the segmentation model for one thing: an alpha mask separating subject from background. The model itself works on a downscaled copy internally (as every such model does), but that mask is then upscaled and applied on top of your original, unmodified pixel data — so every RGB value in the final image is the same value your source file had, never re-encoded or recompressed along the way. The export is a PNG, a lossless format, so no compression artifacts are introduced at the finish line either.

Nothing leaves your machine: the model (via [`@imgly/background-removal`](https://github.com/imgly/background-removal-js)) runs in-browser on top of [ONNX Runtime Web](https://github.com/microsoft/onnxruntime), so there is no upload step and no server component at all.

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

## Tech stack

- [React](https://github.com/facebook/react) + [Vite](https://github.com/vitejs/vite)
- [@imgly/background-removal](https://github.com/imgly/background-removal-js) — in-browser segmentation on top of ONNX Runtime Web
- [sharp](https://github.com/lovell/sharp) — rasterizes the SVG brand assets into the PNGs shipped in `public/` and `.github/assets/` (`npm run generate:assets`)

## License

Published under the **MIT** license — see [`LICENSE`](LICENSE).
