import { buildApiUrl } from "./apiClient";

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeGroupEntry(entry = {}) {
  const id = safeString(entry.id || entry.slug);
  if (!id) return null;
  const name = safeString(entry.name || entry.title) || id;
  const description = safeString(entry.description);
  const banner = safeString(entry.banner);
  const logo = safeString(entry.logo);
  const createdAt = safeString(entry.createdAt) || null;
  const updatedAt = safeString(entry.updatedAt) || createdAt;
  return {
    id,
    name,
    description,
    banner,
    logo,
    createdAt,
    updatedAt,
  };
}

export async function fetchGroups() {
  const url = buildApiUrl("/groups");
  if (!url || typeof fetch === "undefined") {
    return [];
  }
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Gruplar alınamadı: ${response.status}`);
  }
  const data = await response.json();
  const list = Array.isArray(data?.groups) ? data.groups : [];
  return list
    .map((item) => sanitizeGroupEntry(item))
    .filter((item) => item && item.id);
}

export async function createGroup(payload = {}) {
  const url = buildApiUrl("/groups");
  if (!url || typeof fetch === "undefined") {
    throw new Error("Grup oluşturma API'si kullanılabilir değil");
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Grup kaydı oluşturulamadı: ${response.status}`);
  }
  const data = await response.json();
  const sanitized = sanitizeGroupEntry(data);
  if (!sanitized) {
    throw new Error("Sunucudan geçerli grup yanıtı alınamadı");
  }
  return sanitized;
}

export function isPngUrl(value) {
  const url = safeString(value);
  if (!url) return false;
  const withoutQuery = url.split("?")[0];
  return /\.png$/i.test(withoutQuery);
}