import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cutOut } from "./lib/removeBackground.js";
import { createBatchItems, runBatch } from "./lib/batch.js";
import { zipBlobs } from "./lib/zip.js";

const THEMES = ["auto", "light", "dark"];

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem("lco_theme") || "auto");

  useEffect(() => {
    if (theme === "auto") {
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem("lco_theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("lco_theme", theme);
    }
  }, [theme]);

  return [theme, setTheme];
}

function downloadNameFor(item) {
  return item.name.replace(/\.[^.]+$/, "") + "-cutout.png";
}

function revokeItem(item) {
  URL.revokeObjectURL(item.sourceUrl);
  if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
}

export default function App() {
  const [theme, setTheme] = useTheme();
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [dragOver, setDragOver] = useState(false);
  const [zipping, setZipping] = useState(false);
  const inputRef = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const doneItems = useMemo(() => items.filter((item) => item.status === "done"), [items]);
  const selectedItems = useMemo(() => doneItems.filter((item) => selected.has(item.id)), [doneItems, selected]);

  const updateItem = useCallback((id, patch) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const onFilesChosen = useCallback((fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;

    const newItems = createBatchItems(files);
    setItems((prev) => [...prev, ...newItems]);
    runBatch(newItems, cutOut, updateItem);
  }, [updateItem]);

  useEffect(() => () => {
    for (const item of itemsRef.current) revokeItem(item);
  }, []);

  const clearAll = () => {
    for (const item of items) revokeItem(item);
    setItems([]);
    setSelected(new Set());
  };

  const toggleSelected = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(doneItems.map((item) => item.id)));
  const selectNone = () => setSelected(new Set());

  const downloadSelected = async () => {
    setZipping(true);
    try {
      const zip = await zipBlobs(selectedItems.map((item) => ({ name: downloadNameFor(item), blob: item.resultBlob })));
      const url = URL.createObjectURL(zip);
      const a = document.createElement("a");
      a.href = url;
      a.download = "logo-cut-out.zip";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  };

  return (
    <>
      <header className="topbar">
        <div>
          <h1>
            <span className="logo-mark" aria-hidden="true">
              <span className="lm-ink"></span>
              <span className="lm-accent"></span>
            </span>
            Logo Cut-Out
          </h1>
          <p className="tagline">Cut the background out of any image, at full quality, without it ever leaving your browser.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="chip chip-local">100% local</span>
          <div className="theme-switch">
            {THEMES.map((t) => (
              <button key={t} type="button" className={theme === t ? "active" : ""} onClick={() => setTheme(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="app-shell">
        <div
          className={`dropzone${dragOver ? " dragover" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onFilesChosen(e.dataTransfer.files);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => onFilesChosen(e.target.files)}
          />
          <div className="dz-label">Drop images, or click to choose one or more</div>
          <div className="dz-hint">PNG, JPEG or WebP — processed on this machine only.</div>
        </div>

        {items.length > 0 && (
          <section className="batch-area">
            <div className="batch-toolbar">
              <span className="batch-count">{items.length} image{items.length > 1 ? "s" : ""}</span>
              <div className="batch-actions">
                {doneItems.length > 0 && (
                  <>
                    <button type="button" className="btn-secondary" onClick={selectAll}>
                      Select all
                    </button>
                    <button type="button" className="btn-secondary" onClick={selectNone}>
                      Select none
                    </button>
                    <button type="button" disabled={selectedItems.length === 0 || zipping} onClick={downloadSelected}>
                      {zipping ? "Zipping…" : `Download selected (${selectedItems.length}) as .zip`}
                    </button>
                  </>
                )}
                <button type="button" className="btn-secondary" onClick={clearAll}>
                  Clear all
                </button>
              </div>
            </div>

            <div className="batch-grid">
              {items.map((item) => (
                <div className={`batch-card${selected.has(item.id) ? " selected" : ""}`} key={item.id}>
                  <div className="batch-compare">
                    <div className="batch-pane">
                      <span className="batch-pane-label">Original</span>
                      <img src={item.sourceUrl} alt={item.name} />
                    </div>
                    <div className="batch-pane">
                      <span className="batch-pane-label">Cut out</span>
                      <div className="batch-thumb checker">
                        {item.status === "done" && <img src={item.resultUrl} alt={`${item.name}, background removed`} />}
                        {item.status !== "done" && item.status !== "error" && (
                          <span className="batch-status-text">
                            {item.status === "processing" ? "Processing…" : "Queued"}
                          </span>
                        )}
                        {item.status === "done" && (
                          <label className="batch-select">
                            <input
                              type="checkbox"
                              checked={selected.has(item.id)}
                              onChange={() => toggleSelected(item.id)}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="batch-info">
                    <span className="batch-name">{item.name}</span>
                    {item.status === "error" && <span className="badge badge-error">{item.error}</span>}
                    {item.status === "done" && (
                      <span className="chip engine-chip">
                        {item.engine === "flat" ? "precision chroma-key" : "AI segmentation"}
                      </span>
                    )}
                  </div>

                  {item.status === "done" && (
                    <a href={item.resultUrl} download={downloadNameFor(item)}>
                      <button type="button" className="btn-secondary">Download</button>
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
