import { useCallback, useEffect, useRef, useState } from "react";

const STYLES = [
  { id: "ink-on-paper", label: "Black on white", ink: "#111111", bg: "#ffffff" },
  { id: "paper-on-ink", label: "White on black", ink: "#ffffff", bg: "#000000" },
  { id: "ink-clear", label: "Black, transparent", ink: "#111111", bg: null },
  { id: "paper-clear", label: "White, transparent", ink: "#ffffff", bg: null },
  { id: "blue-on-paper", label: "Blue on white", ink: "#1b3a8c", bg: "#ffffff" },
];

const WEIGHTS = [
  { id: "fine", label: "Fine", base: 1.6 },
  { id: "medium", label: "Medium", base: 2.6 },
  { id: "bold", label: "Bold", base: 4 },
];

const PAD_HEIGHT = 240;
const EXPORT_SCALE = 4;
const TRIM_PADDING = 16;

// Faster strokes get thinner, like a real pen; clamp so a pause never balloons the line.
function widthForSpeed(base, speed) {
  const factor = Math.min(1.25, Math.max(0.45, 1.25 - speed * 0.35));
  return base * factor;
}

function drawStrokes(ctx, strokes, ink) {
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const points of strokes) {
    if (points.length === 1) {
      const [p] = points;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    // Midpoint quadratic curves: each segment ends halfway to the next point,
    // with the actual sample as the control point, so the line stays smooth.
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const startX = i === 1 ? prev.x : (points[i - 2].x + prev.x) / 2;
      const startY = i === 1 ? prev.y : (points[i - 2].y + prev.y) / 2;
      const endX = (prev.x + cur.x) / 2;
      const endY = (prev.y + cur.y) / 2;
      ctx.beginPath();
      ctx.lineWidth = (prev.w + cur.w) / 2;
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(prev.x, prev.y, endX, endY);
      if (i === points.length - 1) ctx.lineTo(cur.x, cur.y);
      ctx.stroke();
    }
  }
}

function strokeBounds(strokes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const points of strokes) {
    for (const p of points) {
      minX = Math.min(minX, p.x - p.w);
      minY = Math.min(minY, p.y - p.w);
      maxX = Math.max(maxX, p.x + p.w);
      maxY = Math.max(maxY, p.y + p.w);
    }
  }
  return { minX, minY, maxX, maxY };
}

function renderSignature(strokes, style, padSize, trim) {
  let originX = 0, originY = 0, width = padSize.width, height = padSize.height;
  if (trim) {
    const b = strokeBounds(strokes);
    originX = b.minX - TRIM_PADDING;
    originY = b.minY - TRIM_PADDING;
    width = b.maxX - b.minX + TRIM_PADDING * 2;
    height = b.maxY - b.minY + TRIM_PADDING * 2;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * EXPORT_SCALE);
  canvas.height = Math.ceil(height * EXPORT_SCALE);
  const ctx = canvas.getContext("2d");
  if (style.bg) {
    ctx.fillStyle = style.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
  ctx.translate(-originX, -originY);
  drawStrokes(ctx, strokes, style.ink);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export default function SignaturePad({ onSendToDocument }) {
  const [styleId, setStyleId] = useState(STYLES[0].id);
  const [weightId, setWeightId] = useState("medium");
  const [strokes, setStrokes] = useState([]);
  const [trim, setTrim] = useState(true);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const sizeRef = useRef({ width: 0, height: PAD_HEIGHT });
  const activeRef = useRef(null);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const style = STYLES.find((s) => s.id === styleId);
  const weight = WEIGHTS.find((w) => w.id === weightId);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, sizeRef.current.width, sizeRef.current.height);
    const all = activeRef.current ? [...strokesRef.current, activeRef.current] : strokesRef.current;
    drawStrokes(ctx, all, style.ink);
  }, [style.ink]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = wrap.clientWidth;
      sizeRef.current = { width, height: PAD_HEIGHT };
      const canvas = canvasRef.current;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(PAD_HEIGHT * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${PAD_HEIGHT}px`;
      redraw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [redraw]);

  useEffect(() => {
    redraw();
  }, [strokes, redraw]);

  const pointFrom = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, t: e.timeStamp };
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    canvasRef.current.setPointerCapture(e.pointerId);
    const p = pointFrom(e);
    const w = e.pointerType === "pen" && e.pressure > 0 ? weight.base * (0.5 + e.pressure) : weight.base;
    activeRef.current = [{ ...p, w }];
    redraw();
  };

  const onPointerMove = (e) => {
    const active = activeRef.current;
    if (!active) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events) {
      const p = pointFrom(ev);
      const last = active[active.length - 1];
      const dist = Math.hypot(p.x - last.x, p.y - last.y);
      if (dist < 1) continue;
      const speed = dist / Math.max(1, p.t - last.t);
      const target = ev.pointerType === "pen" && ev.pressure > 0
        ? weight.base * (0.5 + ev.pressure)
        : widthForSpeed(weight.base, speed);
      // Ease toward the new width so thickness changes read as ink, not steps.
      active.push({ ...p, w: last.w * 0.6 + target * 0.4 });
    }
    redraw();
  };

  const endStroke = () => {
    const active = activeRef.current;
    if (!active) return;
    activeRef.current = null;
    setStrokes((prev) => [...prev, active]);
  };

  const undo = () => setStrokes((prev) => prev.slice(0, -1));
  const clear = () => setStrokes([]);

  const download = async () => {
    const blob = await renderSignature(strokes, style, sizeRef.current, trim);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `signature-${style.id}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    const blob = await renderSignature(strokes, style, sizeRef.current, trim);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const sendToDocument = async () => {
    const blob = await renderSignature(strokes, style, sizeRef.current, trim);
    onSendToDocument(blob, `signature-${style.id}.png`);
  };

  const isEmpty = strokes.length === 0;

  return (
    <section className="signature-panel">
      <div className="signature-options">
        <div className="field">
          <span className="field-label">Style</span>
          <div className="swatch-row">
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`swatch${styleId === s.id ? " active" : ""}`}
                onClick={() => setStyleId(s.id)}
                title={s.label}
              >
                <span className={`swatch-sample${s.bg ? "" : " checker"}`} style={{ background: s.bg || undefined }}>
                  <span style={{ color: s.ink }}>Aa</span>
                </span>
                <span className="swatch-label">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Pen</span>
          <div className="switch">
            {WEIGHTS.map((w) => (
              <button key={w.id} type="button" className={weightId === w.id ? "active" : ""} onClick={() => setWeightId(w.id)}>
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        ref={wrapRef}
        className={`signature-pad${style.bg ? "" : " checker"}`}
        style={{ background: style.bg || undefined }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
        />
        <span className="signature-baseline" style={{ background: style.ink }} aria-hidden="true" />
        {isEmpty && (
          <span className="signature-placeholder" style={{ color: style.ink }}>
            Hold the mouse button and sign here
          </span>
        )}
      </div>

      <div className="signature-actions">
        <label className="signature-trim">
          <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
          Crop to signature
        </label>
        <div className="batch-actions">
          <button type="button" className="btn-secondary" disabled={isEmpty} onClick={undo}>
            Undo
          </button>
          <button type="button" className="btn-secondary" disabled={isEmpty} onClick={clear}>
            Clear
          </button>
          <button type="button" className="btn-secondary" disabled={isEmpty} onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" className="btn-secondary" disabled={isEmpty} onClick={sendToDocument}>
            Add to document
          </button>
          <button type="button" disabled={isEmpty} onClick={download}>
            Download PNG
          </button>
        </div>
      </div>
    </section>
  );
}
