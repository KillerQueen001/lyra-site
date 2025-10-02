const baseVideoLibrary = {
  sample: {
    title: "Örnek Video",
    description: "Yerel olarak saklanan örnek MP4 dosyası.",
    poster: "/videos/sample_poster.jpg",
    files: {
      single: "/videos/sample.mp4",
      "480": "/videos/sample_480.mp4",
      "720": "/videos/sample_720.mp4",
      "1080": "/videos/sample_1080.mp4",
    },
  },
  "portal2-bolum-1": {
    title: "Portal 2 Türkçe Dublaj — Bölüm 1",
    description: "Portal 2 projesinin birinci bölümü.",
    stream:
      "https://vz-14c17071-bad.b-cdn.net/c3c772ab-adf0-44cd-a170-1d2451de3b08/playlist.m3u8",
    poster: "/posters/portal2-episode1.jpg",
  },
  "portal2-bolum-2": {
    title: "Portal 2 Türkçe Dublaj — Bölüm 2",
    description: "Portal 2 projesinin ikinci bölümü.",
    stream:
      "https://vz-14c17071-bad.b-cdn.net/c3c772ab-adf0-44cd-a170-1d2451de3b08/playlist.m3u8",
    poster: "/posters/portal2-episode2.jpg",
  },
  "kus-kasabası": {
    title: "Kuş Kasabası Türkçe Dublaj — Bölüm 1",
    description: "Kuş Kasabası projesinin birinci bölümü.",
    stream:
      "https://vz-77a59fea-616.b-cdn.net/6d4563b3-484b-4821-aa2a-1208504190e9/playlist.m3u8",
    poster: "/posters/portal2-episode2.jpg",
  },
  "dyinglight-bolum-1": {
    title: "Dying Light Türkçe Dublaj — Bölüm 1",
    description: "Dying Light projesine ait örnek bölüm.",
    files: {
      single: "/videos/sample.mp4",
    },
    poster: "/posters/dyinglight-episode1.jpg",
  },
};

export const videoLibrary = { ...baseVideoLibrary };

const subscribers = new Set();

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFiles(files) {
  if (!files || typeof files !== "object") return null;
  const normalized = {};
  Object.entries(files).forEach(([key, value]) => {
    const k = safeString(key);
    const v = safeString(value);
    if (!k || !v) return;
    normalized[k] = v;
  });
  return Object.keys(normalized).length ? normalized : null;
}

function normalizeVideoEntryInput(entry = {}) {
  if (!entry || typeof entry !== "object") return null;
  const id = safeString(entry.id || entry.videoId);
  if (!id) return null;
  const data = {};
  const title = safeString(entry.title);
  if (title) data.title = title;
  const description = safeString(entry.description);
  if (description) data.description = description;
  const stream = safeString(entry.stream);
  if (stream) data.stream = stream;
  const url = safeString(entry.url);
  if (url) data.url = url;
  const poster = safeString(entry.poster || entry.thumbnail);
  if (poster) data.poster = poster;
  const defaultQuality = safeString(entry.defaultQuality);
  if (defaultQuality) data.defaultQuality = defaultQuality;
  const files = normalizeFiles(entry.files);
  if (files) data.files = files;
  const createdAt = safeString(entry.createdAt);
  if (createdAt) data.createdAt = createdAt;
  const updatedAt = safeString(entry.updatedAt);
  if (updatedAt) data.updatedAt = updatedAt;
  if (entry.origin) {
    const origin = safeString(entry.origin) || entry.origin;
    if (origin) data.origin = origin;
  } else if (!videoLibrary[id]?.origin) {
    data.origin = "remote";
  }
  if (entry.base && typeof entry.base === "object") {
    data.base = { ...entry.base };
  }
  return { id, data };
}

function entriesEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (typeof a !== "object" || typeof b !== "object") {
    return a === b;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => entriesEqual(a[key], b[key]));
}

function applyNormalizedEntry(normalized) {
  if (!normalized) return false;
  const { id, data } = normalized;
  if (!id) return false;
  const existing = videoLibrary[id];
  const next = existing ? { ...existing } : {};
  let changed = !existing;
  Object.entries(data).forEach(([key, value]) => {
    if (value == null || value === "") return;
    if (typeof value === "object" && !Array.isArray(value)) {
      if (!entriesEqual(existing?.[key], value)) {
        next[key] = value;
        changed = true;
      }
    } else if (existing?.[key] !== value) {
      next[key] = value;
      changed = true;
    }
  });
  if (changed) {
    videoLibrary[id] = next;
  }
  return changed;
}

function notifyVideoLibrarySubscribers() {
  subscribers.forEach((callback) => {
    try {
      callback();
    } catch (error) {
      console.error("Video library subscriber error", error);
    }
  });
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent("lyra:video-library-updated"));
  }
}

export function registerRemoteVideoEntries(entries = []) {
  const list = Array.isArray(entries) ? entries : [entries];
  let changed = false;
  list.forEach((item) => {
    const normalized = normalizeVideoEntryInput(item);
    if (!normalized) return;
    if (applyNormalizedEntry(normalized)) {
      changed = true;
    }
  });
  if (changed) {
    notifyVideoLibrarySubscribers();
  }
}

export function getVideoEntry(id) {
  if (!id) return null;
  return videoLibrary[id] || null;
}

export function getVideoLibrarySnapshot() {
  const snapshot = {};
  Object.entries(videoLibrary).forEach(([videoId, entry]) => {
    snapshot[videoId] = { ...entry };
  });
  return snapshot;
}

export function subscribeToVideoLibrary(callback) {
  if (typeof callback !== "function") {
    return () => {};
  }
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

export function resetVideoLibrary() {
  Object.keys(videoLibrary).forEach((key) => {
    delete videoLibrary[key];
  });
  Object.entries(baseVideoLibrary).forEach(([key, value]) => {
    videoLibrary[key] = { ...value };
  });
  notifyVideoLibrarySubscribers();
}