// basit per-video/per-cast storage

const keyOf = (videoId, castId) => `${videoId}[${castId}]`;

export function saveCastSlots(videoId, castId, slots) {
  localStorage.setItem(keyOf(videoId, castId), JSON.stringify(slots));
}

export function loadCastSlots(videoId, castId) {
  const raw = localStorage.getItem(keyOf(videoId, castId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Base (xrayDemo) üstüne override uygula */
export function applyOverrides(videoId, items) {
  return items.map((it) => {
    const over = loadCastSlots(videoId, it.id);
    return over ? { ...it, slots: over } : it;
  });
}