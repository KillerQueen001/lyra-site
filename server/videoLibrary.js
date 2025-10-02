import { safeString, slugify } from "./utils.js";

export const HLS_URL_RE = /\.m3u8(\?.*)?$/i;

function normalizeVideoFiles(files = {}) {
  const normalized = {};
  if (!files || typeof files !== "object") return normalized;
  Object.entries(files).forEach(([key, value]) => {
    const k = safeString(key);
    const v = safeString(value);
    if (!k || !v) return;
    normalized[k] = v;
  });
  return normalized;
}

export function normalizeVideoLibraryEntry(id, entry = {}) {
  const baseTitle = safeString(entry.title) || safeString(entry.name) || id;
  const description = safeString(entry.description);
  const stream = safeString(entry.stream);
  const url = safeString(entry.url);
  const poster = safeString(entry.poster || entry.thumbnail);
  const defaultQuality = safeString(entry.defaultQuality);
  const createdAt = safeString(entry.createdAt);
  const updatedAt = safeString(entry.updatedAt);
  const origin = safeString(entry.origin) || "remote";
  const files = normalizeVideoFiles(entry.files);
  const payload = { title: baseTitle || id, origin };
  if (description) payload.description = description;
  if (stream) payload.stream = stream;
  if (url) payload.url = url;
  if (poster) payload.poster = poster;
  if (defaultQuality) payload.defaultQuality = defaultQuality;
  if (Object.keys(files).length) payload.files = files;
  if (createdAt) payload.createdAt = createdAt;
  if (updatedAt) payload.updatedAt = updatedAt;
  return payload;
}

export function sanitizeVideoLibraryMap(map = {}) {
  const sanitized = {};
  Object.entries(map || {}).forEach(([videoId, entry]) => {
    const id = safeString(videoId);
    if (!id) return;
    sanitized[id] = normalizeVideoLibraryEntry(id, entry);
  });
  return sanitized;
}

export function listVideoLibraryEntries(map = {}) {
  const list = [];
  Object.entries(map || {}).forEach(([videoId, entry]) => {
    const id = safeString(videoId);
    if (!id) return;
    list.push({ id, ...normalizeVideoLibraryEntry(id, entry) });
  });
  return list;
}

export function createVideoLibraryEntry(payload = {}, existingMap = {}) {
  const title = safeString(payload.title);
  const stream = safeString(payload.stream);
  if (!stream) {
    const error = new Error("HLS bağlantısı gereklidir");
    error.statusCode = 400;
    throw error;
  }
  if (!HLS_URL_RE.test(stream)) {
    const error = new Error("HLS bağlantısı .m3u8 ile bitmelidir");
    error.statusCode = 400;
    throw error;
  }
  const requestedId = safeString(payload.id);
  const streamSegment = stream.split("?")[0];
  const streamName = (streamSegment.split("/").pop() || streamSegment || "").trim();
  let id = requestedId || slugify(title) || slugify(streamName);
  if (!id) {
    id = `video-${Date.now().toString(36)}`;
  }
  if (existingMap[id]) {
    const error = new Error("Bu video ID'si zaten kayıtlı");
    error.statusCode = 409;
    throw error;
  }
  const description = safeString(payload.description);
  const poster = safeString(payload.poster);
  const url = safeString(payload.url);
  const defaultQuality = safeString(payload.defaultQuality);
  const files = normalizeVideoFiles(payload.files);
  const timestamp = new Date().toISOString();
  const entry = normalizeVideoLibraryEntry(id, {
    title: title || id,
    description,
    stream,
    poster,
    url,
    defaultQuality,
    files,
    createdAt: timestamp,
    updatedAt: timestamp,
    origin: "remote",
  });
  return { id, entry };
}