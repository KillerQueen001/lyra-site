const STORAGE_KEY = "lyra.timeline.v1";

function safeLocalStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (error) {
    console.warn("localStorage erişilemiyor:", error);
    return null;
  }
}

function readStore() {
  const storage = safeLocalStorage();
  if (!storage) return { videos: {} };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { videos: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { videos: {} };
    if (!parsed.videos || typeof parsed.videos !== "object") {
      return { videos: {} };
    }
    return { videos: { ...parsed.videos } };
  } catch (error) {
    console.warn("timelineLocal parse hatası:", error);
    return { videos: {} };
  }
}

function writeStore(store) {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.warn("timelineLocal yazma hatası:", error);
  }
}

export function loadVideoTimeline(videoId) {
  if (!videoId) return null;
  const store = readStore();
  const entry = store.videos[videoId];
  if (!entry) return null;
  const slots = Array.isArray(entry.slots) ? entry.slots : [];
  const castLibrary = Array.isArray(entry.castLibrary) ? entry.castLibrary : [];
  return {
    slots: slots.map((slot) => ({ ...slot })),
    castLibrary: castLibrary.map((cast) => ({ ...cast })),
    updatedAt: entry.updatedAt || null,
  };
}

export function saveVideoTimeline(videoId, payload) {
  if (!videoId) return null;
  const store = readStore();
  const nextEntry = {
    slots: Array.isArray(payload?.slots) ? payload.slots : [],
    castLibrary: Array.isArray(payload?.castLibrary) ? payload.castLibrary : [],
    updatedAt: new Date().toISOString(),
  };
  store.videos[videoId] = nextEntry;
  writeStore(store);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("lyra:timeline-updated", { detail: { videoId } })
    );
  }
  return loadVideoTimeline(videoId);
}

export function listTimelineVideos() {
  const store = readStore();
  return Object.entries(store.videos).map(([videoId, entry]) => ({
    videoId,
    slots: Array.isArray(entry.slots) ? entry.slots.length : 0,
    updatedAt: entry.updatedAt || null,
  }));
}

function slugify(value) {
  return `${value || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "cast";
}

function normalizeCastMeta(meta, fallbackName) {
  if (!meta || typeof meta !== "object") {
    return {
      id: slugify(fallbackName),
      name: fallbackName,
      role: "Cast",
      photo: null,
    };
  }
  const id = meta.id || slugify(meta.name || fallbackName);
  return {
    id,
    name: meta.name || fallbackName,
    role: meta.role || meta.description || "Cast",
    photo: meta.photo || null,
  };
}

export function buildCastListFromTimeline(videoId, fallbackCast = []) {
  const entry = loadVideoTimeline(videoId);
  if (!entry) return null;
  const castByName = new Map();
  for (const cast of entry.castLibrary || []) {
    if (!cast || typeof cast !== "object") continue;
    if (cast.name) castByName.set(cast.name, normalizeCastMeta(cast, cast.name));
    if (cast.id) castByName.set(cast.id, normalizeCastMeta(cast, cast.name || cast.id));
  }
  const fallbackByName = new Map();
  for (const cast of fallbackCast) {
    if (!cast || typeof cast !== "object") continue;
    fallbackByName.set(cast.name, normalizeCastMeta(cast, cast.name));
    fallbackByName.set(cast.id, normalizeCastMeta(cast, cast.name || cast.id));
  }
  const aggregated = new Map();
  for (const slot of entry.slots || []) {
    if (!slot || typeof slot !== "object") continue;
    if (!Array.isArray(slot.cast)) continue;
    const start = Number(slot.start) || 0;
    const end = Number(slot.end) || 0;
    if (end <= start) continue;
    for (const castName of slot.cast) {
      if (!castName) continue;
      const baseMeta =
        castByName.get(castName) ||
        fallbackByName.get(castName) ||
        normalizeCastMeta(null, castName);
      const key = baseMeta.id;
      if (!aggregated.has(key)) {
        aggregated.set(key, { ...baseMeta, slots: [] });
      }
      aggregated.get(key).slots.push({ start, end });
    }
  }

  return {
    items: Array.from(aggregated.values()),
    castLibrary: entry.castLibrary || [],
    slots: entry.slots || [],
    updatedAt: entry.updatedAt || null,
  };
}