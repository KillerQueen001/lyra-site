import { allCasts } from "../data/globalCasts";
import { buildApiUrl } from "./apiClient";

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value) {
  const input = safeString(value);
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function ensureSlug(raw) {
  const candidates = [
    raw?.slug,
    raw?.username,
    raw?.id,
    raw?.name,
  ];
  for (const candidate of candidates) {
    const slug = slugify(candidate);
    if (slug) return slug;
  }
  return `cast-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeContacts(source = {}) {
  const instagram = safeString(
    source.instagram ??
      source.social?.instagram ??
      source.contacts?.instagram
  );
  const email = safeString(
    source.email ?? source.mail ?? source.contacts?.email
  );
  const other = safeString(
    source.other ??
      source.website ??
      source.contact ??
      source.contacts?.other
  );
  const result = {};
  if (instagram) result.instagram = instagram;
  if (email) result.email = email;
  if (other) result.other = other;
  return result;
}

function normalizeCastResponse(raw = {}) {
  const name = safeString(raw.name) || "İsimsiz Oyuncu";
  const role = safeString(raw.role ?? raw.title);
  const bio = safeString(raw.bio ?? raw.description);
  const image = safeString(raw.image ?? raw.imageData ?? raw.photo ?? raw.avatar);
  const slug = ensureSlug(raw);
  const contacts = normalizeContacts(raw.contacts ?? raw);
  const createdAt = safeString(raw.createdAt);
  const updatedAt = safeString(raw.updatedAt);
  const origin = raw.origin ?? (raw.preset ? "preset" : "remote");
  return {
    id: safeString(raw.id) || slug,
    slug,
    name,
    role,
    bio,
    image,
    contacts,
    createdAt: createdAt || null,
    updatedAt: updatedAt || null,
    origin,
  };
}

export function getPresetCasts() {
  return allCasts.map((item) =>
    normalizeCastResponse({
      ...item,
      image: item.photo,
      preset: true,
      origin: "preset",
    })
  );
}

export function mergeCasts(remote = [], preset = getPresetCasts()) {
  const remoteBySlug = new Map();
  remote.forEach((cast) => {
    const normalized = normalizeCastResponse({ ...cast, origin: "remote" });
    remoteBySlug.set(normalized.slug, normalized);
  });

  const merged = [
    ...remoteBySlug.values(),
    ...preset.filter((item) => !remoteBySlug.has(item.slug)),
  ];

  return merged;
}

export async function fetchCasts() {
  const url = buildApiUrl("/casts");
  if (!url || typeof fetch === "undefined") {
    throw new Error("Cast API kullanılabilir değil");
  }

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Cast listesi alınamadı: ${response.status}`);
  }

  const data = await response.json();
  const list = Array.isArray(data?.casts) ? data.casts : [];
  return list.map((item) => normalizeCastResponse({ ...item, origin: "remote" }));
}

export async function createCast(payload = {}) {
  const url = buildApiUrl("/casts");
  if (!url || typeof fetch === "undefined") {
    throw new Error("Cast API kullanılabilir değil");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Cast kaydedilemedi: ${response.status}`);
  }

  const data = await response.json();
  return normalizeCastResponse({ ...data, origin: "remote" });
}

export function normalizeCastForDisplay(cast) {
  return normalizeCastResponse(cast);
}

export function getCastInitials(name) {
  const initials = safeString(name)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || "LY";
}

function buildInstagramUrl(handle) {
  const value = safeString(handle);
  if (!value) return null;
  if (/^https?:/i.test(value)) return value;
  const sanitized = value.replace(/^@/, "");
  return `https://instagram.com/${sanitized}`;
}

function buildGenericUrl(value) {
  const normalized = safeString(value);
  if (!normalized) return null;
  if (/^https?:/i.test(normalized)) {
    return normalized;
  }
  if (/^www\./i.test(normalized)) {
    return `https://${normalized}`;
  }
  return null;
}

export function describeCastContacts(contacts = {}) {
  const descriptors = [];
  if (contacts.instagram) {
    descriptors.push({
      key: "instagram",
      label: "Instagram",
      value: contacts.instagram,
      href: buildInstagramUrl(contacts.instagram),
    });
  }
  if (contacts.email) {
    const email = safeString(contacts.email);
    descriptors.push({
      key: "email",
      label: "E-posta",
      value: email,
      href: email ? `mailto:${email}` : null,
    });
  }
  if (contacts.other) {
    const other = safeString(contacts.other);
    descriptors.push({
      key: "other",
      label: "Diğer",
      value: other,
      href: buildGenericUrl(other),
    });
  }
  return descriptors;
}