import { useCallback, useEffect, useRef, useState } from "react";
import { cutOut } from "./lib/removeBackground.js";

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

export default function App() {
  const [theme, setTheme] = useTheme();
  const [sourceFile, setSourceFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState(null);
  const [resultUrl, setResultUrl] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("idle"); // idle | working | done | error
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const runCutOut = useCallback(async (file) => {
    setSourceFile(file);
    setSourceUrl(URL.createObjectURL(file));
    setResultUrl(null);
    setError(null);
    setStatus("working");
    setProgress(0);

    try {
      const blob = await cutOut(file, (ratio) => setProgress(ratio));
      setResultUrl(URL.createObjectURL(blob));
      setStatus("done");
    } catch (err) {
      setError(err?.message || "Background removal failed.");
      setStatus("error");
    }
  }, []);

  const onFileChosen = useCallback(
    (fileList) => {
      const file = fileList?.[0];
      if (file && file.type.startsWith("image/")) runCutOut(file);
    },
    [runCutOut],
  );

  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [sourceUrl, resultUrl]);

  const downloadName = sourceFile ? sourceFile.name.replace(/\.[^.]+$/, "") + "-cutout.png" : "cutout.png";

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
            onFileChosen(e.dataTransfer.files);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={(e) => onFileChosen(e.target.files)}
          />
          <div className="dz-label">Drop an image, or click to choose one</div>
          <div className="dz-hint">PNG, JPEG or WebP — processed on this machine only.</div>
        </div>

        {status === "working" && (
          <section className="progress-area">
            <div className="progress-row">
              <div className="label">
                <span>Removing background</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.max(progress * 100, 4)}%` }} />
              </div>
            </div>
          </section>
        )}

        {status === "error" && <div className="alert">{error}</div>}

        {(status === "done" || status === "working") && sourceUrl && (
          <section className="preview-area">
            <div className="preview-grid">
              <div className="preview-pane">
                <span className="pane-label">Original</span>
                <img src={sourceUrl} alt="Original upload" />
              </div>
              <div className="preview-pane">
                <span className="pane-label">Cut out</span>
                <div className="checker">
                  {resultUrl && <img src={resultUrl} alt="Background removed" />}
                </div>
              </div>
            </div>

            {resultUrl && (
              <div className="result-actions">
                <a href={resultUrl} download={downloadName}>
                  <button type="button">Download PNG</button>
                </a>
                <button type="button" className="btn-secondary" onClick={() => inputRef.current?.click()}>
                  Try another image
                </button>
              </div>
            )}
          </section>
        )}
      </main>
    </>
  );
}
