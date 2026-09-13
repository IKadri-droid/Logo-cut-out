import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cutOut } from "./lib/removeBackground.js";
import { createBatchItems, runBatch } from "./lib/batch.js";
import { zipBlobs } from "./lib/zip.js";
import { getHfModel, getHfToken, setHfModel, setHfToken } from "./lib/onlineRemoveBackground.js";

const THEMES = ["auto", "light", "dark"];
const MODES = [
  { id: "offline", label: "Offline" },
  { id: "online", label: "Online AI" },
];

const ENGINE_LABELS = {
  passthrough: "already transparent",
  flat: "precision chroma-key",
  "ai-offline": "AI segmentation (offline)",
  "ai-online": "AI segmentation (online)",
};

function usePersistedState(key, fallback) {
  const [value, setValue] = useState(() => localStorage.getItem(key) || fallback);

  useEffect(() => {
    if (value === fallback) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  }, [key, value, fallback]);

  return [value, setValue];
}

function useTheme() {
  const [theme, setTheme] = usePersistedState("lco_theme", "auto");

  useEffect(() => {
    if (theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
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
  const [mode, setMode] = usePersistedState("lco_mode", "offline");
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [dragOver, setDragOver] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hfToken, setHfTokenField] = useState(() => getHfToken());
  const [hfModel, setHfModelField] = useState(() => getHfModel());
  const inputRef = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const modeRef = useRef(mode);
  modeRef.current = mode;

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
    const cutOutFn = (file) => cutOut(file, null, { mode: modeRef.current });
    runBatch(newItems, cutOutFn, updateItem);
  }, [updateItem]);

  useEffect(() => () => {
    for (const item of itemsRef.current) revokeItem(item);
  }, []);

  useEffect(() => {
    const handlePaste = (e) => {
      const target = e.target;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      const files = [];
      for (const item of e.clipboardData?.items || []) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length === 0) return;

      e.preventDefault();
      onFilesChosen(files);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [onFilesChosen]);

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

  const triggerDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSelected = async () => {
    if (selectedItems.length === 1) {
      const [only] = selectedItems;
      triggerDownload(only.resultBlob, downloadNameFor(only));
      return;
    }

    setZipping(true);
    try {
      const zip = await zipBlobs(selectedItems.map((item) => ({ name: downloadNameFor(item), blob: item.resultBlob })));
      triggerDownload(zip, "logo-cut-out.zip");
    } finally {
      setZipping(false);
    }
  };

  const saveSettings = (e) => {
    e.preventDefault();
    setHfToken(hfToken.trim());
    setHfModel(hfModel.trim());
  };

  const clearSettings = () => {
    setHfTokenField("");
    setHfModelField(getHfModel());
    setHfToken("");
    setHfModel("");
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
        <div className="controls-row">
          <span className="chip chip-local">100% local</span>
          <div className="switch">
            {MODES.map((m) => (
              <button key={m.id} type="button" className={mode === m.id ? "active" : ""} onClick={() => setMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="switch">
            {THEMES.map((t) => (
              <button key={t} type="button" className={theme === t ? "active" : ""} onClick={() => setTheme(t)}>
                {t}
              </button>
            ))}
          </div>
          <button type="button" className="btn-secondary" onClick={() => setShowSettings((v) => !v)}>
            Settings
          </button>
        </div>
      </header>

      <main className="app-shell">
        {showSettings && (
          <form className="settings-panel" onSubmit={saveSettings}>
            <div className="field">
              <label htmlFor="hf-token">Hugging Face API token</label>
              <input
                id="hf-token"
                type="password"
                autoComplete="off"
                placeholder="hf_…"
                value={hfToken}
                onChange={(e) => setHfTokenField(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="hf-model">Model id</label>
              <input
                id="hf-model"
                type="text"
                placeholder={getHfModel()}
                value={hfModel}
                onChange={(e) => setHfModelField(e.target.value)}
              />
            </div>
            <p className="field-hint">
              Used only when "Online AI" is selected, for images with a non-flat background. Create a free token at{" "}
              <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener">
                huggingface.co/settings/tokens
              </a>
              . Stored only in this browser — never sent anywhere except Hugging Face's API when you use online mode.
            </p>
            <div className="field-actions">
              <button type="submit">Save</button>
              <button type="button" className="btn-secondary" onClick={clearSettings}>
                Clear
              </button>
            </div>
          </form>
        )}

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
          <div className="dz-label">Drop images, paste (Ctrl/Cmd+V), or click to choose one or more</div>
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
                      {zipping
                        ? "Zipping…"
                        : selectedItems.length === 1
                          ? "Download selected (1)"
                          : `Download selected (${selectedItems.length}) as .zip`}
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
                    {item.status === "done" && <span className="chip engine-chip">{ENGINE_LABELS[item.engine]}</span>}
                    {item.fallbackReason && (
                      <span className="badge badge-pending">Online AI unavailable, used offline model instead</span>
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
