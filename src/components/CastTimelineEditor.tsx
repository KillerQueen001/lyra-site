import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

export type Slot = { id: string; start: number; end: number };
export type GhostLane = { id: string; name: string; color: string; slots: { start: number; end: number }[] };

export type CastTimelineEditorProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  initialSlots: { start: number; end: number }[];
  ghosts?: GhostLane[];         // diğer cast’lar: referans, read-only
  onSave: (slots: Slot[]) => void;
  snap?: number;                // default 0.05s
};

const SNAP = 0.05;
const MIN_LEN = 0.1;

function guid() { return Math.random().toString(36).slice(2, 10); }
function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }
function snapf(n: number, step = SNAP) { return Math.round(n / step) * step; }
function fmt(s: number) {
  if (!isFinite(s)) return "0:00.000";
  const ms = Math.floor((s % 1) * 1000).toString().padStart(3, "0");
  const total = Math.floor(s);
  const m = Math.floor(total / 60).toString().padStart(1, "0");
  const sec = (total % 60).toString().padStart(2, "0");
  return `${m}:${sec}.${ms}`;
}

export default function CastTimelineEditor({
  videoRef, initialSlots, ghosts = [], onSave, snap = SNAP,
}: CastTimelineEditorProps) {
  const [slots, setSlots] = useState<Slot[]>(
    () => initialSlots.map((s) => ({ id: guid(), ...s })).sort((a, b) => a.start - b.start)
  );
  const timelineRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const duration = videoRef.current?.duration ?? 0;
  const current = videoRef.current?.currentTime ?? 0;

  // layout: container width takibi
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // rAF ile playhead repaint
  const [, force] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => { force((x) => (x + 1) % 1e6); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const pps = useMemo(() => (duration > 0 ? w / duration : 0), [w, duration]);
  const t2x = (t: number) => t * pps;
  const x2t = (x: number) => x / Math.max(1, pps);

  const seek = (t: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = clamp(t, 0, duration || 0);
  };

  // mouse edit
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<null | { mode: "move" | "l" | "r"; id: string; offset: number; startSnap: Slot }>(null);

  function onDownBlank(e: React.MouseEvent) {
    if (!duration) return;
    const rect = (timelineRef.current as HTMLDivElement).getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, 0, w);
    const t0 = snapf(clamp(x2t(x), 0, duration));
    const temp: Slot = { id: "__temp__", start: t0, end: Math.min(duration, t0 + 0.2) };
    setSlots((prev) => [...prev, temp]);
    setSel(temp.id);
    setDrag({ mode: "r", id: temp.id, offset: 0, startSnap: { ...temp } });
  }
  function onDownSlot(e: React.MouseEvent, s: Slot, mode: "move" | "l" | "r") {
    e.stopPropagation();
    const rect = (timelineRef.current as HTMLDivElement).getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, 0, w);
    const off = x - t2x(s.start);
    setSel(s.id);
    setDrag({ mode, id: s.id, offset: off, startSnap: { ...s } });
  }
  function onMove(e: React.MouseEvent) {
    if (!drag) return;
    const rect = (timelineRef.current as HTMLDivElement).getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, 0, w);
    setSlots((prev) => {
      const idx = prev.findIndex((p) => p.id === drag.id);
      if (idx === -1) return prev;
      const next = [...prev];
      const s = { ...next[idx] };
      const len = drag.startSnap.end - drag.startSnap.start;

      if (drag.mode === "move") {
        const tx = x - drag.offset;
        const t = snapf(clamp(x2t(tx), 0, Math.max(0, duration - len)), snap);
        s.start = t;
        s.end = snapf(clamp(t + len, t + MIN_LEN, duration), snap);
      } else if (drag.mode === "l") {
        const t = snapf(clamp(x2t(x), 0, s.end - MIN_LEN), snap);
        s.start = t;
      } else if (drag.mode === "r") {
        const t = snapf(clamp(x2t(x), s.start + MIN_LEN, duration), snap);
        s.end = t;
      }
      next[idx] = s;
      return next.sort((a, b) => a.start - b.start);
    });
  }
  function onUp() {
    if (!drag) return;
    setDrag(null);
    setSlots((prev) => {
      const i = prev.findIndex((p) => p.id === "__temp__");
      if (i !== -1) {
        const s = prev[i];
        if (s.end - s.start < MIN_LEN) {
          const copy = [...prev]; copy.splice(i, 1); setSel(null); return copy;
        } else {
          const copy = [...prev]; copy[i] = { ...s, id: guid() }; setSel(copy[i].id); return copy;
        }
      }
      return prev;
    });
  }

  const delSel = useCallback(() => {
    if (!sel) return;
    setSlots((p) => p.filter((x) => x.id !== sel));
    setSel(null);
  }, [sel]);

  function addAtCurrent(len = 2) {
    const t = videoRef.current?.currentTime ?? 0;
    const start = snapf(clamp(t, 0, Math.max(0, duration - MIN_LEN)), snap);
    const end = snapf(clamp(t + len, start + MIN_LEN, duration), snap);
    const s: Slot = { id: guid(), start, end };
    setSlots((p) => [...p, s].sort((a, b) => a.start - b.start));
    setSel(s.id);
  }

  // kısayollar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!sel) return;
      const idx = slots.findIndex((s) => s.id === sel);
      if (idx === -1) return;
      const s = { ...slots[idx] };
      const step = e.shiftKey ? 0.5 : 0.1;
      let changed = false;
      if (e.key === "ArrowLeft") {
        const len = s.end - s.start;
        s.start = clamp(s.start - step, 0, Math.max(0, duration - MIN_LEN));
        s.end = clamp(s.start + len, s.start + MIN_LEN, duration);
        changed = true;
      } else if (e.key === "ArrowRight") {
        const len = s.end - s.start;
        s.start = clamp(s.start + step, 0, Math.max(0, duration - MIN_LEN));
        s.end = clamp(s.start + len, s.start + MIN_LEN, duration);
        changed = true;
      } else if (e.key === "Delete" || e.key === "Backspace") {
        delSel();
      }
      if (changed) {
        s.start = snapf(s.start, snap);
        s.end = snapf(s.end, snap);
        const next = [...slots];
        next[idx] = s;
        setSlots(next.sort((a, b) => a.start - b.start));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, slots, duration, snap, delSel]);

  // ===== styles
  const panelText = { color: "#eee", fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial" } as const;
  const barBtn: React.CSSProperties = { padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,.12)", background: "#1b1b24", color: "#eee", cursor: "pointer" };
  const timelineStyle: React.CSSProperties = {
    position: "relative",
    height: 140,                 // TEK SATIR HİSSİ (ghost üst, edit bandı alt)
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(18,18,24,.88)",
    overflow: "hidden",
    userSelect: "none",
  };
  const ghostTop = 8;
  const ghostHeight = 18;
  const bandTop = 48;           // düzenlenebilir bandın üstten ofseti
  const bandHeight = 56;

  return (
    <div style={panelText}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ opacity: .75, fontSize: 12 }}>{fmt(current)} / {fmt(duration)}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={barBtn} onClick={() => addAtCurrent(2)}>+2s</button>
          <button style={{ ...barBtn, background: "rgba(239,68,68,.9)", borderColor: "transparent" }} onClick={delSel} disabled={!sel}>Sil</button>
          <button
            style={{ ...barBtn, background: "#059669", borderColor: "transparent" }}
            onClick={() => onSave(slots)}
          >Kaydet</button>
        </div>
      </div>

      {/* timeline */}
      <div
        ref={timelineRef}
        style={timelineStyle}
        onMouseDown={onDownBlank}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onDoubleClick={(e) => {
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const x = e.clientX - rect.left;
          seek(x2t(x));
        }}
      >
        {/* grid çizgileri */}
        <Grid duration={duration} width={w} />

        {/* ghosts (diğer castlar) — ÜST İNCE ŞERİT */}
        {ghosts.map((g) =>
          g.slots.map((s, i) => (
            <div
              key={`${g.id}-${i}`}
              title={g.name}
              style={{
                position: "absolute",
                top: ghostTop,
                left: t2x(s.start),
                width: Math.max(2, t2x(s.end) - t2x(s.start)),
                height: ghostHeight,
                borderRadius: 6,
                background: `${g.color}33`,
                border: `1px dashed ${g.color}99`,
              }}
            />
          ))
        )}

        {/* editable band (TEK SATIR) */}
        {slots.map((s) => {
          const left = t2x(s.start);
          const right = t2x(s.end);
          const wpx = Math.max(2, right - left);
          const selected = s.id === sel;
          return (
            <div
              key={s.id}
              onMouseDown={(e) => onDownSlot(e, s, "move")}
              title={`${fmt(s.start)} – ${fmt(s.end)}`}
              style={{
                position: "absolute",
                top: bandTop,
                left,
                width: wpx,
                height: bandHeight,
                borderRadius: 10,
                boxShadow: "0 4px 16px rgba(0,0,0,.35)",
                background: "rgba(124,75,217,.2)",
                border: selected ? "2px solid rgba(255,255,255,.85)" : "1px solid rgba(255,255,255,.12)",
                overflow: "hidden",
              }}
            >
              {/* resize kulakları */}
              <div
                onMouseDown={(e) => onDownSlot(e, s, "l")}
                style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, cursor: "ew-resize", background: "rgba(255,255,255,.08)" }}
              />
              <div
                onMouseDown={(e) => onDownSlot(e, s, "r")}
                style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, cursor: "ew-resize", background: "rgba(255,255,255,.08)" }}
              />
              {/* etiket */}
              <div style={{ padding: "6px 8px", fontSize: 12 }}>
                <div style={{ fontWeight: 700, opacity: .95, marginBottom: 2 }}>Konuşma</div>
                <div style={{ opacity: .8 }}>{fmt(s.start)} – {fmt(s.end)}</div>
              </div>
            </div>
          );
        })}

        {/* playhead */}
        <div
          style={{
            position: "absolute",
            top: 0, bottom: 0,
            width: 1,
            background: "#fff",
            transform: `translateX(${t2x(current)}px)`,
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
}

function Grid({ duration, width }: { duration: number; width: number }) {
  const majorEvery = 5, minorEvery = 1;
  const pps = duration > 0 ? width / duration : 0;
  const minors: number[] = []; for (let t = 0; t <= duration; t += minorEvery) minors.push(t);
  const majors: number[] = []; for (let t = 0; t <= duration; t += majorEvery) majors.push(t);

  // inline çizgiler ve alt etiket hattı
  const gridWrap: React.CSSProperties = { position: "absolute", inset: 0 } as const;
  const labelBar: React.CSSProperties = { position: "absolute", left: 0, right: 0, bottom: 0, height: 24, background: "rgba(255,255,255,.06)" };

  return (
    <div style={gridWrap}>
      {minors.map((t) => (
        <div key={`m${t}`} style={{ position: "absolute", top: 0, bottom: 0, left: t * pps, borderRight: "1px solid rgba(255,255,255,.08)" }} />
      ))}
      {majors.map((t) => (
        <div key={`M${t}`} style={{ position: "absolute", top: 0, bottom: 0, left: t * pps, borderRight: "1px solid rgba(255,255,255,.24)" }} />
      ))}
      <div style={labelBar} />
      {majors.map((t) => (
        <div key={`L${t}`} style={{ position: "absolute", bottom: 2, left: t * pps + 4, fontSize: 11, color: "rgba(255,255,255,.85)" }}>
          {fmt(t)}
        </div>
      ))}
    </div>
  );
}
