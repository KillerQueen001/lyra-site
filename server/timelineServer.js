/* eslint-env node */

import { createServer } from "http";
import { access, readFile, writeFile } from "fs/promises";
import { constants } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.join(__dirname, "timelineStore.json");
const PORT = Number(
  (typeof globalThis !== "undefined" &&
    globalThis.process &&
    globalThis.process.env &&
    globalThis.process.env.PORT) ||
    4173
);

const DEFAULT_STORE = { videos: {}, casts: [], videoLibrary: {} };

function cloneDefaultStore() {
  return { videos: {}, casts: [], videoLibrary: {} };
}

async function ensureStoreFile() {
  try {
    await access(DATA_PATH, constants.F_OK);
  } catch {
    await writeFile(DATA_PATH, JSON.stringify(DEFAULT_STORE, null, 2), "utf8");
  }
}

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

function generateCastId() {
  try {
    if (typeof randomUUID === "function") {
      return `cast-${randomUUID()}`;
    }
  } catch (error) {
    // Ignore and fall back below
  }
  return `cast-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function normalizeCastContacts(entry = {}) {
  const instagram = safeString(
    entry.instagram ??
      entry.contacts?.instagram ??
      entry.social?.instagram
  );
  const email = safeString(
    entry.email ?? entry.contacts?.email ?? entry.mail
  );
  const other = safeString(
    entry.other ??
      entry.contacts?.other ??
      entry.website ??
      entry.contact
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

function normalizeCastEntry(entry = {}, existing = []) {
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

function createCastEntry(payload = {}, existing = []) {
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
const HLS_URL_RE = /\.m3u8(\?.*)?$/i;

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

function normalizeVideoLibraryEntry(id, entry = {}) {
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

function sanitizeVideoLibraryMap(map = {}) {
  const sanitized = {};
  Object.entries(map || {}).forEach(([videoId, entry]) => {
    const id = safeString(videoId);
    if (!id) return;
    sanitized[id] = normalizeVideoLibraryEntry(id, entry);
  });
  return sanitized;
}

function listVideoLibraryEntries(map = {}) {
  const list = [];
  Object.entries(map || {}).forEach(([videoId, entry]) => {
    const id = safeString(videoId);
    if (!id) return;
    list.push({ id, ...normalizeVideoLibraryEntry(id, entry) });
  });
  return list;
}

function createVideoLibraryEntry(payload = {}, existingMap = {}) {
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

function safeAgeRating(value) {
  const allowed = new Set(["all", "7", "13", "16", "18"]);
  const normalized = safeString(value).toLowerCase();
  if (!normalized) return "all";
  if (normalized === "genel" || normalized === "genel izleyici") {
    return "all";
  }
  return allowed.has(normalized) ? normalized : "all";
}

function normalizeVideoDetailsEntry(entry = {}) {
  const base = typeof entry === "object" && entry !== null ? entry : {};
  const title = safeString(base.title) || "Yeni Video";
  const description = safeString(base.description) || "";
  const ageRating = safeAgeRating(base.ageRating);
  let thumbnail = { src: "", name: "" };
  if (base.thumbnail && typeof base.thumbnail === "object") {
    thumbnail = {
      src: safeString(base.thumbnail.src),
      name: safeString(base.thumbnail.name),
    };
  } else if (typeof base.thumbnail === "string") {
    thumbnail = { src: safeString(base.thumbnail), name: "" };
  }
  return {
    title,
    description,
    ageRating,
    thumbnail,
    updatedAt: safeString(base.updatedAt) || new Date().toISOString(),
  };
}

async function readStore() {
  await ensureStoreFile();
  const raw = await readFile(DATA_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return cloneDefaultStore();
    const videos =
      parsed.videos && typeof parsed.videos === "object"
        ? { ...parsed.videos }
        : {};
    const castsRaw = Array.isArray(parsed.casts) ? parsed.casts : [];
    const casts = [];
    for (const entry of castsRaw) {
      casts.push(normalizeCastEntry(entry, casts));
    }
    const videoDetailsRaw =
      parsed.videoDetails && typeof parsed.videoDetails === "object"
        ? parsed.videoDetails
        : {};
    const videoDetails = {};
    for (const [videoId, entry] of Object.entries(videoDetailsRaw)) {
      videoDetails[videoId] = normalizeVideoDetailsEntry(entry);
    }
    return { videos, casts, videoDetails };
  } catch (error) {
    console.warn("timelineStore JSON parse failed, resetting file", error);
    await writeFile(DATA_PATH, JSON.stringify(DEFAULT_STORE, null, 2), "utf8");
    return cloneDefaultStore();
  }
}

async function writeStore(store) {
  const videos =
    store && store.videos && typeof store.videos === "object"
      ? { ...store.videos }
      : {};
  const casts = [];
  const source = Array.isArray(store?.casts) ? store.casts : [];
  for (const entry of source) {
    casts.push(normalizeCastEntry(entry, casts));
  }
  const videoDetails = {};
  const detailsSource =
    store && store.videoDetails && typeof store.videoDetails === "object"
      ? store.videoDetails
      : {};
  for (const [videoId, entry] of Object.entries(detailsSource)) {
    videoDetails[videoId] = normalizeVideoDetailsEntry(entry);
  }
  await writeFile(
    DATA_PATH,
    JSON.stringify({ videos, casts, videoDetails }, null, 2),
    "utf8"
  );
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function normalizeEntry(entry) {
  const slots = Array.isArray(entry?.slots) ? entry.slots : [];
  const castLibrary = Array.isArray(entry?.castLibrary)
    ? entry.castLibrary
    : [];
  const updatedAt = entry?.updatedAt || new Date().toISOString();
  return { slots, castLibrary, updatedAt };
}

function notFound(res) {
  sendJson(res, 404, { error: "Not found" });
}

function methodNotAllowed(res) {
  sendJson(res, 405, { error: "Method not allowed" });
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    notFound(res);
    return;
  }

  if (req.method === "OPTIONS") {
    sendJson(res, 200, {});
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/casts") {
    if (req.method === "GET") {
      const store = await readStore();
      sendJson(res, 200, { casts: store.casts });
      return;
    }

    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const payload = body.length ? JSON.parse(body) : {};
          const store = await readStore();
          const newCast = createCastEntry(payload, store.casts);
          const updatedStore = {
            videos: store.videos,
            casts: [...store.casts, newCast],
            videoDetails: store.videoDetails,
          };
          await writeStore(updatedStore);
          sendJson(res, 201, newCast);
        } catch (error) {
          console.error("Cast kaydedilirken hata", error);
          const status = error?.statusCode ?? 500;
          const message =
            status === 400
              ? error.message || "Geçersiz cast verisi"
              : "Cast could not be saved";
          sendJson(res, status, { error: message });
        }
      });
      return;
    }

    methodNotAllowed(res);
    return;
  }

  if (url.pathname === "/api/video-details") {
    if (req.method === "GET") {
      const store = await readStore();
      sendJson(res, 200, { videos: store.videoDetails });
      return;
    }

    methodNotAllowed(res);
    return;
  }

  const videoDetailsMatch = url.pathname.match(/^\/api\/video-details\/(.+)$/);
  if (videoDetailsMatch) {
    const videoId = decodeURIComponent(videoDetailsMatch[1]);
    if (!videoId) {
      notFound(res);
      return;
    }

    if (req.method === "GET") {
      const store = await readStore();
      const entry = store.videoDetails[videoId];
      if (!entry) {
        notFound(res);
        return;
      }
      sendJson(res, 200, normalizeVideoDetailsEntry(entry));
      return;
    }

    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const payload = body.length ? JSON.parse(body) : {};
          const store = await readStore();
          const normalized = normalizeVideoDetailsEntry({
            ...payload,
            updatedAt: new Date().toISOString(),
          });
          store.videoDetails[videoId] = normalized;
          await writeStore(store);
          sendJson(res, 200, normalized);
        } catch (error) {
          console.error("Video detayları kaydedilemedi", error);
          sendJson(res, 500, { error: "Video details could not be saved" });
        }
      });
      return;
    }

    methodNotAllowed(res);
    return;
  }

  if (url.pathname === "/api/timelines" && req.method === "GET") {
    const store = await readStore();
    const videos = Object.entries(store.videos).map(([videoId, entry]) => ({
      videoId,
      ...normalizeEntry(entry),
    }));
    sendJson(res, 200, { videos });
    return;
  }

  const timelineMatch = url.pathname.match(/^\/api\/timelines\/(.+)$/);
  if (timelineMatch) {
    const videoId = decodeURIComponent(timelineMatch[1]);
    if (req.method === "GET") {
      const store = await readStore();
      const entry = store.videos[videoId];
      if (!entry) {
        notFound(res);
        return;
      }
      sendJson(res, 200, normalizeEntry(entry));
      return;
    }

    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const payload = body.length ? JSON.parse(body) : {};
          const normalized = normalizeEntry(payload);
          const store = await readStore();
          store.videos[videoId] = normalized;
          await writeStore(store);
          sendJson(res, 200, normalized);
        } catch (error) {
          console.error("Zaman çizelgesi kaydedilirken hata", error);
          sendJson(res, 500, { error: "Timeline could not be saved" });
        }
      });
      return;
    }

    methodNotAllowed(res);
    return;
  }

  notFound(res);
});

server.listen(PORT, () => {
  console.log(
    `Timeline server listening on http://localhost:${PORT}/api (timelines, casts)`
  );
});