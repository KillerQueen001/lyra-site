import {
  fetchTimelineFromFile,
  listTimelinesFromFile,
  persistTimelineToFile,
} from "./timelineFileStore";

const STORAGE_KEY = "lyra.timeline.v1";

const REMOTE_SYNC_EVENT = "lyra:timeline-remote-sync";
export const TIMELINE_REMOTE_SYNC_EVENT = REMOTE_SYNC_EVENT;

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

function dispatchTimelineEvent(videoId, payload = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("lyra:timeline-updated", {
      detail: { videoId, ...payload },
    })
  );
  if (payload.source === "remote") {
    window.dispatchEvent(
      new CustomEvent(REMOTE_SYNC_EVENT, {
        detail: { videoId, ...payload },
      })
    );
  }
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return {
      slots: [],
      castLibrary: [],
      updatedAt: new Date().toISOString(),
    };
  }
  const slots = Array.isArray(entry.slots) ? entry.slots : [];
  const castLibrary = Array.isArray(entry.castLibrary)
    ? entry.castLibrary
    : [];
  const updatedAt = entry.updatedAt || new Date().toISOString();
  return { slots, castLibrary, updatedAt };
}

function applyRemoteSnapshot(videoId, snapshot) {
  if (!videoId || !snapshot) return null;
  const normalized = normalizeEntry(snapshot);
  const store = readStore();
  store.videos[videoId] = normalized;
  writeStore(store);
  dispatchTimelineEvent(videoId, {
    source: "remote",
    updatedAt: normalized.updatedAt,
  });
  return loadVideoTimeline(videoId);
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
  const nextEntry = normalizeEntry(payload);
  store.videos[videoId] = nextEntry;
  writeStore(store);
  dispatchTimelineEvent(videoId, {
    source: "local",
    updatedAt: nextEntry.updatedAt,
  });
  if (typeof window !== "undefined") {
    persistTimelineToFile(videoId, nextEntry).then((result) => {
      if (result?.ok && result.data) {
        applyRemoteSnapshot(videoId, result.data);
      } else if (result?.downloaded) {
        dispatchTimelineEvent(videoId, {
          source: "download",
          updatedAt: nextEntry.updatedAt,
        });
      }
    });
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

export async function syncVideoTimeline(videoId) {
  if (!videoId) return null;
  const snapshot = await fetchTimelineFromFile(videoId);
  if (!snapshot) return null;
  return applyRemoteSnapshot(videoId, snapshot);
}

export async function syncAllVideoTimelines() {
  const remoteList = await listTimelinesFromFile();
  if (!remoteList || !Array.isArray(remoteList)) return null;
  const store = readStore();
  for (const item of remoteList) {
    if (!item || !item.videoId) continue;
    store.videos[item.videoId] = normalizeEntry(item);
  }
  writeStore(store);
  if (typeof window !== "undefined") {
    for (const item of remoteList) {
      if (!item || !item.videoId) continue;
      dispatchTimelineEvent(item.videoId, {
        source: "remote",
        updatedAt: store.videos[item.videoId].updatedAt,
      });
    }
  }
  return listTimelineVideos();
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