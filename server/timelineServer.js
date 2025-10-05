/* eslint-env node */

import"./env.js";
import { createServer } from "http";
import { Buffer } from "node:buffer"
import { readStore, writeStore } from "./store.js";
import { createCastEntry } from "./casts.js";
import {
  listVideoLibraryEntries,
  createVideoLibraryEntry,
  removeVideoLibraryEntry,
} from "./videoLibrary.js";
import {
  normalizeVideoDetailsEntry,
  upsertVideoDetailsEntry,
} from "./videoDetails.js";
import { listGroupEntries, createGroupEntry } from "./groups.js";
import {
  getBunnyStorageStatus,
  uploadBufferToBunny,
  deleteFromBunny,
  createStoragePath,
  BunnyStorageError,
} from "./bunnyStorage.js";
import { safeString } from "./utils.js";

const PORT = Number(
  (typeof globalThis !== "undefined" &&
    globalThis.process &&
    globalThis.process.env &&
    globalThis.process.env.PORT) ||
    4173
);

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function notFound(res) {
  sendJson(res, 404, { error: "Not found" });
}

function methodNotAllowed(res) {
  sendJson(res, 405, { error: "Method not allowed" });
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
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
    req.on("error", (error) => {
      reject(error);
    });
  });
}

function extractBase64Payload(value) {
  const raw = safeString(value);
  if (!raw) return "";
  const commaIndex = raw.indexOf(",");
  if (commaIndex >= 0) {
    return raw.slice(commaIndex + 1);
  }
  return raw;
}

const MIME_EXTENSION_MAP = new Map([
  ["image/png", "png"],
  ["image/x-png", "png"],
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/svg+xml", "svg"],
]);

function guessExtension(contentType, fileName) {
  const content = safeString(contentType).toLowerCase();
  if (content && MIME_EXTENSION_MAP.has(content)) {
    return MIME_EXTENSION_MAP.get(content) || "";
  }
  const name = safeString(fileName).toLowerCase();
  if (!name) return "";
  const parts = name.split(".");
  if (parts.length > 1) {
    return parts.pop() || "";
  }
  return "";
}

function normalizeTimelineEntry(entry) {
  const slots = Array.isArray(entry?.slots) ? entry.slots : [];
  const castLibrary = Array.isArray(entry?.castLibrary)
    ? entry.castLibrary
    : [];
  const updatedAt = entry?.updatedAt || new Date().toISOString();
  return { slots, castLibrary, updatedAt };
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

  if (url.pathname === "/api/uploads/status") {
    if (req.method === "GET") {
      const status = getBunnyStorageStatus();
      sendJson(res, 200, status);
      return;
    }
    methodNotAllowed(res);
    return;
  }

  if (url.pathname === "/api/uploads") {
    if (req.method === "POST") {
      try {
        const payload = await readJsonBody(req);
        const base64 = extractBase64Payload(payload?.data);
        if (!base64) {
          throw new BunnyStorageError("Yüklenecek dosya verisi bulunamadı", 400);
        }
        let buffer;
        try {
          buffer = Buffer.from(base64, "base64");
        } catch {
          throw new BunnyStorageError("Dosya verisi çözümlenemedi", 400);
        }
        if (!buffer || !buffer.length) {
          throw new BunnyStorageError("Geçerli dosya verisi bulunamadı", 400);
        }
        const folder = safeString(payload?.folder);
        const fileName = safeString(payload?.fileName);
        const explicitPath = safeString(payload?.path);
        const extension = safeString(payload?.extension) ||
          guessExtension(payload?.contentType, fileName);
        const uploadPath = explicitPath
          ? explicitPath
          : createStoragePath({
              folder: folder || undefined,
              fileName: fileName || undefined,
              extension: extension || undefined,
            });
        const result = await uploadBufferToBunny(
          uploadPath,
          buffer,
          safeString(payload?.contentType) || "application/octet-stream"
        );
        sendJson(res, 201, result);
      } catch (error) {
        console.error("Dosya yüklenirken hata", error);
        if (error instanceof BunnyStorageError) {
          sendJson(res, error.statusCode ?? 500, { error: error.message });
          return;
        }
        sendJson(res, 500, { error: "Dosya yüklenemedi" });
      }
      return;
    }

    if (req.method === "DELETE") {
      try {
        const target = safeString(url.searchParams.get("path"));
        if (!target) {
          throw new BunnyStorageError("Silinecek dosya yolu belirtilmedi", 400);
        }
        await deleteFromBunny(target);
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        });
        res.end();
      } catch (error) {
        console.error("Dosya silinirken hata", error);
        if (error instanceof BunnyStorageError) {
          sendJson(res, error.statusCode ?? 500, { error: error.message });
          return;
        }
        sendJson(res, 500, { error: "Dosya silinemedi" });
      }
      return;
    }

    methodNotAllowed(res);
    return;
  }

  if (url.pathname === "/api/casts") {
    if (req.method === "GET") {
      const store = await readStore();
      sendJson(res, 200, { casts: store.casts });
      return;
    }

    if (req.method === "POST") {
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
      return;
    }

    methodNotAllowed(res);
    return;
  }

  if (url.pathname === "/api/video-library") {
    if (req.method === "GET") {
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
      return;
    }

    if (req.method === "POST") {
      try {
        const payload = await readJsonBody(req);
        const store = await readStore();
        const existing = store.videoLibrary || {};
        const { id, entry } = createVideoLibraryEntry(
          payload,
          existing,
          store.groups
        );
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
      return;
    }

    methodNotAllowed(res);
    return;
  }

  const libraryMatch = url.pathname.match(/^\/api\/video-library\/(.+)$/);
  if (libraryMatch) {
    const videoId = decodeURIComponent(libraryMatch[1]);

    if (req.method === "DELETE") {
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

  const detailsMatch = url.pathname.match(/^\/api\/video-details\/(.+)$/);
  if (detailsMatch) {
    const videoId = decodeURIComponent(detailsMatch[1]);

    if (req.method === "GET") {
      const store = await readStore();
      const entry = store.videoDetails?.[videoId];
      if (!entry) {
        notFound(res);
        return;
      }
      sendJson(res, 200, normalizeVideoDetailsEntry(entry));
      return;
    }

    if (req.method === "POST") {
      try {
        const payload = await readJsonBody(req);
        const store = await readStore();
        const updatedEntry = upsertVideoDetailsEntry(
          videoId,
          payload,
          store.videoDetails
        );
        await writeStore({
          videos: store.videos,
          casts: store.casts,
          videoLibrary: store.videoLibrary,
          videoDetails: {
            ...store.videoDetails,
            [videoId]: updatedEntry,
          },
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
      return;
    }

    methodNotAllowed(res);
    return;
  }

  if (url.pathname === "/api/timelines" && req.method === "GET") {
    const store = await readStore();
    const videos = Object.entries(store.videos).map(([videoId, entry]) => ({
      videoId,
      ...normalizeTimelineEntry(entry),
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
      sendJson(res, 200, normalizeTimelineEntry(entry));
      return;
    }

    if (req.method === "POST") {
      try {
        const payload = await readJsonBody(req);
        const normalized = normalizeTimelineEntry(payload);
        const store = await readStore();
        await writeStore({
          videos: {
            ...store.videos,
            [videoId]: normalized,
          },
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
      return;
    }

    methodNotAllowed(res);
    return;
  }

  if (url.pathname === "/api/groups") {
    if (req.method === "GET") {
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
      return;
    }

    if (req.method === "POST") {
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
      return;
    }

    methodNotAllowed(res);
    return;
  }

  notFound(res);
});

server.listen(PORT, () => {
  console.log(
    `Timeline server listening on http://localhost:${PORT}/api (timelines, casts, video-library, video-details, groups, uploads)`
  );
});