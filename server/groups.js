import { safeString, slugify } from "./utils.js";

function ensurePngUrl(value, label) {
  const url = safeString(value);
  if (!url) {
    const error = new Error(`${label} gereklidir`);
    error.statusCode = 400;
    throw error;
  }
  const withoutQuery = url.split("?")[0];
  if (!/\.png$/i.test(withoutQuery)) {
    const error = new Error(`${label} PNG formatında olmalıdır`);
    error.statusCode = 400;
    throw error;
  }
  return url;
}

export function normalizeGroupEntry(id, entry = {}) {
  const name = safeString(entry.name) || id;
  const description = safeString(entry.description);
  const banner = safeString(entry.banner);
  const logo = safeString(entry.logo);
  const createdAt = safeString(entry.createdAt);
  const updatedAt = safeString(entry.updatedAt);
  const payload = { name };
  if (description) payload.description = description;
  if (banner) payload.banner = banner;
  if (logo) payload.logo = logo;
  if (createdAt) payload.createdAt = createdAt;
  if (updatedAt) payload.updatedAt = updatedAt;
  return payload;
}

export function sanitizeGroupMap(map = {}) {
  const sanitized = {};
  Object.entries(map || {}).forEach(([groupId, entry]) => {
    const id = safeString(groupId);
    if (!id) return;
    sanitized[id] = normalizeGroupEntry(id, entry);
  });
  return sanitized;
}

export function listGroupEntries(map = {}) {
  const list = [];
  Object.entries(map || {}).forEach(([groupId, entry]) => {
    const id = safeString(groupId);
    if (!id) return;
    list.push({ id, ...normalizeGroupEntry(id, entry) });
  });
  return list;
}

export function createGroupEntry(payload = {}, existingMap = {}) {
  const title = safeString(payload.name || payload.title);
  if (!title) {
    const error = new Error("Grup adı gereklidir");
    error.statusCode = 400;
    throw error;
  }
  const requestedId = safeString(payload.id || payload.slug);
  let id = requestedId || slugify(title);
  if (!id) {
    id = `group-${Date.now().toString(36)}`;
  }
  if (existingMap[id]) {
    const error = new Error("Bu grup ID'si zaten kayıtlı");
    error.statusCode = 409;
    throw error;
  }
  const description = safeString(payload.description);
  const banner = ensurePngUrl(payload.banner, "Banner");
  const logo = ensurePngUrl(payload.logo, "Logo");
  const timestamp = new Date().toISOString();
  const entry = normalizeGroupEntry(id, {
    name: title,
    description,
    banner,
    logo,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return { id, entry };
}