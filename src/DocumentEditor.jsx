import { useCallback, useEffect, useRef, useState } from "react";
import { LINE_HEIGHT, blankPdfBytes, exportPdf, openPdf, renderPage } from "./lib/pdfDocument.js";

const TEXT_COLORS = ["#111111", "#ffffff", "#1b3a8c", "#a3341f", "#1f7a72"];

let nextId = 1;
const newId = () => `el-${nextId++}`;

function loadImageSize(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = url;
  });
}

function PdfPage({ entry, index, scale, active, onActivate, onDropFiles, children }) {
  const canvasRef = useRef(null);
  const { page, viewport } = entry;

  useEffect(() => {
    if (scale > 0) renderPage(page, canvasRef.current, scale);
  }, [page, scale]);

  return (
    <div
      className={`doc-page${active ? " active" : ""}`}
      style={{ width: viewport.width * scale, height: viewport.height * scale }}
      onPointerDown={() => onActivate(index)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        onDropFiles(e.dataTransfer.files, index, (e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale);
      }}
    >
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
      <span className="doc-page-number">{index + 1}</span>
      {children}
    </div>
  );
}

export default function DocumentEditor({ assets, onAddAssets }) {
  const [file, setFile] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [elements, setElements] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activePage, setActivePage] = useState(0);
  const [width, setWidth] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const pdfInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const pagesRef = useRef(null);
  const gestureRef = useRef(null);

  const selected = elements.find((el) => el.id === selectedId) || null;

  useEffect(() => {
    const node = pagesRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, [pdf]);

  useEffect(() => () => pdf?.doc.destroy(), [pdf]);

  const scaleFor = (viewport) => (width ? Math.min(width, 900) / viewport.width : 0);

  const loadBytes = async (bytes, name) => {
    setError(null);
    setBusy(true);
    try {
      const opened = await openPdf(bytes);
      setFile({ bytes, name });
      setPdf(opened);
      setElements([]);
      setSelectedId(null);
      setActivePage(0);
    } catch (err) {
      setError(`Couldn't open this PDF: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (f) => {
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setError("That isn't a PDF file.");
      return;
    }
    loadBytes(new Uint8Array(await f.arrayBuffer()), f.name);
  };

  const startBlank = async () => loadBytes(await blankPdfBytes(), "document.pdf");

  const closeDocument = () => {
    setPdf(null);
    setFile(null);
    setElements([]);
    setSelectedId(null);
  };

  const placeAsset = useCallback(async (asset, pageIndex, centerX, centerY) => {
    const { viewport } = pdf.pages[pageIndex];
    const size = await loadImageSize(asset.url);
    const w = Math.min(viewport.width * 0.3, size.width);
    const h = (w * size.height) / size.width;
    const cx = centerX ?? viewport.width / 2;
    const cy = centerY ?? viewport.height / 2;
    const el = { id: newId(), kind: "image", page: pageIndex, assetId: asset.id, x: cx - w / 2, y: cy - h / 2, w, h };
    setElements((prev) => [...prev, el]);
    setSelectedId(el.id);
  }, [pdf]);

  const addText = () => {
    const { viewport } = pdf.pages[activePage];
    const el = {
      id: newId(),
      kind: "text",
      page: activePage,
      text: "Text",
      size: 16,
      color: TEXT_COLORS[0],
      x: viewport.width / 2 - 20,
      y: viewport.height / 2 - 8,
    };
    setElements((prev) => [...prev, el]);
    setSelectedId(el.id);
  };

  const onDropFiles = async (fileList, pageIndex, x, y) => {
    const images = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    const added = onAddAssets(images.map((f) => ({ blob: f, name: f.name })));
    setActivePage(pageIndex);
    for (const asset of added) await placeAsset(asset, pageIndex, x, y);
  };

  const updateElement = (id, patch) => {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...patch } : el)));
  };

  const removeSelected = useCallback(() => {
    setElements((prev) => prev.filter((el) => el.id !== selectedId));
    setSelectedId(null);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const handleKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "Escape") {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedId, removeSelected]);

  const beginGesture = (e, el, type, scale) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedId(el.id);
    setActivePage(el.page);
    gestureRef.current = { type, id: el.id, scale, startX: e.clientX, startY: e.clientY, origin: { ...el } };
  };

  const moveGesture = (e) => {
    const g = gestureRef.current;
    if (!g) return;
    const dx = (e.clientX - g.startX) / g.scale;
    const dy = (e.clientY - g.startY) / g.scale;
    if (g.type === "move") {
      updateElement(g.id, { x: g.origin.x + dx, y: g.origin.y + dy });
    } else {
      const w = Math.max(12, g.origin.w + dx);
      updateElement(g.id, { w, h: (w * g.origin.h) / g.origin.w });
    }
  };

  const endGesture = () => {
    gestureRef.current = null;
  };

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const blob = await exportPdf(file.bytes, pdf.pages, elements, assets);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name.replace(/\.pdf$/i, "") + "-edited.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Export failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const assetTray = (
    <div className="doc-assets">
      <div className="doc-assets-head">
        <span className="field-label">Images</span>
        <button type="button" className="btn-secondary" onClick={() => imageInputRef.current?.click()}>
          Import image
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            onAddAssets(Array.from(e.target.files || []).map((f) => ({ blob: f, name: f.name })));
            e.target.value = "";
          }}
        />
      </div>
      {assets.length === 0 ? (
        <p className="field-hint">
          Import a logo here, or send one from the Cut out or Signature tab. Click an image to place it on the selected page,
          or drag a file straight onto a page.
        </p>
      ) : (
        <div className="doc-asset-grid">
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className="doc-asset checker"
              title={pdf ? `Place ${asset.name} on page ${activePage + 1}` : asset.name}
              disabled={!pdf}
              onClick={() => placeAsset(asset, activePage)}
            >
              <img src={asset.url} alt={asset.name} />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (!pdf) {
    return (
      <section className="doc-panel">
        <div
          className={`dropzone${dragOver ? " dragover" : ""}`}
          onClick={() => pdfInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            openFile(e.dataTransfer.files[0]);
          }}
        >
          <input ref={pdfInputRef} type="file" accept="application/pdf,.pdf" onChange={(e) => openFile(e.target.files[0])} />
          <div className="dz-label">{busy ? "Opening…" : "Drop a PDF, or click to choose one"}</div>
          <div className="dz-hint">Add logos, signatures and text, then download the edited PDF. Nothing leaves this machine.</div>
        </div>
        <div className="doc-blank">
          <button type="button" className="btn-secondary" onClick={startBlank}>
            Start from a blank A4 page
          </button>
        </div>
        {error && <span className="badge badge-error">{error}</span>}
        {assetTray}
      </section>
    );
  }

  return (
    <section className="doc-panel">
      <div className="batch-toolbar">
        <span className="batch-count">
          {file.name} · {pdf.pages.length} page{pdf.pages.length > 1 ? "s" : ""}
        </span>
        <div className="batch-actions">
          <button type="button" className="btn-secondary" onClick={addText}>
            Add text
          </button>
          <button type="button" className="btn-secondary" onClick={closeDocument}>
            Close
          </button>
          <button type="button" disabled={busy} onClick={download}>
            {busy ? "Saving…" : "Download PDF"}
          </button>
        </div>
      </div>

      {error && <span className="badge badge-error">{error}</span>}

      {assetTray}

      {selected && (
        <div className="doc-inspector">
          {selected.kind === "text" ? (
            <>
              <div className="field doc-text-field">
                <label htmlFor="doc-text">Text</label>
                <textarea
                  id="doc-text"
                  rows={2}
                  value={selected.text}
                  onChange={(e) => updateElement(selected.id, { text: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="doc-size">Size</label>
                <input
                  id="doc-size"
                  type="number"
                  min="4"
                  max="200"
                  value={selected.size}
                  onChange={(e) => updateElement(selected.id, { size: Math.max(4, Number(e.target.value) || 4) })}
                />
              </div>
              <div className="field">
                <span className="field-label">Color</span>
                <div className="color-row">
                  {TEXT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`color-dot${selected.color === c ? " active" : ""}`}
                      style={{ background: c }}
                      aria-label={c}
                      onClick={() => updateElement(selected.id, { color: c })}
                    />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <span className="field-hint">Drag to move, drag the corner to resize.</span>
          )}
          <button type="button" className="btn-secondary" onClick={removeSelected}>
            Delete
          </button>
        </div>
      )}

      <div className="doc-pages" ref={pagesRef} onPointerDown={() => setSelectedId(null)}>
        {pdf.pages.map((entry, index) => {
          const scale = scaleFor(entry.viewport);
          return (
            <PdfPage
              key={index}
              entry={entry}
              index={index}
              scale={scale}
              active={index === activePage}
              onActivate={setActivePage}
              onDropFiles={onDropFiles}
            >
              {elements
                .filter((el) => el.page === index)
                .map((el) => {
                  const isSelected = el.id === selectedId;
                  const common = {
                    key: el.id,
                    className: `doc-el${isSelected ? " selected" : ""}`,
                    onPointerDown: (e) => beginGesture(e, el, "move", scale),
                    onPointerMove: moveGesture,
                    onPointerUp: endGesture,
                    onPointerCancel: endGesture,
                  };
                  if (el.kind === "text") {
                    return (
                      <div
                        {...common}
                        className={`${common.className} doc-el-text`}
                        style={{
                          left: el.x * scale,
                          top: (el.y - (el.size * (LINE_HEIGHT - 1)) / 2) * scale,
                          fontSize: el.size * scale,
                          lineHeight: LINE_HEIGHT,
                          color: el.color,
                        }}
                      >
                        {el.text || " "}
                      </div>
                    );
                  }
                  const asset = assets.find((a) => a.id === el.assetId);
                  return (
                    <div {...common} style={{ left: el.x * scale, top: el.y * scale, width: el.w * scale, height: el.h * scale }}>
                      <img src={asset?.url} alt={asset?.name} draggable={false} />
                      {isSelected && (
                        <span
                          className="doc-resize"
                          onPointerDown={(e) => beginGesture(e, el, "resize", scale)}
                          onPointerMove={moveGesture}
                          onPointerUp={endGesture}
                          onPointerCancel={endGesture}
                        />
                      )}
                    </div>
                  );
                })}
            </PdfPage>
          );
        })}
      </div>
    </section>
  );
}
