import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * AdminTimelinePanel – DnD Timeline (Premiere benzeri)
 * - Palet: Cast çipleri + Tür (dialogue/music/sfx/fx/note)
 * - Paletten timeline'a sürükle-bırak ile slot oluşturma
 * - Var olan slot üzerine bırakılırsa: cast ekler / tür değiştirir
 * - Slotları sürükle (taşı), kenarlardan uzat/kısalt (snap)
 * - Çift tıkla: videoda o ana git
 * - Bulk import/export + Kaydet callback
 * - Lint-clean (no any, no empty, no useless-escape)
 */

export type Slot = {
  id: string;
  start: number;
  end: number;
  label?: string;
  cast?: string[];
  color?: string;
  kind?: Kind; // slot tipi (stil/rengi etkiler)
};

export type AdminTimelinePanelProps = {
  videoRef: React.RefObject<HTMLVideoElement>;
  initialSlots?: Slot[];
  onSave?: (slots: Slot[]) => void;
};

type Kind = "dialogue" | "music" | "sfx" | "fx" | "note";

const KIND_COLORS: Record<Kind, string> = {
  dialogue: "#7c4bd9",
  music: "#5ad1b3",
  sfx: "#ffd166",
  fx: "#8ecae6",
  note: "#b598ff",
};

const SNAP = 0.05; // 50ms
const MIN_LEN = 0.1; // 100ms

function guid() {
  return Math.random().toString(36).slice(2, 10);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function snap(n: number, step = SNAP) {
  return Math.round(n / step) * step;
}

function secondsToTime(s: number) {
  if (!isFinite(s)) return "0:00.000";
  const ms = Math.floor((s % 1) * 1000)
    .toString()
    .padStart(3, "0");
  const total = Math.floor(s);
  const m = Math.floor(total / 60)
    .toString()
    .padStart(1, "0");
  const sec = (total % 60).toString().padStart(2, "0");
  return `${m}:${sec}.${ms}`;
}

export default function AdminTimelinePanel({
  videoRef,
  initialSlots = [],
  onSave,
}: AdminTimelinePanelProps) {
  const [slots, setSlots] = useState<Slot[]>(() =>
    [...initialSlots].sort((a, b) => a.start - b.start)
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<null | "move" | "resize-l" | "resize-r">(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragStartSnapshot, setDragStartSnapshot] = useState<Slot | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);

  // DnD palet → timeline geçici önizleme
  const [dragCreate, setDragCreate] = useState<
    | { active: true; startX: number; currentX: number; meta: { cast?: string; kind?: Kind } }
    | { active: false }
  >({ active: false });

  const duration = videoRef.current?.duration ?? 0;
  const currentTime = videoRef.current?.currentTime ?? 0;

  // Bulk import UI
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Resize observer for timeline width
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Sync playhead with rAF
  const [, force] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      force((x) => (x + 1) % 1000000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Keyboard helpers
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedId || !videoRef.current) return;
      const idx = slots.findIndex((s) => s.id === selectedId);
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
        setSlots((prev) => prev.filter((x) => x.id !== selectedId));
        setSelectedId(null);
      }
      if (changed) {
        s.start = snap(s.start);
        s.end = snap(s.end);
        const next = [...slots];
        next[idx] = s;
        setSlots(next.sort((a, b) => a.start - b.start));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, slots, duration, videoRef]);

  const pxPerSec = useMemo(() => (duration > 0 ? width / duration : 0), [width, duration]);

  function timeToX(t: number) {
    return t * pxPerSec;
  }
  function xToTime(x: number) {
    return x / Math.max(1, pxPerSec);
  }

  function seek(t: number) {
    if (!videoRef.current) return;
    videoRef.current.currentTime = clamp(t, 0, duration || 0);
  }

  // === Palette DnD ===
  function onPaletteDragStart(e: React.DragEvent, meta: { cast?: string; kind?: Kind }) {
    e.dataTransfer.setData("application/x-slot", JSON.stringify(meta));
    e.dataTransfer.effectAllowed = "copy";
  }

  function onTimelineDragOver(e: React.DragEvent) {
    const dt = e.dataTransfer;
    if (!dt) return;
    const has = Array.from(dt.types).includes("application/x-slot");
    if (!has) return;
    e.preventDefault();
    const rect = (timelineRef.current as HTMLDivElement).getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, 0, width);

    setDragCreate((prev) => {
      const meta = prev.active ? prev.meta : parseMeta(dt);
      if (!meta) return { active: false };
      if (!prev.active) {
        return { active: true, startX: x, currentX: x + 30, meta };
      }
      return { ...prev, currentX: x } as typeof prev;
    });
  }

  function parseMeta(dt: DataTransfer): { cast?: string; kind?: Kind } | null {
    try {
      const raw = dt.getData("application/x-slot");
      if (!raw) return null;
      const m = JSON.parse(raw) as { cast?: string; kind?: Kind };
      return m;
    } catch {
      return null;
    }
  }

  function onTimelineDrop(e: React.DragEvent) {
    const dt = e.dataTransfer;
    if (!dt) return;
    const meta = parseMeta(dt);
    if (!meta) {
      setDragCreate({ active: false });
      return;
    }
    e.preventDefault();
    const rect = (timelineRef.current as HTMLDivElement).getBoundingClientRect();
    const dropX = clamp(e.clientX - rect.left, 0, width);

    setSlots((prev) => {
      const startX = dragCreate.active ? Math.min(dragCreate.startX, dragCreate.currentX) : dropX - 20;
      let endX = dragCreate.active ? Math.max(dragCreate.startX, dragCreate.currentX) : dropX + 40;
      if (endX - startX < 8) endX = startX + 8;

      const start = snap(clamp(xToTime(startX), 0, Math.max(0, duration - MIN_LEN)));
      const end = snap(clamp(xToTime(endX), start + MIN_LEN, duration));

      // mevcut slot üstüne bırakıldıysa -> cast ekle / tür güncelle
      const hitIdx = prev.findIndex((s) => timeToX(s.start) <= dropX && timeToX(s.end) >= dropX);
      if (hitIdx !== -1) {
        const next = [...prev];
        const s = { ...next[hitIdx] };
        if (meta.cast) {
          const setCast = new Set([...(s.cast ?? []), meta.cast]);
          s.cast = [...setCast];
        }
        if (meta.kind) {
          s.kind = meta.kind;
          s.color = KIND_COLORS[meta.kind];
        }
        next[hitIdx] = s;
        return next;
      }

      const newSlot: Slot = {
        id: guid(),
        start,
        end,
        label: meta.cast ? `${meta.cast}` : meta.kind ? meta.kind : "",
        cast: meta.cast ? [meta.cast] : [],
        kind: meta.kind,
        color: meta.kind ? KIND_COLORS[meta.kind] : pickColor(),
      };
      return [...prev, newSlot].sort((a, b) => a.start - b.start);
    });

    setDragCreate({ active: false });
  }

  function onTimelineDragLeave() {
    setDragCreate({ active: false });
  }

  function addFromCurrent(seconds = 2) {
    const t = videoRef.current?.currentTime ?? 0;
    const start = snap(clamp(t, 0, Math.max(0, duration - MIN_LEN)));
    const end = snap(clamp(t + seconds, start + MIN_LEN, duration));
    const newSlot: Slot = {
      id: guid(),
      start,
      end,
      label: "",
      cast: [],
      color: pickColor(),
      kind: "dialogue",
    };
    setSlots((prev) => [...prev, newSlot].sort((a, b) => a.start - b.start));
    setSelectedId(newSlot.id);
  }

  function duplicateSelected() {
    if (!selectedId) return;
    const s = slots.find((x) => x.id === selectedId);
    if (!s) return;
    const len = s.end - s.start;
    const start = snap(clamp(s.end + 0.05, 0, Math.max(0, duration - len)));
    const end = snap(clamp(start + len, start + MIN_LEN, duration));
    const newSlot: Slot = { ...s, id: guid(), start, end };
    setSlots((prev) => [...prev, newSlot].sort((a, b) => a.start - b.start));
    setSelectedId(newSlot.id);
  }

  // Drag logic (slot move/resize)
  function onMouseDownSlot(e: React.MouseEvent, slot: Slot, mode: typeof dragMode) {
    e.stopPropagation();
    const rect = (timelineRef.current as HTMLDivElement).getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const offsetWithin = mouseX - timeToX(slot.start);
    setSelectedId(slot.id);
    setIsDragging(true);
    setDragMode(mode);
    setDragOffset(offsetWithin);
    setDragStartSnapshot({ ...slot });
  }

  function onMouseDownBlank(e: React.MouseEvent) {
    if (!duration) return;
    const rect = (timelineRef.current as HTMLDivElement).getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const t0 = snap(clamp(xToTime(startX), 0, duration));
    const temp: Slot = {
      id: "__temp__",
      start: t0,
      end: t0 + 0.2,
      label: "",
      cast: [],
      color: pickColor(),
      kind: "dialogue",
    };
    setSlots((prev) => [...prev, temp]);
    setSelectedId(temp.id);
    setIsDragging(true);
    setDragMode("resize-r");
    setDragStartSnapshot({ ...temp });
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!isDragging || !dragMode || !selectedId) return;
    const idx = slots.findIndex((s) => s.id === selectedId);
    if (idx === -1) return;
    const rect = (timelineRef.current as HTMLDivElement).getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    const next = [...slots];
    const s = { ...next[idx] };
    const len = (dragStartSnapshot?.end ?? 0) - (dragStartSnapshot?.start ?? 0);

    if (dragMode === "move") {
      const x = mouseX - dragOffset;
      const t = snap(clamp(xToTime(x), 0, Math.max(0, duration - len)));
      s.start = t;
      s.end = snap(clamp(t + len, t + MIN_LEN, duration));
    } else if (dragMode === "resize-l") {
      const t = snap(clamp(xToTime(mouseX), 0, s.end - MIN_LEN));
      s.start = t;
    } else if (dragMode === "resize-r") {
      const t = snap(clamp(xToTime(mouseX), s.start + MIN_LEN, duration));
      s.end = t;
    }

    next[idx] = s;
    setSlots(next.sort((a, b) => a.start - b.start));
  }

  function onMouseUp() {
    if (!isDragging) return;
    setIsDragging(false);
    setDragMode(null);

    setSlots((prev) => {
      const tempIdx = prev.findIndex((p) => p.id === "__temp__");
      if (tempIdx !== -1) {
        const s = prev[tempIdx];
        const len = s.end - s.start;
        if (len < MIN_LEN) {
          const copy = [...prev];
          copy.splice(tempIdx, 1);
          setSelectedId(null);
          return copy;
        } else {
          const copy = [...prev];
          copy[tempIdx] = { ...s, id: guid() };
          setSelectedId(copy[tempIdx].id);
          return copy;
        }
      }
      return prev;
    });
  }

  function removeSelected() {
    if (!selectedId) return;
    setSlots((prev) => prev.filter((s) => s.id !== selectedId));
    setSelectedId(null);
  }

  function updateSelected(patch: Partial<Slot>) {
    if (!selectedId) return;
    setSlots((prev) => {
      const idx = prev.findIndex((s) => s.id === selectedId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

  // Bulk import
  type RawSlot = {
    id?: string;
    start?: number | string;
    end?: number | string;
    label?: string;
    cast?: string[] | string;
    color?: string;
    kind?: Kind;
  };

  function tryParseBulk(text: string): Slot[] | null {
    setError(null);
    // JSON
    try {
      const j = JSON.parse(text);
      if (Array.isArray(j)) {
        const normalized = (j as unknown[]).map((x) => {
          const r = x as RawSlot;
          const castArr = Array.isArray(r.cast)
            ? r.cast
            : r.cast
            ? String(r.cast)
                .split(/[;,]/)
                .map((s) => s.trim())
                .filter(Boolean)
            : [];

        return {
            id: r.id ?? guid(),
            start: Number(r.start ?? 0),
            end: Number(r.end ?? 0),
            label: r.label ?? "",
            cast: castArr,
            color: r.color ?? (r.kind ? KIND_COLORS[r.kind] : pickColor()),
            kind: r.kind ?? "dialogue",
          } satisfies Slot;
        }) as Slot[];
        return normalized;
      }
    } catch {
      /* ignore */
    }

    // CSV: start,end,label,cast1|cast2,kind
    try {
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length) {
        // virgül, fakat çift tırnak içindekileri bölme
        const rows = lines.map((l) =>
          l.split(/,(?![^"]*")/).map((c) => c.replace(/"/g, "").trim())
        );
        const startCol = rows[0][0].toLowerCase().includes("start") ? 1 : 0;
        const usable = startCol ? rows.slice(1) : rows;
        const out: Slot[] = usable.map((r) => {
          const start = Number(r[0] ?? 0);
          const end = Number(r[1] ?? Math.max(0, start + 1));
          const label = r[2] ?? "";
          const cast = (r[3] ?? "").split(/[|;/]/).map((s) => s.trim()).filter(Boolean);
          const kind = ((r[4] ?? "dialogue") as Kind);
          return { id: guid(), start, end, label, cast, kind, color: KIND_COLORS[kind] };
        });
        return out;
      }
    } catch {
      /* ignore */
    }

    setError("Geçersiz JSON/CSV formatı.");
    return null;
  }

  function handleImport() {
    const parsed = tryParseBulk(importText);
    if (!parsed) return;
    const bounded = parsed
      .map((s) => ({
        ...s,
        start: snap(clamp(s.start, 0, Math.max(0, duration - MIN_LEN))),
        end: snap(clamp(s.end, 0 + MIN_LEN, duration)),
      }))
      .filter((s) => s.end - s.start >= MIN_LEN);
    setSlots(bounded.sort((a, b) => a.start - b.start));
    setImportOpen(false);
    setImportText("");
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(slots, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "timeline-slots.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const colorIdx = useRef(0);
  const palette = ["#7c4bd9", "#b598ff", "#ff8fa3", "#5ad1b3", "#ffd166", "#8ecae6"];
  function pickColor() {
    const c = palette[colorIdx.current % palette.length];
    colorIdx.current += 1;
    return c;
  }

  const selected = slots.find((s) => s.id === selectedId) || null;

  // === UI ===
  return (
    <div className="flex gap-3 w-[780px] min-w-[720px] max-w-[920px] text-[#eee]">
      {/* Palette */}
      <div className="w-48 shrink-0 rounded-lg border border-white/10 bg-[#1b1b24] p-3">
        <div className="text-xs font-semibold mb-2 opacity-80">Palet</div>
        <div className="text-[11px] text-white/70 mb-1">Cast</div>
        <div className="flex flex-wrap gap-1 mb-3">
          {PALETTE_CAST.map((c) => (
            <button
              key={c}
              draggable
              onDragStart={(e) => onPaletteDragStart(e, { cast: c })}
              className="text-[11px] px-2 py-1 rounded-full bg-white/10 hover:bg-white/20"
              title="Sürükleyip timeline'a bırak"
            >
              {c}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-white/70 mb-1">Tür</div>
        <div className="grid grid-cols-2 gap-2">
          {PALETTE_KINDS.map((k) => (
            <button
              key={k}
              draggable
              onDragStart={(e) => onPaletteDragStart(e, { kind: k })}
              className="text-[11px] px-2 py-1 rounded border border-white/10 hover:border-white/30"
              style={{ background: KIND_COLORS[k] + "22", color: "#fff" }}
              title="Sürükleyip timeline'a bırak"
            >
              {k}
            </button>
          ))}
        </div>

        <div className="mt-4 border-t border-white/10 pt-3">
          <div className="text-[11px] text-white/70 mb-1">Hızlı</div>
          <div className="flex flex-wrap gap-2">
            <button
              className="px-3 py-1.5 rounded bg-[#7c4bd9] hover:opacity-90"
              onClick={() => addFromCurrent(2)}
            >
              +2s
            </button>
            <button
              className="px-3 py-1.5 rounded bg-[#3a334a] hover:bg-[#4a405c]"
              onClick={() => duplicateSelected()}
              disabled={!selectedId}
            >
              Kopyala
            </button>
            <button
              className="px-3 py-1.5 rounded bg-[#3a334a] hover:bg-[#4a405c]"
              onClick={() => setImportOpen(true)}
            >
              İçe Aktar
            </button>
            <button
              className="px-3 py-1.5 rounded bg-[#3a334a] hover:bg-[#4a405c]"
              onClick={handleExport}
            >
              Export
            </button>
            <button
              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500"
              onClick={() => onSave?.(slots)}
            >
              Kaydet
            </button>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1">
        <div
          ref={timelineRef}
          className="relative select-none h-32 rounded-lg border border-white/10 bg-[rgba(18,18,24,0.88)] overflow-hidden"
          onMouseDown={onMouseDownBlank}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onDragOver={onTimelineDragOver}
          onDrop={onTimelineDrop}
          onDragLeave={onTimelineDragLeave}
        >
          <Grid duration={duration} width={width} />

          {/* DnD preview */}
          {dragCreate.active && (
            <div
              className="absolute top-2 h-[80px] rounded-md border-2 border-dashed"
              style={{
                left: Math.min(dragCreate.startX, dragCreate.currentX),
                width: Math.max(6, Math.abs(dragCreate.currentX - dragCreate.startX)),
                borderColor: dragCreate.meta.kind ? KIND_COLORS[dragCreate.meta.kind] : "#bfb8d6",
              }}
            />
          )}

          {slots.map((s) => (
            <SlotView
              key={s.id}
              slot={s}
              selected={s.id === selectedId}
              toX={timeToX}
              onMouseDown={onMouseDownSlot}
            />
          ))}

          <Playhead x={timeToX(currentTime)} onSeek={(t) => seek(t)} xToTime={xToTime} />
        </div>

        {/* Inspector */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-white/10 bg-[#1b1b24] p-3">
            <div className="text-xs font-semibold mb-2 opacity-80">Seçili Slot</div>
            {selected ? (
              <div className="space-y-2 text-sm">
                <FieldNumber
                  label="Başlangıç"
                  value={selected.start}
                  onChange={(v) => {
                    const vv = snap(v);
                    const end = Math.max(selected.end, vv + MIN_LEN);
                    updateSelected({
                      start: clamp(vv, 0, duration - MIN_LEN),
                      end: clamp(end, vv + MIN_LEN, duration),
                    });
                  }}
                />
                <FieldNumber
                  label="Bitiş"
                  value={selected.end}
                  onChange={(v) =>
                    updateSelected({
                      end: clamp(snap(v), selected.start + MIN_LEN, duration),
                    })
                  }
                />
                <FieldText
                  label="Etiket"
                  value={selected.label ?? ""}
                  onChange={(v) => updateSelected({ label: v })}
                  placeholder="örn. Replik 3"
                />
                <div className="flex items-center gap-2">
                  <label className="w-16 opacity-70 text-xs">Cast</label>
                  <CastEditor
                    value={selected.cast ?? []}
                    onChange={(next) => updateSelected({ cast: next })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="w-16 opacity-70 text-xs">Tür</label>
                  <select
                    className="bg-[#0f0f14] rounded px-2 py-1 border border-white/10 text-sm"
                    value={selected.kind ?? "dialogue"}
                    onChange={(e) => {
                      const k = e.target.value as Kind;
                      updateSelected({ kind: k, color: KIND_COLORS[k] });
                    }}
                  >
                    {PALETTE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="w-16 opacity-70 text-xs">Renk</label>
                  <input
                    type="color"
                    className="h-8 w-12 bg-transparent"
                    value={selected.color ?? "#7c4bd9"}
                    onChange={(e) => updateSelected({ color: e.target.value })}
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    className="px-3 py-1.5 rounded bg-red-500/90 hover:bg-red-500"
                    onClick={removeSelected}
                  >
                    Sil
                  </button>
                  <button
                    className="px-3 py-1.5 rounded bg-[#3a334a] hover:bg-[#4a405c]"
                    onClick={() => seek(selected.start)}
                  >
                    Başa Git
                  </button>
                  <button
                    className="px-3 py-1.5 rounded bg-[#3a334a] hover:bg-[#4a405c]"
                    onClick={() => seek(selected.end)}
                  >
                    Sona Git
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-[#bfb8d6]">
                Paletten bir öğeyi timeline'a sürükleyin veya boş alana basılı tutup sürükleyerek slot çizin.
              </div>
            )}
          </div>

          <div className="rounded-lg border border-white/10 bg-[#1b1b24] p-3">
            <div className="text-xs font-semibold mb-2 opacity-80">İpuçları</div>
            <ul className="text-xs text-[#bfb8d6] space-y-1 list-disc ml-4">
              <li>
                Paletten bir <b>cast</b> çipini sürükleyip timeline'a bırak: o cast ile yeni slot oluşur.
              </li>
              <li>
                Paletten bir <b>tür</b> (dialogue/music/...) sürükleyip var olan slot üzerine bırak: türü
                değiştirir.
              </li>
              <li>Boş alana basılı tutup sürükleyerek de slot çizebilirsin.</li>
              <li>Slotu ortasından sürükle: taşı. Kenarlardan: uzat/kısalt.</li>
              <li>Çift tık timeline: videoda o ana git. Klavye: ←/→, Shift ile 0.5s, Delete ile sil.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Import modal */}
      {importOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
          onMouseDown={() => setImportOpen(false)}
        >
          <div
            className="w-[680px] max-w-[92vw] bg-[#1b1b24] rounded-xl p-4 border border-white/10"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold mb-2">Bulk Import (JSON/CSV)</div>
            <textarea
              className="w-full h-60 bg-[#0f0f14] rounded p-2 border border-white/10 text-sm"
              placeholder='JSON array veya CSV: start,end,label,cast1|cast2,kind'
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            {error && <div className="text-red-400 text-xs mt-1">{error}</div>}
            <div className="mt-3 flex gap-2 justify-end">
              <button
                className="px-3 py-1.5 rounded bg-[#3a334a] hover:bg-[#4a405c]"
                onClick={() => setImportOpen(false)}
              >
                İptal
              </button>
              <button
                className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500"
                onClick={handleImport}
              >
                İçe Aktar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Grid({ duration, width }: { duration: number; width: number }) {
  const majorEvery = 5; // seconds
  const minorEvery = 1; // seconds

  const pxPerSec = duration > 0 ? width / duration : 0;
  const majors: number[] = [];
  const minors: number[] = [];
  for (let t = 0; t <= duration; t += minorEvery) minors.push(t);
  for (let t = 0; t <= duration; t += majorEvery) majors.push(t);

  return (
    <div className="absolute inset-0">
      {minors.map((t) => (
        <div
          key={`m${t}`}
          className="absolute top-0 bottom-0 border-r border-white/5"
          style={{ left: t * pxPerSec }}
        />
      ))}
      {majors.map((t) => (
        <div
          key={`M${t}`}
          className="absolute top-0 bottom-0 border-r border-white/20"
          style={{ left: t * pxPerSec }}
        />
      ))}
      <div className="absolute bottom-0 left-0 right-0 bg-white/5 h-6" />
      {majors.map((t) => (
        <div
          key={`L${t}`}
          className="absolute bottom-0 translate-y-[-2px] text-[10px] text-white/80"
          style={{ left: t * pxPerSec + 4 }}
        >
          {secondsToTime(t)}
        </div>
      ))}
    </div>
  );
}

function SlotView({
  slot,
  selected,
  toX,
  onMouseDown,
}: {
  slot: Slot;
  selected: boolean;
  toX: (t: number) => number;
  onMouseDown: (
    e: React.MouseEvent,
    slot: Slot,
    mode: "move" | "resize-l" | "resize-r"
  ) => void;
}) {
  const left = toX(slot.start);
  const right = toX(slot.end);
  const w = Math.max(2, right - left);
  const color = slot.color ?? (slot.kind ? KIND_COLORS[slot.kind] : "#7c4bd9");

  return (
    <div
      className={`absolute top-2 h-[80px] rounded-lg shadow ${
        selected ? "ring-2 ring-white/80" : "ring-1 ring-white/10"
      }`}
      style={{ left, width: w, background: color + "33", borderColor: color }}
      onMouseDown={(e) => onMouseDown(e, slot, "move")}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/10 hover:bg-white/20"
        onMouseDown={(e) => onMouseDown(e, slot, "resize-l")}
        title="Sola uzat/kısalt"
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/10 hover:bg-white/20"
        onMouseDown={(e) => onMouseDown(e, slot, "resize-r")}
        title="Sağa uzat/kısalt"
      />
      <div className="px-2 py-1 text-[11px] text-white/90 truncate">
        <div className="font-semibold truncate">{slot.label || slot.kind || "(Etiketsiz)"}</div>
        <div className="text-white/80 truncate">{slot.cast?.join(", ")}</div>
        <div className="text-white/70">
          {secondsToTime(slot.start)} – {secondsToTime(slot.end)}
        </div>
      </div>
    </div>
  );
}

function Playhead({
  x,
  onSeek,
  xToTime,
}: {
  x: number;
  onSeek: (t: number) => void;
  xToTime: (x: number) => number;
}) {
  return (
    <div
      className="absolute inset-0"
      onDoubleClick={(e) => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        onSeek(xToTime(mouseX));
      }}
    >
      <div
        className="absolute top-0 bottom-0 w-px bg-white left-0"
        style={{ transform: `translateX(${x}px)` }}
      />
      <div className="absolute top-0 left-0 right-0 h-full" />
    </div>
  );
}

function FieldNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-16 opacity-70 text-xs">{label}</label>
      <input
        type="number"
        step={SNAP}
        className="w-full bg-[#0f0f14] rounded px-2 py-1 border border-white/10"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function FieldText({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-16 opacity-70 text-xs">{label}</label>
      <input
        type="text"
        className="w-full bg-[#0f0f14] rounded px-2 py-1 border border-white/10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function CastEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [v, setV] = useState("");
  return (
    <div className="flex-1">
      <div className="flex flex-wrap gap-1 mb-1">
        {value.map((c, i) => (
          <span key={`${c}-${i}`} className="text-[11px] px-2 py-1 rounded-full bg-white/10">
            {c}
            <button
              className="ml-1 text-white/60 hover:text-white"
              title="Kaldır"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="İsim yaz ve Enter"
          className="flex-1 bg-[#0f0f14] rounded px-2 py-1 border border-white/10 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && v.trim()) {
              const setCast = new Set([...value, v.trim()]);
              onChange([...setCast]);
              setV("");
            }
          }}
        />
        <button
          className="px-3 py-1.5 rounded bg-[#3a334a] hover:bg-[#4a405c]"
          onClick={() => {
            if (!v.trim()) return;
            const setCast = new Set([...value, v.trim()]);
            onChange([...setCast]);
            setV("");
          }}
        >
          Ekle
        </button>
      </div>
    </div>
  );
}

const PALETTE_CAST = ["Hannah", "Mert", "Ayşe", "John", "SFX-Drone", "Crowd"] as const;
const PALETTE_KINDS: Kind[] = ["dialogue", "music", "sfx", "fx", "note"];
