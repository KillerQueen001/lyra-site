const STORAGE_KEY = "admin:videoMeta";

function readMetaStore() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    /* ignore malformed json */
  }
  return {};
}

function writeMetaStore(metaMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(metaMap));
}

function sanitizeMeta(meta = {}) {
  return {
    title: typeof meta.title === "string" ? meta.title : "",
    description: typeof meta.description === "string" ? meta.description : "",
    poster: typeof meta.poster === "string" ? meta.poster : "",
  };
}

export async function loadVideoMeta(videoId, defaults = {}) {
  if (!videoId) {
    return sanitizeMeta(defaults);
  }
  const store = readMetaStore();
  const stored = store[videoId];
  return sanitizeMeta({ ...defaults, ...stored });
}

export async function saveVideoMeta(videoId, meta) {
  if (!videoId) return sanitizeMeta(meta);
  const store = readMetaStore();
  const sanitized = sanitizeMeta(meta);
  store[videoId] = sanitized;
  writeMetaStore(store);
  return sanitized;
}

export async function clearVideoMeta(videoId) {
  if (!videoId) return;
  const store = readMetaStore();
  if (store[videoId]) {
    delete store[videoId];
    writeMetaStore(store);
  }
}