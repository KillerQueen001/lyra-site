import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./AdminTimelinePanel.css";

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

/**
 * @typedef {Object} Slot
 * @property {string} id
 * @property {number} start
 * @property {number} end
 * @property {string} [label]
 * @property {string[]} [cast]
 * @property {string} [color]
 * @property {string} [kind]
 */

const KIND_NAMES = ["dialogue", "music", "sfx", "fx", "note"];

const KIND_COLORS = {
  dialogue: "#7c4bd9",
  music: "#5ad1b3",
  sfx: "#ffd166",
  fx: "#8ecae6",
  note: "#b598ff",
};

const SNAP = 0.05; // 50ms
const MIN_LEN = 0.1; // 100ms
const MIN_VIEW_WINDOW = 0.5;
const MIN_VERTICAL_SCALE = 0.6;
const MAX_VERTICAL_SCALE = 2.5;
const BASE_TRACK_HEIGHT = 170;
const BASE_SLOT_HEIGHT = 96;
const BASE_SLOT_TOP = 26;
const BASE_GRID_TOP = 18;
const BASE_GRID_BOTTOM = 32;
const BASE_GRID_FOOTER = 36;

const DEFAULT_CAST_PALETTE = [
  "Hannah",
  "Mert",
  "Ayşe",
  "John",
  "SFX-Drone",
  "Crowd",
];


const guid = () => Math.random().toString(36).slice(2, 10);

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const snap = (n, step = SNAP) => Math.round(n / step) * step;

const secondsToTime = (s) => {
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
};

const normalizeKind = (value) =>
  typeof value === "string" && KIND_NAMES.includes(value)
    ? value
    : "dialogue";

export default function AdminTimelinePanel({
  videoRef,
  initialSlots = [],
  onSave,
  castPalette = DEFAULT_CAST_PALETTE,
  kindPalette = KIND_NAMES,
  className = "",
}) {
  const paletteCast = useMemo(() => {
    const list = Array.isArray(castPalette) ? castPalette : DEFAULT_CAST_PALETTE;
    const filtered = list.filter((item) => typeof item === "string" && item.trim());
    if (!filtered.length) return DEFAULT_CAST_PALETTE;
    return Array.from(new Set(filtered));
  }, [castPalette]);

  const paletteKinds = useMemo(() => {
    const list = Array.isArray(kindPalette) ? kindPalette : KIND_NAMES;
    const filtered = list.filter((item) => typeof item === "string" && item.trim());
    if (!filtered.length) return KIND_NAMES;
    return Array.from(new Set(filtered.filter((k) => KIND_NAMES.includes(k))));
  }, [kindPalette]);

  const [slots, setSlots] = useState(() =>
    [...initialSlots].sort((a, b) => a.start - b.start)
  );
  const [selectedIds, setSelectedIds] = useState([]);
  const [primarySelectedId, setPrimarySelectedId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragStartSnapshot, setDragStartSnapshot] = useState(null);
  const timelineRef = useRef(null);
  const [width, setWidth] = useState(640);
  const [viewStart, setViewStart] = useState(0);
  const [viewDuration, setViewDuration] = useState(null);
  const [verticalScale, setVerticalScale] = useState(1);
  const [marquee, setMarquee] = useState({
    active: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });
  const selectionSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const videoEl = videoRef.current;
  const duration =
    videoEl && typeof videoEl.duration === "number" && !Number.isNaN(videoEl.duration)
      ? videoEl.duration
      : 0;
  const currentTime =
    videoEl && typeof videoEl.currentTime === "number" && !Number.isNaN(videoEl.currentTime)
      ? videoEl.currentTime
      : 0;

    const effectiveViewDuration = useMemo(() => {
    if (duration > 0) {
      return viewDuration && viewDuration > 0 ? viewDuration : duration;
    }
    return viewDuration && viewDuration > 0 ? viewDuration : 1;
  }, [duration, viewDuration]);

  const pxPerSec = useMemo(
    () => (effectiveViewDuration > 0 ? width / effectiveViewDuration : 0),
    [width, effectiveViewDuration]
  );

  const clearSelection = useCallback(() => {
    setSelectedIds((prev) => (prev.length ? [] : prev));
    setPrimarySelectedId(null);
  }, []);

  const selectIds = useCallback((ids, primary = null) => {
    const unique = Array.from(new Set(ids.filter((id) => typeof id === "string" && id)));
    setSelectedIds((prev) => {
      if (prev.length === unique.length && prev.every((id, index) => id === unique[index])) {
        return prev;
      }
      return unique;
    });
    setPrimarySelectedId((prevPrimary) => {
      if (primary && unique.includes(primary)) {
        return primary;
      }
      if (!unique.length) {
        return null;
      }
      const fallback = unique[unique.length - 1];
      return fallback === prevPrimary ? prevPrimary : fallback;
    });
  }, []);

  // DnD palet → timeline geçici önizleme
  const [dragCreate, setDragCreate] = useState({
    active: false,
    startX: 0,
    currentX: 0,
    meta: null,
  });

  // Bulk import UI
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    setSlots([...initialSlots].sort((a, b) => a.start - b.start));
    clearSelection();
  }, [initialSlots, clearSelection]);

  useEffect(() => {
    if (!duration || duration <= 0) return;
    setViewDuration((prev) => {
      const baseDuration = duration;
      const minWindow = Math.min(baseDuration, MIN_VIEW_WINDOW);
      const safeMin = minWindow > 0 ? minWindow : baseDuration;
      const current = prev && prev > 0 ? prev : baseDuration;
      const next = clamp(current, safeMin, baseDuration);
      setViewStart((prevStart) => clamp(prevStart, 0, Math.max(0, baseDuration - next)));
      return next;
    });
  }, [duration]);

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
    const onKey = (e) => {
      if (!selectedIds.length || !videoRef.current) return;
      if (e.target && e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) {
          return;
        }
      }

      const snapshots = selectedIds
        .map((id) => slots.find((slot) => slot.id === id))
        .filter(Boolean);
      if (!snapshots.length) return;
      const baseDuration = duration && duration > 0 ? duration : effectiveViewDuration;
      const fallbackDuration = snapshots.reduce((max, item) => Math.max(max, item.end), 0);
      const timelineDuration = baseDuration && baseDuration > 0 ? baseDuration : fallbackDuration;
      if (timelineDuration <= 0) return;

      const step = e.shiftKey ? 0.5 : 0.1;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const direction = e.key === "ArrowLeft" ? -1 : 1;
        const desiredDelta = direction * step;
        const minDelta = snapshots.reduce((acc, item) => Math.max(acc, -item.start), -Infinity);
        const maxDelta = snapshots.reduce(
          (acc, item) => Math.min(acc, timelineDuration - item.end),
          Infinity
        );
        const allowedDelta = clamp(desiredDelta, minDelta, maxDelta);
        if (!Number.isFinite(allowedDelta) || allowedDelta === 0) return;
        const map = new Map(snapshots.map((snap) => [snap.id, snap]));
        setSlots((prev) => {
          const next = prev.map((slot) => {
            const original = map.get(slot.id);
            if (!original) return slot;
            const len = original.end - original.start;
            const start = snap(
              clamp(original.start + allowedDelta, 0, Math.max(0, timelineDuration - len))
            );
            const end = snap(clamp(start + len, start + MIN_LEN, timelineDuration));
            return { ...slot, start, end };
          });
          return next.sort((a, b) => a.start - b.start);
        });
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        setSlots((prev) => prev.filter((slot) => !selectionSet.has(slot.id)));
        clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    selectedIds,
    slots,
    duration,
    effectiveViewDuration,
    videoRef,
    selectionSet,
    clearSelection,
  ]);

  function timeToX(t) {
    return (t - viewStart) * pxPerSec;
  }
  function xToTime(x) {
    return x / Math.max(1, pxPerSec) + viewStart;
  }

  function seek(t) {
    if (!videoRef.current) return;
    videoRef.current.currentTime = clamp(t, 0, duration || 0);
  }

  const onTimelineWheel = useCallback(
    (e) => {
      if (width <= 0) return;
      if (!(e.shiftKey || e.ctrlKey || e.altKey)) return;
      if (!duration && (e.shiftKey || e.ctrlKey)) return;

      if (typeof e.preventDefault === "function") e.preventDefault();
      if (typeof e.stopPropagation === "function") e.stopPropagation();

      if (e.shiftKey) {
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        const baseDuration = duration > 0 ? duration : effectiveViewDuration;
        const offset = (delta / Math.max(1, width)) * effectiveViewDuration;
        setViewStart((prev) => {
          const next = clamp(prev + offset, 0, Math.max(0, baseDuration - effectiveViewDuration));
          return Number.isFinite(next) ? next : prev;
        });
        return;
      }

      if (e.ctrlKey) {
        const rect = timelineRef.current?.getBoundingClientRect();
        const pointerRatio =
          rect && width > 0 ? clamp((e.clientX - rect.left) / width, 0, 1) : 0.5;
        const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        setViewDuration((prevDuration) => {
          const baseDuration = duration > 0 ? duration : prevDuration || effectiveViewDuration;
          const current = prevDuration && prevDuration > 0 ? prevDuration : effectiveViewDuration;
          const factor = Math.exp(delta * 0.0025);
          const minCandidate = Math.min(baseDuration, MIN_VIEW_WINDOW);
          const minWindow = minCandidate > 0 ? minCandidate : Math.min(current, baseDuration);
          const maxWindow = baseDuration || current || 1;
          const next = clamp(current * factor, minWindow, maxWindow);
          setViewStart((prevStart) => {
            const focusTime = (prevStart || 0) + current * pointerRatio;
            const desiredStart = focusTime - next * pointerRatio;
            const maxStartValue = Math.max(0, maxWindow - next);
            return clamp(desiredStart, 0, maxStartValue);
          });
          return next;
        });
        return;
      }

      if (e.altKey) {
        const factor = Math.exp(-e.deltaY * 0.0025);
        setVerticalScale((prev) => clamp(prev * factor, MIN_VERTICAL_SCALE, MAX_VERTICAL_SCALE));
      }
    },
    [
      width,
      duration,
      effectiveViewDuration,
      setViewStart,
      setViewDuration,
      setVerticalScale,
    ]
  );

  const trackNode = timelineRef.current;

  useEffect(() => {
    if (!trackNode) return undefined;
    const handler = (event) => onTimelineWheel(event);
    trackNode.addEventListener("wheel", handler, { passive: false });
    return () => {
      trackNode.removeEventListener("wheel", handler);
    };
  }, [trackNode, onTimelineWheel]);

  // === Palette DnD ===
  function onPaletteDragStart(e, meta) {
    e.dataTransfer.setData("application/x-slot", JSON.stringify(meta));
    e.dataTransfer.effectAllowed = "copy";
  }

  function onTimelineDragOver(e) {
    const dt = e.dataTransfer;
    if (!dt) return;
    const has = Array.from(dt.types).includes("application/x-slot");
    if (!has) return;
    e.preventDefault();
    const timelineEl = timelineRef.current;
    if (!timelineEl) return;
    const rect = timelineEl.getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, 0, width);

    setDragCreate((prev) => {
      const meta = prev.active && prev.meta ? prev.meta : parseMeta(dt);
      if (!meta) {
        return { active: false, startX: 0, currentX: 0, meta: null };
      }
      if (!prev.active) {
        return { active: true, startX: x, currentX: x + 30, meta };
      }
      return { ...prev, currentX: x };
    });
  }

  function parseMeta(dt) {
    try {
      const raw = dt.getData("application/x-slot");
      if (!raw) return null;
      const m = JSON.parse(raw);
      if (m && typeof m === "object") {
        return {
          cast: typeof m.cast === "string" ? m.cast : undefined,
          kind: typeof m.kind === "string" ? m.kind : undefined,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  function onTimelineDrop(e) {
    const dt = e.dataTransfer;
    if (!dt) return;
    const meta = parseMeta(dt);
    e.preventDefault();
    const timelineEl = timelineRef.current;
    if (!timelineEl) return;
    const rect = timelineEl.getBoundingClientRect();
    const dropX = clamp(e.clientX - rect.left, 0, width);
    const appliedMeta = dragCreate.active && dragCreate.meta ? dragCreate.meta : meta;

    if (!appliedMeta) {
      setDragCreate({ active: false, startX: 0, currentX: 0, meta: null });
      return;
    }

    setSlots((prev) => {
      const startX = dragCreate.active
        ? Math.min(dragCreate.startX, dragCreate.currentX)
        : dropX - 20;
      let endX = dragCreate.active
        ? Math.max(dragCreate.startX, dragCreate.currentX)
        : dropX + 40;
      if (endX - startX < 8) endX = startX + 8;

      const start = snap(clamp(xToTime(startX), 0, Math.max(0, duration - MIN_LEN)));
      const end = snap(clamp(xToTime(endX), start + MIN_LEN, duration));

      // mevcut slot üstüne bırakıldıysa -> cast ekle / tür güncelle
      const hitIdx = prev.findIndex((s) => timeToX(s.start) <= dropX && timeToX(s.end) >= dropX);
      if (hitIdx !== -1) {
        const next = [...prev];
        const s = { ...next[hitIdx] };
        if (appliedMeta.cast) {
          const existingCast = Array.isArray(s.cast) ? s.cast : [];
          const setCast = new Set([...existingCast, appliedMeta.cast]);
          s.cast = [...setCast];
        }
        if (appliedMeta.kind && KIND_NAMES.includes(appliedMeta.kind)) {
          s.kind = appliedMeta.kind;
          s.color = KIND_COLORS[appliedMeta.kind];
        }
        next[hitIdx] = s;
        return next;
      }

      const newSlot = {
        id: guid(),
        start,
        end,
        label: appliedMeta.cast
          ? `${appliedMeta.cast}`
          : appliedMeta.kind
          ? appliedMeta.kind
          : "",
        cast: appliedMeta.cast ? [appliedMeta.cast] : [],
        kind: appliedMeta.kind,
        color:
          appliedMeta.kind && KIND_NAMES.includes(appliedMeta.kind)
            ? KIND_COLORS[appliedMeta.kind]
            : pickColor(),
      };
      return [...prev, newSlot].sort((a, b) => a.start - b.start);
    });

    setDragCreate({ active: false, startX: 0, currentX: 0, meta: null });

  }

  function onTimelineDragLeave() {
    setDragCreate({ active: false, startX: 0, currentX: 0, meta: null });
  }

  function addFromCurrent(seconds = 2) {
    const video = videoRef.current;
    const t = video && typeof video.currentTime === "number" && !Number.isNaN(video.currentTime)
      ? video.currentTime
      : 0;
    const start = snap(clamp(t, 0, Math.max(0, duration - MIN_LEN)));
    const end = snap(clamp(t + seconds, start + MIN_LEN, duration));
    const newSlot = {
      id: guid(),
      start,
      end,
      label: "",
      cast: [],
      color: pickColor(),
      kind: "dialogue",
    };
    setSlots((prev) => [...prev, newSlot].sort((a, b) => a.start - b.start));
    selectIds([newSlot.id], newSlot.id);
  }

  function duplicateSelected() {
    if (!primarySelectedId) return;
    const s = slots.find((x) => x.id === primarySelectedId);
    if (!s) return;
    const len = s.end - s.start;
    const start = snap(clamp(s.end + 0.05, 0, Math.max(0, duration - len)));
    const end = snap(clamp(start + len, start + MIN_LEN, duration));
    const newSlot = { ...s, id: guid(), start, end };
    setSlots((prev) => [...prev, newSlot].sort((a, b) => a.start - b.start));
    selectIds([newSlot.id], newSlot.id);
  }

  // Drag logic (slot move/resize)
  function onMouseDownSlot(e, slot, mode) {
    e.stopPropagation();
    if (e.button !== 0) return;
    const timelineEl = timelineRef.current;
    if (!timelineEl) return;
    const rect = timelineEl.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const offsetWithin = mouseX - timeToX(slot.start);
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    let activeSelection = selectedIds;
    if (additive) {
      const merged = Array.from(new Set([...selectedIds, slot.id]));
      activeSelection = merged;
      selectIds(merged, slot.id);
    } else if (!selectionSet.has(slot.id)) {
      activeSelection = [slot.id];
      selectIds(activeSelection, slot.id);
    }

    const snapshots = activeSelection
      .map((id) => slots.find((s) => s.id === id))
      .filter(Boolean)
      .map((s) => ({ id: s.id, start: s.start, end: s.end }));

    if (!snapshots.length) {
      snapshots.push({ id: slot.id, start: slot.start, end: slot.end });
      selectIds([slot.id], slot.id);
    }

    setIsDragging(true);
    setDragMode(mode);
    setDragOffset(offsetWithin);
    setDragStartSnapshot({
      slots: snapshots,
      primaryId: slot.id,
    });
  }

  function onMouseDownBlank(e) {
    if (e.button !== 0) return;
    if (e.target !== e.currentTarget) return;
    const timelineEl = timelineRef.current;
    if (!timelineEl) return;
    const rect = timelineEl.getBoundingClientRect();
    const startX = clamp(e.clientX - rect.left, 0, width);
    const startY = clamp(e.clientY - rect.top, 0, rect.height);
    setMarquee({ active: true, startX, startY, currentX: startX, currentY: startY });
    clearSelection();
  }

  function onMouseMove(e) {
    const timelineEl = timelineRef.current;
    if (!timelineEl) return;
    const rect = timelineEl.getBoundingClientRect();
    const mouseX = clamp(e.clientX - rect.left, 0, width);
    const mouseY = clamp(e.clientY - rect.top, 0, rect.height);

    if (isDragging && dragMode) {
      e.preventDefault();
    }

    if (marquee.active) {
      setMarquee((prev) => {
        const nextState = { ...prev, currentX: mouseX, currentY: mouseY };
        const minX = Math.min(nextState.startX, nextState.currentX);
        const maxX = Math.max(nextState.startX, nextState.currentX);
        const minY = Math.min(nextState.startY, nextState.currentY);
        const maxY = Math.max(nextState.startY, nextState.currentY);
        const slotTop = BASE_SLOT_TOP * verticalScale;
        const slotBottom = slotTop + BASE_SLOT_HEIGHT * verticalScale;
        if (maxY >= slotTop && minY <= slotBottom) {
          const hits = slots
            .filter((slot) => {
              const left = timeToX(slot.start);
              const right = timeToX(slot.end);
              return right >= minX && left <= maxX;
            })
            .map((slot) => slot.id);
          selectIds(hits, hits.length ? hits[hits.length - 1] : null);
        } else {
          clearSelection();
        }
        return nextState;
      });
      e.preventDefault();
      return;
    }

    if (!isDragging || !dragMode || !dragStartSnapshot) return;

    const snapshots = Array.isArray(dragStartSnapshot.slots)
      ? dragStartSnapshot.slots
      : [];
    if (!snapshots.length) return;
    const baseDuration = duration && duration > 0 ? duration : effectiveViewDuration;
    const fallbackDuration = snapshots.reduce((max, item) => Math.max(max, item.end), 0);
    const timelineDuration = baseDuration && baseDuration > 0 ? baseDuration : fallbackDuration;
    if (timelineDuration <= 0) return;

    if (dragMode === "move") {
      const primary =
        snapshots.find((snap) => snap.id === dragStartSnapshot.primaryId) || snapshots[0];
      if (!primary) return;
      const len = primary.end - primary.start;
      const target = clamp(
        xToTime(mouseX - dragOffset),
        0,
        Math.max(0, timelineDuration - len)
      );
      const desiredDelta = target - primary.start;
      const minDelta = snapshots.reduce((acc, item) => Math.max(acc, -item.start), -Infinity);
      const maxDelta = snapshots.reduce(
        (acc, item) => Math.min(acc, timelineDuration - item.end),
        Infinity
      );
      const allowedDelta = clamp(desiredDelta, minDelta, maxDelta);
      if (!Number.isFinite(allowedDelta) || allowedDelta === 0) return;
      const map = new Map(snapshots.map((snap) => [snap.id, snap]));
      setSlots((prev) => {
        const next = prev.map((slot) => {
          const original = map.get(slot.id);
          if (!original) return slot;
          const lenSnap = original.end - original.start;
          const start = snap(
            clamp(original.start + allowedDelta, 0, Math.max(0, timelineDuration - lenSnap))
          );
          const end = snap(clamp(start + lenSnap, start + MIN_LEN, timelineDuration));
          return { ...slot, start, end };
        });
        return next.sort((a, b) => a.start - b.start);
      });
      return;
    }

    const map = new Map(snapshots.map((snap) => [snap.id, snap]));
    const primary = map.get(dragStartSnapshot.primaryId);
    if (!primary) return;
    const idx = slots.findIndex((s) => s.id === primary.id);
    if (idx === -1) return;

    setSlots((prev) => {
      const next = [...prev];
      const current = { ...next[idx] };
      if (dragMode === "resize-l") {
        const t = snap(clamp(xToTime(mouseX), 0, current.end - MIN_LEN));
        current.start = clamp(t, 0, current.end - MIN_LEN);
      } else if (dragMode === "resize-r") {
        const t = snap(clamp(xToTime(mouseX), current.start + MIN_LEN, timelineDuration));
        current.end = clamp(t, current.start + MIN_LEN, timelineDuration);
      }
      next[idx] = current;
      return next.sort((a, b) => a.start - b.start);
    });
  }

  function onMouseUp() {
    if (marquee.active) {
      setMarquee((prev) => ({ ...prev, active: false }));
    }
    if (!isDragging) return;
    setIsDragging(false);
    setDragMode(null);
    setDragStartSnapshot(null);
  }

  function removeSelected() {
    if (!selectedIds.length) return;
    setSlots((prev) => prev.filter((s) => !selectionSet.has(s.id)));
    clearSelection();
  }

  function updateSelected(patch) {
    if (!primarySelectedId) return;
    setSlots((prev) => {
      const idx = prev.findIndex((s) => s.id === primarySelectedId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

  // Bulk import
  function normalizeCast(value) {
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean);
    }
    if (typeof value === "string") {
      return value
        .split(/[;,|/]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  function tryParseBulk(text) {
    setError(null);

    const tryJson = () => {
      try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) return null;
        return parsed
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const raw = item;
            const kind = normalizeKind(raw.kind);
            const hasKind = typeof raw.kind === "string" && KIND_NAMES.includes(raw.kind);
            const cast = normalizeCast(raw.cast);
            const color =
              typeof raw.color === "string" && raw.color
                ? raw.color
                : hasKind
                ? KIND_COLORS[kind]
                : pickColor();
            const safeStart = raw.start == null ? 0 : raw.start;
            const safeEnd = raw.end == null ? 0 : raw.end;
            const safeLabel = typeof raw.label === "string" ? raw.label : "";
            return {
              id: typeof raw.id === "string" && raw.id ? raw.id : guid(),
              start: Number(safeStart),
              end: Number(safeEnd),
              label: safeLabel,
              cast,
              kind,
              color,
            };
          })
          .filter(Boolean);
      } catch {
        return null;
      }
    };

    const tryCsv = () => {
      try {
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        if (!lines.length) return null;
        const rows = lines.map((line) =>
          line.split(/,(?![^"]*")/).map((cell) => cell.replace(/"/g, "").trim())
        );
        const hasHeader = rows[0][0].toLowerCase().includes("start");
        const dataRows = hasHeader ? rows.slice(1) : rows;
        return dataRows.map((cols) => {
          const rawStart = cols[0];
          const rawEnd = cols[1];
          const start = Number(rawStart == null || rawStart === "" ? 0 : rawStart);
          const end = Number(rawEnd == null || rawEnd === "" ? Math.max(0, start + 1) : rawEnd);
          const label = cols[2] == null ? "" : cols[2];
          const cast = normalizeCast(cols[3] == null ? "" : cols[3]);
          const kindRaw = cols[4];
          const kind = normalizeKind(kindRaw == null ? "dialogue" : kindRaw);
          const hasKind = typeof kindRaw === "string" && KIND_NAMES.includes(kindRaw);
          return {
            id: guid(),
            start,
            end,
            label,
            cast,
            kind,
            color: hasKind ? KIND_COLORS[kind] : pickColor(),
          };
        });
      } catch {
        return null;
      }
    };

    const jsonResult = tryJson();
    if (jsonResult && jsonResult.length) {
      return jsonResult;
    }

    const csvResult = tryCsv();
    if (csvResult && csvResult.length) {
      return csvResult;
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

  const selected = slots.find((s) => s.id === primarySelectedId) || null;
  const formattedCurrent = secondsToTime(currentTime);
  const formattedDuration = secondsToTime(duration);
  const selectedCastNames = (() => {
    if (selected && Array.isArray(selected.cast) && selected.cast.length) {
      return selected.cast.join(" — ");
    }
    if (selectedIds.length > 1) {
      return `${selectedIds.length} cast bloğu seçildi`;
    }
    return "Cast seçilmedi";
  })();
  const selectedSummary = (() => {
    if (selectedIds.length > 1) {
      return "Birden fazla slot seçildi";
    }
    if (selected) {
      if (selected.label && selected.label.trim()) return selected.label;
      if (selected.kind) return `Tür: ${selected.kind}`;
      return "Etiket ekleyin";
    }
    return "Slot seçilmedi";
  })();
  const panelClassName = ["timeline-panel", className].filter(Boolean).join(" ");
  const playheadX = clamp(timeToX(currentTime), 0, width);
  const trackStyle = {
    height: `${BASE_TRACK_HEIGHT * verticalScale}px`,
    "--timeline-track-height": `${BASE_TRACK_HEIGHT * verticalScale}px`,
    "--timeline-slot-height": `${BASE_SLOT_HEIGHT * verticalScale}px`,
    "--timeline-slot-top": `${BASE_SLOT_TOP * verticalScale}px`,
    "--timeline-grid-top": `${BASE_GRID_TOP * verticalScale}px`,
    "--timeline-grid-bottom": `${BASE_GRID_BOTTOM * verticalScale}px`,
    "--timeline-grid-footer-height": `${BASE_GRID_FOOTER * verticalScale}px`,
  };

  // === UI ===
  return (
    <div className={panelClassName}>
      <div className="timeline-toolbar">
        <div className="timeline-toolbar-info">
          <div className="timeline-toolbar-title">{selectedCastNames}</div>
          <div className="timeline-toolbar-subtitle">{selectedSummary}</div>
        </div>
        <div className="timeline-toolbar-time">
          <span className="timeline-time-current">{formattedCurrent}</span>
          <span className="timeline-time-divider">/</span>
          <span className="timeline-time-total">{formattedDuration}</span>
        </div>
        <div className="timeline-toolbar-actions">
          <button
            type="button"
            className="timeline-action timeline-action--ghost"
            onClick={() => addFromCurrent(2)}
          >
            +2s
          </button>
          <button
            type="button"
            className="timeline-action timeline-action--danger"
            onClick={removeSelected}
            disabled={!selectedIds.length}
          >
            Sil
          </button>
          <button
            type="button"
            className="timeline-action timeline-action--primary"
            onClick={() => {
              if (typeof onSave === "function") {
                onSave(slots);
              }
            }}
          >
            Kaydet
          </button>
        </div>
      </div>

      <div
        ref={timelineRef}
        className="timeline-track"
        onMouseDown={onMouseDownBlank}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onDragOver={onTimelineDragOver}
        onDrop={onTimelineDrop}
        onDragLeave={onTimelineDragLeave}
        style={trackStyle}
      >
        <Grid
          duration={duration}
          width={width}
          viewStart={viewStart}
          viewDuration={effectiveViewDuration}
        />

        {dragCreate.active && (
          <div
            className="timeline-slot-preview"
            style={{
              left: Math.min(dragCreate.startX, dragCreate.currentX),
              width: Math.max(6, Math.abs(dragCreate.currentX - dragCreate.startX)),
              borderColor:
                dragCreate.meta && dragCreate.meta.kind
                  ? KIND_COLORS[dragCreate.meta.kind]
                  : "#c3c0f5",
            }}
          />
        )}

        {marquee.active && (
          <div
            className="timeline-marquee"
            style={{
              left: Math.min(marquee.startX, marquee.currentX),
              width: Math.max(0, Math.abs(marquee.currentX - marquee.startX)),
              top: Math.min(marquee.startY, marquee.currentY),
              height: Math.max(0, Math.abs(marquee.currentY - marquee.startY)),
            }}
          />
        )}

        {slots.map((s) => (
          <SlotView
            key={s.id}
            slot={s}
            selected={selectionSet.has(s.id)}
            toX={timeToX}
            onMouseDown={onMouseDownSlot}
          />
        ))}

        <Playhead x={playheadX} onSeek={seek} xToTime={xToTime} />
      </div>

      <div className="timeline-secondary-row">
        <div className="timeline-palette">
          <div className="timeline-panel-heading">Cast Paleti</div>
          <div className="timeline-chip-collection">
            {paletteCast.map((c) => (
              <button
                key={c}
                type="button"
                draggable
                onDragStart={(e) => onPaletteDragStart(e, { cast: c })}
                className="timeline-chip"
                title="Sürükleyip timeline'a bırak"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="timeline-palette">
          <div className="timeline-panel-heading">Türler</div>
          <div className="timeline-chip-collection">
            {paletteKinds.map((k) => (
              <button
                key={k}
                type="button"
                draggable
                onDragStart={(e) => onPaletteDragStart(e, { kind: k })}
                className="timeline-chip timeline-chip--kind"
                style={{ backgroundColor: `${KIND_COLORS[k]}24`, borderColor: `${KIND_COLORS[k]}55` }}
                title="Sürükleyip timeline'a bırak"
              >
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="timeline-secondary-actions">
          <div className="timeline-panel-heading">Hızlı İşlemler</div>
          <div className="timeline-secondary-buttons">
            <button
              type="button"
              className="timeline-secondary-button"
              onClick={() => addFromCurrent(2)}
            >
              Şu an +2s
            </button>
            <button
              type="button"
              className="timeline-secondary-button"
              onClick={duplicateSelected}
              disabled={!primarySelectedId}
            >
              Kopyala
            </button>
            <button
              type="button"
              className="timeline-secondary-button"
              onClick={() => setImportOpen(true)}
            >
              İçe Aktar
            </button>
            <button
              type="button"
              className="timeline-secondary-button"
              onClick={handleExport}
            >
              Dışa Aktar
            </button>
          </div>
        </div>
      </div>

      <div className="timeline-details-row">
        <div className="timeline-selection-panel">
          <div className="timeline-panel-heading">Seçili Slot</div>
          {selected && selectedIds.length === 1 ? (
            <div className="timeline-selection-fields">
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
                value={selected.label == null ? "" : selected.label}
                onChange={(v) => updateSelected({ label: v })}
                placeholder="örn. Replik 3"
              />
              <div className="timeline-field">
                <label className="timeline-field-label">Cast</label>
                <CastEditor
                  value={Array.isArray(selected.cast) ? selected.cast : []}
                  onChange={(next) => updateSelected({ cast: next })}
                  suggestions={paletteCast}
                />
              </div>
              <div className="timeline-field">
                <label className="timeline-field-label">Tür</label>
                <select
                  className="timeline-select"
                  value={selected.kind == null || selected.kind === "" ? "dialogue" : selected.kind}
                  onChange={(e) => {
                    const k = normalizeKind(e.target.value);
                    updateSelected({ kind: k, color: KIND_COLORS[k] });
                  }}
                >
                  {paletteKinds.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div className="timeline-field">
                <label className="timeline-field-label">Renk</label>
                <input
                  type="color"
                  className="timeline-color"
                  value={selected.color == null || selected.color === "" ? "#7c4bd9" : selected.color}
                  onChange={(e) => updateSelected({ color: e.target.value })}
                />
              </div>
              <div className="timeline-selection-actions">
                <button
                  type="button"
                  className="timeline-secondary-button timeline-secondary-button--danger"
                  onClick={removeSelected}
                >
                  Sil
                </button>
                <button
                  type="button"
                  className="timeline-secondary-button"
                  onClick={() => seek(selected.start)}
                >
                  Başa Git
                </button>
                <button
                  type="button"
                  className="timeline-secondary-button"
                  onClick={() => seek(selected.end)}
                >
                  Sona Git
                </button>
              </div>
            </div>
          ) : selectedIds.length > 1 ? (
            <div className="timeline-selection-empty timeline-selection-multi">
              {selectedIds.length} slot seçildi. Hepsini sürükleyerek taşıyabilir, düzenlemek için tek bir slot seçebilirsiniz.
            </div>
          ) : (
            <div className="timeline-selection-empty">
              Paletten bir öğe sürükleyerek veya boş alana tıklayıp sürükleyerek yeni bir slot oluşturun.
            </div>
          )}
        </div>
        <div className="timeline-tips">
          <div className="timeline-panel-heading">İpuçları</div>
          <ul>
            <li>Cast çiplerini sürükleyerek hızlıca yeni slotlar açabilirsiniz.</li>
            <li>Tür çiplerini mevcut slotların üzerine bırakarak diyalog/müzik/sfx etiketlerini anında değiştirin.</li>
            <li>Boş alanda sürükleyerek serbest uzunlukta yeni slot çizebilirsiniz.</li>
            <li>Klavyeden ←/→ ile 0.1s, Shift ile 0.5s adımlayarak hassas ayar yapın.</li>
            <li>JSON veya CSV içe aktarımıyla harici kayıtları zaman çizelgesine yükleyin.</li>
          </ul>
        </div>
      </div>

      {importOpen && (
        <div className="timeline-modal-backdrop" onMouseDown={() => setImportOpen(false)}>
          <div className="timeline-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="timeline-modal-title">Bulk Import (JSON/CSV)</div>
            <textarea
              className="timeline-textarea"
              placeholder='JSON array veya CSV: start,end,label,cast1|cast2,kind'
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            {error && <div className="timeline-error">{error}</div>}
            <div className="timeline-modal-actions">
              <button
                type="button"
                className="timeline-secondary-button"
                onClick={() => setImportOpen(false)}
              >
                İptal
              </button>
              <button
                type="button"
                className="timeline-action timeline-action--primary"
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

function Grid({ duration, width, viewStart, viewDuration }) {
  const pxPerSec = viewDuration > 0 ? width / viewDuration : 0;
  const start = Math.max(0, viewStart);
  const totalDuration = duration > 0 ? duration : viewDuration;
  const end = Math.min(totalDuration, start + viewDuration);
  const safeSpan = Math.max(viewDuration, 0.1);

  const baseSteps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 30, 60, 120, 300];
  const targetSpacing = 80;
  const majorStep =
    baseSteps.find((step) => step * pxPerSec >= targetSpacing) || baseSteps[baseSteps.length - 1];
  const minorStep = Math.max(majorStep / 5, SNAP);

  const minorLines = [];
  const majorLines = [];
  const labels = [];

  if (safeSpan > 0 && pxPerSec > 0) {
    const firstMinor = Math.floor(start / minorStep) * minorStep;
    for (let t = firstMinor, count = 0; t <= end + minorStep && count < 800; t += minorStep, count += 1) {
      if (t < 0) continue;
      minorLines.push(t);
    }
    const firstMajor = Math.floor(start / majorStep) * majorStep;
    for (let t = firstMajor, count = 0; t <= end + majorStep && count < 400; t += majorStep, count += 1) {
      if (t < 0) continue;
      majorLines.push(t);
      labels.push(t);
    }
  }

  return (
    <div className="timeline-grid">
      {minorLines.map((t) => (
        <div
          key={`m${t}`}
          className="timeline-grid-line timeline-grid-line--minor"
          style={{ left: (t - viewStart) * pxPerSec }}
        />
      ))}
      {majorLines.map((t) => (
        <div
          key={`M${t}`}
          className="timeline-grid-line timeline-grid-line--major"
          style={{ left: (t - viewStart) * pxPerSec }}
        />
      ))}
      <div className="timeline-grid-footer" />
      {labels.map((t) => (
        <div
          key={`L${t}`}
          className="timeline-grid-label"
          style={{ left: (t - viewStart) * pxPerSec + 6 }}
        >
          {secondsToTime(t)}
        </div>
      ))}
    </div>
  );
}

/**
 * @param {{slot: Slot, selected: boolean, toX: (t: number) => number, onMouseDown: (e: MouseEvent, slot: Slot, mode: "move" | "resize-l" | "resize-r") => void}} props
 */
function SlotView({ slot, selected, toX, onMouseDown }) {
  const left = toX(slot.start);
  const right = toX(slot.end);
  const w = Math.max(2, right - left);
  const color =
    slot.color && slot.color !== ""
      ? slot.color
      : slot.kind && KIND_COLORS[slot.kind]
      ? KIND_COLORS[slot.kind]
      : "#7c4bd9";

  return (
    <div
      className={`timeline-slot${selected ? " is-selected" : ""}`}
      style={{ left, width: w, backgroundColor: `${color}33`, borderColor: color }}
      onMouseDown={(e) => onMouseDown(e, slot, "move")}
    >
      <div
        className="timeline-slot-handle timeline-slot-handle--left"
        onMouseDown={(e) => onMouseDown(e, slot, "resize-l")}
        title="Sola uzat/kısalt"
      />
      <div
        className="timeline-slot-handle timeline-slot-handle--right"
        onMouseDown={(e) => onMouseDown(e, slot, "resize-r")}
        title="Sağa uzat/kısalt"
      />
      <div className="timeline-slot-content">
        <div className="timeline-slot-title">{slot.label || slot.kind || "(Etiketsiz)"}</div>
        <div className="timeline-slot-cast">{Array.isArray(slot.cast) ? slot.cast.join(", ") : ""}</div>
        <div className="timeline-slot-time">
          {secondsToTime(slot.start)} – {secondsToTime(slot.end)}
        </div>
      </div>
    </div>
  );
}

function Playhead({ x, onSeek, xToTime }) {
  return (
    <div
      className="timeline-playhead"
      onDoubleClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        onSeek(xToTime(mouseX));
      }}
    >
      <div className="timeline-playhead-line" style={{ transform: `translateX(${x}px)` }} />
      <div className="timeline-playhead-cap" style={{ transform: `translateX(${x}px)` }} />
    </div>
  );
}

function FieldNumber({ label, value, onChange }) {
  return (
    <div className="timeline-field">
      <label className="timeline-field-label">{label}</label>
      <input
        type="number"
        step={SNAP}
        className="timeline-input"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function FieldText({ label, value, onChange, placeholder }) {
  return (
    <div className="timeline-field">
      <label className="timeline-field-label">{label}</label>
      <input
        type="text"
        className="timeline-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function CastEditor({ value, onChange }) {
  const [v, setV] = useState("");
  return (
    <div className="timeline-cast-editor">
      <div className="timeline-cast-selected">
        {value.map((c, i) => (
          <span key={`${c}-${i}`} className="timeline-cast-chip">
            {c}
            <button
              type="button"
              className="timeline-chip-remove"
              title="Kaldır"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="timeline-cast-input-row">
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="İsim yaz ve Enter"
          className="timeline-input"
          onKeyDown={(e) => {
            if (e.key === "Enter" && v.trim()) {
              const setCast = new Set([...value, v.trim()]);
              onChange([...setCast]);
              setV("");
            }
          }}
        />
        <button
          type="button"
          className="timeline-secondary-button timeline-secondary-button--solid"
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