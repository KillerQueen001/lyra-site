// basit per-video/per-cast storage

export type Range = { start: number; end: number };

const keyOf = (videoId: string, castId: string) => `${videoId}[${castId}]`;

export function saveCastSlots(videoId: string, castId: string, slots: Range[]) {
  localStorage.setItem(keyOf(videoId, castId), JSON.stringify(slots));
}

export function loadCastSlots(videoId: string, castId: string): Range[] | null {
  const raw = localStorage.getItem(keyOf(videoId, castId));
  if (!raw) return null;
  try { return JSON.parse(raw) as Range[]; } catch { return null; }
}

/** Base (xrayDemo) üstüne override uygula */
export function applyOverrides<T extends { id: string; slots?: Range[] }>(
  videoId: string,
  items: T[]
): T[] {
  return items.map((it) => {
    const over = loadCastSlots(videoId, it.id);
    return over ? { ...it, slots: over } : it;
  });
}
