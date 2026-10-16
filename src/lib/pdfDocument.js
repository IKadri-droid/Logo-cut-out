import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Helvetica's ascent as a fraction of the font size: where the baseline sits
// below the top of a line-height:1 text box, so on-screen and exported text line up.
export const TEXT_ASCENT = 0.77;
export const LINE_HEIGHT = 1.2;

const A4 = [595.28, 841.89];

export async function blankPdfBytes() {
  const doc = await PDFDocument.create();
  doc.addPage(A4);
  return doc.save();
}

// pdf.js transfers the buffer it's given to its worker, so it always gets a copy
// and the caller's bytes stay usable for the export step.
export async function openPdf(bytes) {
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    pages.push({ page, viewport: page.getViewport({ scale: 1 }) });
  }
  return { doc, pages };
}

export async function renderPage(page, canvas, scale) {
  const dpr = window.devicePixelRatio || 1;
  const viewport = page.getViewport({ scale: scale * dpr });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const task = page.render({ canvas, viewport });
  await task.promise;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

async function toEmbeddable(blob) {
  if (blob.type === "image/png" || blob.type === "image/jpeg") return blob;
  // pdf-lib only embeds PNG and JPEG; anything else is re-encoded losslessly to PNG.
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/**
 * Stamps the placed elements onto the original PDF. Element boxes are stored in
 * the page's on-screen space (scale 1, rotation applied), so each anchor is mapped
 * back through the pdf.js viewport into PDF user space, and the drawing is counter-
 * rotated so it reads upright on a rotated page.
 */
export async function exportPdf(bytes, pages, elements, assets) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pdfPages = doc.getPages();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const embedded = new Map();

  for (const el of elements) {
    const { viewport } = pages[el.page];
    const target = pdfPages[el.page];
    const rotate = degrees(viewport.rotation);

    if (el.kind === "image") {
      let image = embedded.get(el.assetId);
      if (!image) {
        const asset = assets.find((a) => a.id === el.assetId);
        const blob = await toEmbeddable(asset.blob);
        const data = new Uint8Array(await blob.arrayBuffer());
        image = blob.type === "image/jpeg" ? await doc.embedJpg(data) : await doc.embedPng(data);
        embedded.set(el.assetId, image);
      }
      const [x, y] = viewport.convertToPdfPoint(el.x, el.y + el.h);
      target.drawImage(image, { x, y, width: el.w, height: el.h, rotate });
    } else {
      el.text.split("\n").forEach((line, i) => {
        // Each line steps "down" the screen, which is a different PDF axis per rotation.
        const [x, y] = viewport.convertToPdfPoint(el.x, el.y + el.size * (TEXT_ASCENT + i * LINE_HEIGHT));
        target.drawText(line, { x, y, size: el.size, font, color: hexToRgb(el.color), rotate });
      });
    }
  }

  return new Blob([await doc.save()], { type: "application/pdf" });
}
