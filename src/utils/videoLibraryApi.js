import { buildApiUrl } from "./apiClient";

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeFiles(files) {
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

function sanitizeVideoLibraryEntry(entry = {}) {
  const id = safeString(entry.id || entry.videoId);
  if (!id) return null;
  const title = safeString(entry.title) || id;
  const description = safeString(entry.description);
  const stream = safeString(entry.stream);
  const url = safeString(entry.url);
  const poster = safeString(entry.poster || entry.thumbnail);
  const defaultQuality = safeString(entry.defaultQuality);
  const files = sanitizeFiles(entry.files);
  const createdAt = safeString(entry.createdAt) || null;
  const updatedAt = safeString(entry.updatedAt) || createdAt;
  const origin = safeString(entry.origin) || (stream ? "remote" : "local");
  const base =
    entry.base && typeof entry.base === "object" ? { ...entry.base } : undefined;

  const payload = {
    id,
    title,
    description,
    stream,
    url,
    poster,
    defaultQuality,
    createdAt,
    updatedAt,
    origin,
  };
  if (files) payload.files = files;
  if (base) payload.base = base;
  return payload;
}

export async function fetchVideoLibraryEntries() {
  const url = buildApiUrl("/video-library");
  if (!url || typeof fetch === "undefined") {
    return [];
  }
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Video kütüphanesi alınamadı: ${response.status}`);
  }
  const data = await response.json();
  const list = Array.isArray(data?.videos) ? data.videos : [];
  return list
    .map((item) => sanitizeVideoLibraryEntry(item))
    .filter((item) => item && item.id);
}

export async function createVideoLibraryEntry(payload = {}) {
  const url = buildApiUrl("/video-library");
  if (!url || typeof fetch === "undefined") {
    throw new Error("Video kütüphanesi API kullanılabilir değil");
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Video kaydı oluşturulamadı: ${response.status}`);
  }
  const data = await response.json();
  const sanitized = sanitizeVideoLibraryEntry(data);
  if (!sanitized) {
    throw new Error("Sunucudan geçerli video yanıtı alınamadı");
  }
  return sanitized;
}

export function isValidHlsUrl(value) {
  const url = safeString(value);
  if (!url) return false;
  return /\.m3u8(\?.*)?$/i.test(url);
}