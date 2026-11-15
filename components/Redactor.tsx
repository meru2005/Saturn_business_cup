"use client";

import { useEffect, useRef, useState } from "react";

type Rect = { x: number; y: number; w: number; h: number }; // in image pixels

/**
 * "Hide private info" step: the user drags black boxes over their SSN, address or bank details.
 * Only the blacked-out image is sent to the server, so covered information never leaves the device.
 */
export function Redactor({ src, onDone, onCancel }: { src: string; onDone: (redacted: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [draft, setDraft] = useState<Rect | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      draw([], null);
    };
    img.src = src;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => draw(rects, draft), [rects, draft]); // eslint-disable-line react-hooks/exhaustive-deps

  function draw(rs: Rect[], d: Rect | null) {
    const c = canvasRef.current;
    const img = imgRef.current;
    if (!c || !img) return;
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    ctx.fillStyle = "#000";
    [...rs, ...(d ? [d] : [])].forEach((r) => ctx.fillRect(r.x, r.y, r.w, r.h));
    if (d) {
      ctx.strokeStyle = "#0f9d58";
      ctx.lineWidth = Math.max(2, img.width / 400);
      ctx.strokeRect(d.x, d.y, d.w, d.h);
    }
  }

  function toImage(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const b = c.getBoundingClientRect();
    return { x: ((e.clientX - b.left) / b.width) * c.width, y: ((e.clientY - b.top) / b.height) * c.height };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = toImage(e);
    setDraft({ ...start.current, w: 0, h: 0 });
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!start.current) return;
    const p = toImage(e);
    const s = start.current;
    setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  }
  function up() {
    if (draft && draft.w > 4 && draft.h > 4) setRects((r) => [...r, draft]);
    start.current = null;
    setDraft(null);
  }

  function finish() {
    draw(rects, null);
    onDone(canvasRef.current!.toDataURL("image/jpeg", 0.9));
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: 4 }}>Hide private info before we read it</h3>
      <p className="hint" style={{ marginTop: 0 }}>
        Drag over anything private, like your <strong>SSN</strong>, address or bank account, to black it out. Only the covered version leaves your device.
        We only need the pay amounts and federal tax.
      </p>
      <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", background: "#f3f5f4" }}>
        <canvas
          ref={canvasRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          style={{ width: "100%", height: "auto", display: "block", touchAction: "none", cursor: "crosshair" }}
          aria-label="Your paystub. Drag to cover private information."
        />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-primary" onClick={finish}>
          {rects.length ? `Read my paystub (${rects.length} area${rects.length > 1 ? "s" : ""} hidden)` : "Nothing private shown, read it"}
        </button>
        <button className="btn btn-secondary btn-small" onClick={() => setRects((r) => r.slice(0, -1))} disabled={!rects.length}>
          Undo
        </button>
        <button className="btn btn-ghost btn-small" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
