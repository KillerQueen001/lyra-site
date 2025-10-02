import { randomUUID } from "crypto";
import { safeString, slugify } from "./utils.js";

function generateCastId() {
  try {
    if (typeof randomUUID === "function") {
      return `cast-${randomUUID()}`;
    }
  } catch {
    // Ignore and fall back below
  }
  return `cast-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function normalizeCastContacts(entry = {}) {
  const instagram = safeString(
    entry.instagram ?? entry.contacts?.instagram ?? entry.social?.instagram
  );
  const email = safeString(entry.email ?? entry.contacts?.email ?? entry.mail);
  const other = safeString(
    entry.other ?? entry.contacts?.other ?? entry.website ?? entry.contact
  );
  const contacts = {};
  if (instagram) contacts.instagram = instagram;
  if (email) contacts.email = email;
  if (other) contacts.other = other;
  return contacts;
}

function baseCast(entry = {}) {
  const id = safeString(entry.id);
  const name = safeString(entry.name) || "İsimsiz Oyuncu";
  const role = safeString(entry.role ?? entry.title);
  const bio = safeString(entry.bio ?? entry.description);
  const image = safeString(
    entry.image ?? entry.imageData ?? entry.photo ?? entry.avatar
  );
  const slugCandidate =
    entry.slug ?? entry.username ?? entry.handle ?? entry.id ?? entry.name;
  const slug = slugify(slugCandidate);
  return {
    id,
    name,
    role,
    bio,
    image,
    slug,
    contacts: normalizeCastContacts(entry),
  };
}

function ensureUniqueSlug(slug, existing = [], idToPreserve) {
  const taken = new Set();
  for (const item of existing) {
    if (idToPreserve && safeString(item.id) === idToPreserve) continue;
    if (item.slug) taken.add(item.slug);
  }

  let base = slug;
  if (!base) {
    base = slugify(idToPreserve) || `cast-${Date.now().toString(36)}`;
  }

  let candidate = base;
  let counter = 1;
  while (taken.has(candidate)) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }
  return candidate;
}

export function normalizeCastEntry(entry = {}, existing = []) {
  const base = baseCast(entry);
  const id = base.id || generateCastId();
  const slugFromBase =
    base.slug || slugify(entry.id) || slugify(base.name) || slugify(id);
  const slug = ensureUniqueSlug(slugFromBase, existing, id);
  const createdAt = safeString(entry.createdAt) || new Date().toISOString();
  const updatedAt = safeString(entry.updatedAt) || createdAt;
  return {
    id,
    name: base.name,
    role: base.role,
    bio: base.bio,
    image: base.image,
    contacts: base.contacts,
    slug,
    createdAt,
    updatedAt,
  };
}

export function createCastEntry(payload = {}, existing = []) {
  const name = safeString(payload?.name);
  if (!name) {
    const error = new Error("Cast adı gereklidir");
    error.statusCode = 400;
    throw error;
  }
  const normalized = normalizeCastEntry({ ...payload, name }, existing);
  const timestamp = new Date().toISOString();
  return {
    ...normalized,
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}