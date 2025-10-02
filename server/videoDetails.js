import { safeString } from "./utils.js";

function normalizeThumbnail(thumbnail = {}) {
  if (!thumbnail || typeof thumbnail !== "object") {
    return { src: "", name: "" };
  }
  const src = safeString(thumbnail.src);
  const name = safeString(thumbnail.name);
  return { src, name };
}

export function normalizeVideoDetailsEntry(entry = {}) {
  const title = safeString(entry.title);
  const description = safeString(entry.description);
  const ageRating = safeString(entry.ageRating) || "all";
  const thumbnail = normalizeThumbnail(entry.thumbnail);
  const createdAt = safeString(entry.createdAt);
  const updatedAt = safeString(entry.updatedAt) || createdAt;
  const normalized = {
    title,
    description,
    ageRating,
    thumbnail,
    updatedAt: updatedAt || new Date().toISOString(),
  };
  if (createdAt) {
    normalized.createdAt = createdAt;
  }
  return normalized;
}

export function sanitizeVideoDetailsMap(map = {}) {
  const sanitized = {};
  Object.entries(map || {}).forEach(([videoId, entry]) => {
    const id = safeString(videoId);
    if (!id) return;
    sanitized[id] = normalizeVideoDetailsEntry(entry);
  });
  return sanitized;
}

export function upsertVideoDetailsEntry(videoId, payload = {}, existingMap = {}) {
  const id = safeString(videoId);
  if (!id) {
    const error = new Error("Video ID gereklidir");
    error.statusCode = 400;
    throw error;
  }

  const previous = existingMap[id] || {};
  const now = new Date().toISOString();
  const createdAt = safeString(previous.createdAt) || now;
  const thumbnailInput =
    payload.thumbnail && typeof payload.thumbnail === "object"
      ? payload.thumbnail
      : previous.thumbnail;

  const entry = {
    title: safeString(payload.title),
    description: safeString(payload.description),
    ageRating: safeString(payload.ageRating) || previous.ageRating || "all",
    thumbnail: normalizeThumbnail(thumbnailInput),
    createdAt,
    updatedAt: now,
  };

  return normalizeVideoDetailsEntry(entry);
}