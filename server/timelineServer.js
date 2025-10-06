/* eslint-env node */

import "./env.js";
import { createServer } from "http";

import { createCastEntry } from "./casts.js";
import { createGroupEntry, listGroupEntries } from "./groups.js";
import { readStore, writeStore } from "./store.js";
import {
  createVideoLibraryEntry,
  listVideoLibraryEntries,
  removeVideoLibraryEntry,
} from "./videoLibrary.js";
import {
  normalizeVideoDetailsEntry,
  upsertVideoDetailsEntry,
} from "./videoDetails.js";
import { safeString } from "./utils.js";

const DEFAULT_PORT = 4173;
const PORT = Number(process?.env?.PORT ?? DEFAULT_PORT);
const HOST = safeString(process?.env?.HOST ?? process?.env?.TIMELINE_HOST) || "0.0.0.0";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS,HEAD",
  "Access-Control-Allow-Headers": "Content-Type,Accept",
};

const SLOT_KIND_COLORS = {
  dialogue: "#7c4bd9",
  music: "#5ad1b3",
  sfx: "#ffd166",
  fx: "#8ecae6",
  note: "#b598ff",
};

const SLOT_KINDS = new Set(Object.keys(SLOT_KIND_COLORS));

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, JSON_HEADERS);
  res.end(JSON.stringify(payload));
}

function sendNotFound(res) {
  sendJson(res, 404, { error: "Not found" });
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        const parseError = new Error("Geçersiz JSON gövdesi");
        parseError.statusCode = 400;
        reject(parseError);
      }
    });
  });
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function roundTime(value) {
  return Math.round(value * 1000) / 1000;
}

function normalizeSlotKind(value) {
  const kind = safeString(value).toLowerCase();
  return SLOT_KINDS.has(kind) ? kind : "";
}

function normalizeSlotColor(value, kind) {
  const color = safeString(value);
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)) {
    return color.length === 7 ? color.toLowerCase() : color;
  }
  if (kind && SLOT_KIND_COLORS[kind]) {
    return SLOT_KIND_COLORS[kind];
  }
  return "";
}

function normalizeCastList(value) {
  const initial = (() => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      return value.split(/[;,|/]/);
    }
    if (value && typeof value === "object") {
      return Object.values(value);
    }
    return [];
  })();

  const seen = new Set();
  const result = [];

  for (const entry of initial) {
    const name = safeString(entry);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
    if (result.length >= 16) break;
  }

  return result;
}

function ensureSlotId(slot, index, seen) {
  const rawId =
    safeString(slot?.id) ||
    safeString(slot?.uuid) ||
    safeString(slot?.key) ||
    `slot-${index + 1}`;

  let candidate = rawId;
  let suffix = 1;
  while (seen.has(candidate)) {
    suffix += 1;
    candidate = `${rawId}-${suffix}`;
  }

  seen.add(candidate);
  return candidate;
}

function normalizeSlot(slot, index, seenIds) {
  if (!slot || typeof slot !== "object") {
    return null;
  }

  const startRaw =
    slot.start ?? slot.from ?? slot.begin ?? slot.t ?? slot.time ?? slot.offset;
  const endRaw = slot.end ?? slot.to ?? slot.finish ?? slot.stop ?? slot.until;

  const start = toNumber(startRaw);
  if (start === null) {
    return null;
  }

  const end = toNumber(endRaw);
  const safeStart = roundTime(Math.max(0, start));
  const safeEnd = roundTime(Math.max(safeStart, end === null ? safeStart : end));

  const kind = normalizeSlotKind(slot.kind ?? slot.type);
  const color = normalizeSlotColor(slot.color ?? slot.fill ?? slot.tint, kind);
  const label =
    safeString(slot.label ?? slot.title ?? slot.name ?? slot.description) || "";
  const cast = normalizeCastList(
    slot.cast ?? slot.casts ?? slot.voice ?? slot.voices ?? slot.speakers,
  );

  const payload = {
    id: ensureSlotId(slot, index, seenIds),
    start: safeStart,
    end: safeEnd,
  };

  if (label) payload.label = label;
  if (cast.length) payload.cast = cast;
  if (kind) payload.kind = kind;
  if (color) payload.color = color;

  return payload;
}

function normalizeSlots(slots) {
  if (!Array.isArray(slots)) {
    return [];
  }

  const seenIds = new Set();
  const sanitized = [];

  slots.forEach((slot, index) => {
    const normalized = normalizeSlot(slot, index, seenIds);
    if (normalized) {
      sanitized.push(normalized);
    }
  });

  sanitized.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return a.end - b.end;
  });

  return sanitized;
}

function normalizeCastContacts(contacts) {
  if (!contacts || typeof contacts !== "object") {
    return {};
  }

  const instagram = safeString(
    contacts.instagram ?? contacts.social?.instagram ?? contacts.contactInstagram,
  );
  const email = safeString(contacts.email ?? contacts.mail ?? contacts.contactEmail);
  const other = safeString(contacts.other ?? contacts.website ?? contacts.contact);

  const result = {};
  if (instagram) result.instagram = instagram;
  if (email) result.email = email;
  if (other) result.other = other;
  return result;
}

function normalizeCastLibraryEntry(entry, index = 0) {
  const slug =
    safeString(entry?.slug) ||
    safeString(entry?.username) ||
    safeString(entry?.handle) ||
    safeString(entry?.id);

  const id = safeString(entry?.id) || slug || `cast-${index}`;
  if (!id) {
    return null;
  }

  const name = safeString(entry?.name) || safeString(entry?.title);
  const role = safeString(entry?.role) || safeString(entry?.descriptionRole);
  const description = safeString(entry?.description ?? entry?.bio ?? "");
  const bio = safeString(entry?.bio ?? description);
  const photo = safeString(entry?.photo ?? entry?.image ?? entry?.avatar);
  const origin = safeString(entry?.origin);
  const contacts = normalizeCastContacts(entry?.contacts ?? entry);

  const payload = { id };
  if (slug) payload.slug = slug;
  if (name) payload.name = name;
  if (role) payload.role = role;
  if (description) payload.description = description;
  if (bio) payload.bio = bio;
  if (photo) {
    payload.photo = photo;
    payload.image = photo;
  }
  if (origin) payload.origin = origin;
  if (Object.keys(contacts).length) payload.contacts = contacts;

  return payload;
}

function normalizeCastLibrary(castLibrary) {
  if (!Array.isArray(castLibrary)) {
    return [];
  }

  const seen = new Set();
  const sanitized = [];

  castLibrary.forEach((entry, index) => {
    const normalized = normalizeCastLibraryEntry(entry, index);
    if (!normalized) return;

    const key = normalized.id || normalized.slug || `cast-${index}`;
    if (seen.has(key)) return;

    seen.add(key);
    sanitized.push(normalized);
  });

  return sanitized;
}

function normalizeTimelineEntry(entry, { useServerTimestamp = false } = {}) {
  const normalized = {
    slots: normalizeSlots(entry?.slots),
    castLibrary: normalizeCastLibrary(entry?.castLibrary),
  };

  const providedUpdatedAt = safeString(entry?.updatedAt);
  normalized.updatedAt = useServerTimestamp || !providedUpdatedAt
    ? new Date().toISOString()
    : providedUpdatedAt;

  return normalized;
}

function buildTimelineResponse(videoId, entry) {
  return { videoId, ...normalizeTimelineEntry(entry) };
}

async function handleGetCasts(res) {
  const store = await readStore();
  sendJson(res, 200, { casts: store.casts });
}

async function handleCreateCast(req, res) {
  try {
    const payload = await readJsonBody(req);
    const store = await readStore();
    const newCast = createCastEntry(payload, store.casts);

    await writeStore({
      videos: store.videos,
      casts: [...store.casts, newCast],
      videoLibrary: store.videoLibrary,
      videoDetails: store.videoDetails,
      groups: store.groups,
    });

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
}

async function handleListVideoLibrary(res) {
  const store = await readStore();
  const videos = listVideoLibraryEntries(store.videoLibrary).sort((a, b) => {
    const timeA = a.updatedAt || a.createdAt || "";
    const timeB = b.updatedAt || b.createdAt || "";
    if (timeA && timeB) {
      return new Date(timeB).getTime() - new Date(timeA).getTime();
    }
    if (timeA) return -1;
    if (timeB) return 1;
    return a.title.localeCompare(b.title, "tr", { sensitivity: "base" });
  });
  sendJson(res, 200, { videos });
}

async function handleCreateVideoLibrary(req, res) {
  try {
    const payload = await readJsonBody(req);
    const store = await readStore();
    const existing = store.videoLibrary || {};
    const { id, entry } = createVideoLibraryEntry(payload, existing, store.groups);

    await writeStore({
      videos: store.videos,
      casts: store.casts,
      videoLibrary: { ...existing, [id]: entry },
      videoDetails: store.videoDetails,
      groups: store.groups,
    });

    sendJson(res, 201, { id, ...entry });
  } catch (error) {
    console.error("Video kütüphanesi kaydedilirken hata", error);
    const status = error?.statusCode ?? 500;
    const message =
      status === 400 || status === 409
        ? error.message || "Geçersiz video verisi"
        : "Video kaydı oluşturulamadı";
    sendJson(res, status, { error: message });
  }
}

async function handleDeleteVideoLibrary(res, videoId) {
  try {
    const store = await readStore();
    const existing = store.videoLibrary || {};
    const { id, map } = removeVideoLibraryEntry(videoId, existing);
    const nextDetails = { ...store.videoDetails };
    if (nextDetails[id]) {
      delete nextDetails[id];
    }

    await writeStore({
      videos: store.videos,
      casts: store.casts,
      videoLibrary: map,
      videoDetails: nextDetails,
      groups: store.groups,
    });

    sendJson(res, 200, { id });
  } catch (error) {
    console.error("Video kütüphanesi silinirken hata", error);
    const status = error?.statusCode ?? 500;
    const message =
      status === 404
        ? error.message || "Video bulunamadı"
        : "Video kaydı silinemedi";
    sendJson(res, status, { error: message });
  }
}

async function handleListVideoDetails(res) {
  const store = await readStore();
  sendJson(res, 200, { videos: store.videoDetails });
}

async function handleReadVideoDetails(res, videoId) {
  const store = await readStore();
  const entry = store.videoDetails?.[videoId];
  if (!entry) {
    sendNotFound(res);
    return;
  }
  sendJson(res, 200, normalizeVideoDetailsEntry(entry));
}

async function handleUpsertVideoDetails(req, res, videoId) {
  try {
    const payload = await readJsonBody(req);
    const store = await readStore();
    const updatedEntry = upsertVideoDetailsEntry(videoId, payload, store.videoDetails);

    await writeStore({
      videos: store.videos,
      casts: store.casts,
      videoLibrary: store.videoLibrary,
      videoDetails: { ...store.videoDetails, [videoId]: updatedEntry },
      groups: store.groups,
    });

    sendJson(res, 200, updatedEntry);
  } catch (error) {
    console.error("Video detayları kaydedilirken hata", error);
    const status = error?.statusCode ?? 500;
    const message =
      status === 400
        ? error.message || "Geçersiz video detayı"
        : "Video detayları kaydedilemedi";
    sendJson(res, status, { error: message });
  }
}

async function handleListTimelines(res) {
  const store = await readStore();
  const videos = Object.entries(store.videos).map(([videoId, entry]) =>
    buildTimelineResponse(videoId, entry),
  );
  sendJson(res, 200, { videos });
}

async function handleReadTimeline(res, videoId) {
  const store = await readStore();
  const entry = store.videos[videoId];
  if (!entry) {
    sendNotFound(res);
    return;
  }

  sendJson(res, 200, normalizeTimelineEntry(entry));
}

async function handleSaveTimeline(req, res, videoId) {
  try {
    const payload = await readJsonBody(req);
    const normalized = normalizeTimelineEntry(payload, {
      useServerTimestamp: true,
    });
    const store = await readStore();

    await writeStore({
      videos: { ...store.videos, [videoId]: normalized },
      casts: store.casts,
      videoLibrary: store.videoLibrary,
      videoDetails: store.videoDetails,
      groups: store.groups,
    });

    sendJson(res, 200, normalized);
  } catch (error) {
    console.error("Zaman çizelgesi kaydedilirken hata", error);
    sendJson(res, error?.statusCode ?? 500, {
      error: "Timeline could not be saved",
    });
  }
}

async function handleListGroups(res) {
  const store = await readStore();
  const groups = listGroupEntries(store.groups).sort((a, b) => {
    const timeA = a.updatedAt || a.createdAt || "";
    const timeB = b.updatedAt || b.createdAt || "";
    if (timeA && timeB) {
      return new Date(timeB).getTime() - new Date(timeA).getTime();
    }
    if (timeA) return -1;
    if (timeB) return 1;
    return a.name.localeCompare(b.name, "tr", { sensitivity: "base" });
  });
  sendJson(res, 200, { groups });
}

async function handleCreateGroup(req, res) {
  try {
    const payload = await readJsonBody(req);
    const store = await readStore();
    const existing = store.groups || {};
    const { id, entry } = createGroupEntry(payload, existing);

    await writeStore({
      videos: store.videos,
      casts: store.casts,
      videoLibrary: store.videoLibrary,
      videoDetails: store.videoDetails,
      groups: { ...existing, [id]: entry },
    });

    sendJson(res, 201, { id, ...entry });
  } catch (error) {
    console.error("Grup kaydedilirken hata", error);
    const status = error?.statusCode ?? 500;
    const message =
      status === 400 || status === 409
        ? error.message || "Geçersiz grup verisi"
        : "Grup kaydı oluşturulamadı";
    sendJson(res, status, { error: message });
  }
}

function matchPath(pattern, pathname) {
  if (typeof pattern === "string") {
    return pattern === pathname ? [] : null;
  }
  const match = pathname.match(pattern);
  if (!match) return null;
  return match.slice(1).map((part) => decodeURIComponent(part));
}

const ROUTES = [
  { method: "GET", pattern: "/api/casts", handler: ({ res }) => handleGetCasts(res) },
  { method: "POST", pattern: "/api/casts", handler: ({ req, res }) => handleCreateCast(req, res) },
  {
    method: "GET",
    pattern: "/api/video-library",
    handler: ({ res }) => handleListVideoLibrary(res),
  },
  {
    method: "POST",
    pattern: "/api/video-library",
    handler: ({ req, res }) => handleCreateVideoLibrary(req, res),
  },
  {
    method: "DELETE",
    pattern: /^\/api\/video-library\/(.+)$/,
    handler: ({ res, params: [videoId] }) => handleDeleteVideoLibrary(res, videoId),
  },
  {
    method: "GET",
    pattern: "/api/video-details",
    handler: ({ res }) => handleListVideoDetails(res),
  },
  {
    method: "GET",
    pattern: /^\/api\/video-details\/(.+)$/,
    handler: ({ res, params: [videoId] }) => handleReadVideoDetails(res, videoId),
  },
  {
    method: "POST",
    pattern: /^\/api\/video-details\/(.+)$/,
    handler: ({ req, res, params: [videoId] }) =>
      handleUpsertVideoDetails(req, res, videoId),
  },
  {
    method: "GET",
    pattern: "/api/timelines",
    handler: ({ res }) => handleListTimelines(res),
  },
  {
    method: "GET",
    pattern: /^\/api\/timelines\/(.+)$/,
    handler: ({ res, params: [videoId] }) => handleReadTimeline(res, videoId),
  },
  {
    method: "POST",
    pattern: /^\/api\/timelines\/(.+)$/,
    handler: ({ req, res, params: [videoId] }) => handleSaveTimeline(req, res, videoId),
  },
  {
    method: "GET",
    pattern: "/api/groups",
    handler: ({ res }) => handleListGroups(res),
  },
  {
    method: "POST",
    pattern: "/api/groups",
    handler: ({ req, res }) => handleCreateGroup(req, res),
  },
];

const server = createServer(async (req, res) => {
  if (!req.url) {
    sendNotFound(res);
    return;
  }

  if (req.method === "OPTIONS") {
    sendJson(res, 200, {});
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  const matchingRoutes = ROUTES.map((route) => ({
    route,
    params: matchPath(route.pattern, url.pathname),
  })).filter((entry) => entry.params);

  if (!matchingRoutes.length) {
    sendNotFound(res);
    return;
  }

  const active = matchingRoutes.find((entry) => entry.route.method === req.method);
  if (!active) {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  await active.route.handler({ req, res, params: active.params ?? [] });
});

server.listen(PORT, HOST, () => {
  const localUrl = `http://localhost:${PORT}/api`;
  const hostUrl = HOST === "0.0.0.0" ? "http://<your-ip-address>:" + PORT + "/api" : `http://${HOST}:${PORT}/api`;
  console.log(
    `Timeline server listening on ${localUrl} (timelines, casts, video-library, video-details, groups)`,
  );
  if (HOST === "0.0.0.0") {
    console.log(`Accessible on your network via ${hostUrl}`);
  } else if (HOST !== "127.0.0.1" && HOST !== "localhost") {
    console.log(`Accessible on configured host ${hostUrl}`);
  }
});