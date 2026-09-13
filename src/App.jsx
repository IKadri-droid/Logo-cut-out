import { useCallback, useEffect, useRef, useState } from "react";
import { cutOut } from "./lib/removeBackground.js";
import { createBatchItems, runBatch } from "./lib/batch.js";

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

export default function App() {
  const [theme, setTheme] = useTheme();
  const [items, setItems] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const urlsRef = useRef(new Map());

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

  useEffect(() => {
    for (const item of items) {
      if (item.resultBlob && !urlsRef.current.has(item.id)) {
        urlsRef.current.set(item.id, URL.createObjectURL(item.resultBlob));
      }
    }
  }, [items]);

  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
    };
  }, []);

  const clearAll = () => {
    for (const url of urlsRef.current.values()) URL.revokeObjectURL(url);
    urlsRef.current.clear();
    setItems([]);
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
              <button type="button" className="btn-secondary" onClick={clearAll}>
                Clear all
              </button>
            </div>

            <div className="batch-grid">
              {items.map((item) => (
                <div className="batch-card" key={item.id}>
                  <div className="batch-thumb checker">
                    {item.status === "done" && <img src={urlsRef.current.get(item.id)} alt={item.name} />}
                  </div>
                  <div className="batch-info">
                    <span className="batch-name">{item.name}</span>
                    {item.status === "processing" && <span className="badge badge-pending">Processing…</span>}
                    {item.status === "queued" && <span className="badge badge-pending">Queued</span>}
                    {item.status === "error" && <span className="badge badge-error">{item.error}</span>}
                    {item.status === "done" && (
                      <span className="chip engine-chip">
                        {item.engine === "flat" ? "precision chroma-key" : "AI segmentation"}
                      </span>
                    )}
                  </div>
                  {item.status === "done" && (
                    <a href={urlsRef.current.get(item.id)} download={downloadNameFor(item)}>
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
