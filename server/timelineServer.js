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
  BunnyStorageError,
  isBunnyConfigured,
} from "./bunnyStorage.js";
import { safeString } from "./utils.js";
import { s } from "framer-motion/client";

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
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS,HEAD",
    "Access-Control-Allow-Headers": "Content-Type,Accept",
  });
  res.end(JSON.stringify(data));
}

function sendEmpty(res, statusCode) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS,HEAD",
    "Access-Control-Allow-Headers": "Content-Type,Accept",
  });
  res.end();
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

const MAX_UPLOAD_SIZE = 15 * 1024 * 1024; // 15 MB
const MAX_REQUEST_SIZE = MAX_UPLOAD_SIZE + 64 * 1024;
const MULTIPART_BOUNDARY_REGEX = /boundary=(?:"?)([^";]+)(?:"?)/i;
const DOUBLE_CRLF_BUFFER = Buffer.from("\r\n\r\n");
const CRLF_BUFFER = Buffer.from("\r\n");
const DASH_CODE = "-".charCodeAt(0);

function createHttpError(statusCode, reason, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.reason = reason;
  return error;
}

function readRequestBuffer(req, limit = MAX_REQUEST_SIZE) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let finished = false;

    function done(error, value) {
      if (finished) return;
      finished = true;
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    }

    req.on("data", (chunk) => {
      if (finished) return;
      total += chunk.length;
      if (total > limit) {
        const error = createHttpError(
          413,
          "PAYLOAD_TOO_LARGE",
          "Dosya boyutu sınırı aşıldı (maksimum 15 MB)."
        );
        req.destroy(error);
        done(error);
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (finished) return;
      done(null, Buffer.concat(chunks));
    });

    req.on("error", (error) => {
      done(error);
    });
  });
}

function extractBoundary(contentType) {
  const match = MULTIPART_BOUNDARY_REGEX.exec(safeString(contentType));
  if (!match) return "";
  return safeString(match[1]);
}

function trimTrailingCrlf(buffer) {
  let end = buffer.length;
  while (
    end >= 2 &&
    buffer[end - 2] === CRLF_BUFFER[0] &&
    buffer[end - 1] === CRLF_BUFFER[1]
  ) {
    end -= 2;
  }
  return buffer.slice(0, end);
}

function parsePart(buffer) {
  const headerEnd = buffer.indexOf(DOUBLE_CRLF_BUFFER);
  if (headerEnd === -1) return null;
  const headerSection = buffer.slice(0, headerEnd).toString("utf8");
  const body = buffer.slice(headerEnd + DOUBLE_CRLF_BUFFER.length);
  const headers = headerSection
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headerMap = new Map();
  for (const line of headers) {
    const colonIndex = line.indexOf(":");
    if (colonIndex <= 0) continue;
    const name = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();
    headerMap.set(name, value);
  }

  const disposition = headerMap.get("content-disposition");
  if (!disposition) return null;
  const params = {};
  for (const part of disposition.split(";")) {
    const section = part.trim();
    if (!section) continue;
    const equalsIndex = section.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = section.slice(0, equalsIndex).trim();
    let value = section.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    params[key] = value;
  }

  const name = safeString(params.name);
  const filename = safeString(params.filename);
  const contentType = safeString(headerMap.get("content-type"));
  return { name, filename, contentType, data: body };
}

async function parseMultipartForm(req, limit = MAX_REQUEST_SIZE) {
  const contentType = req.headers?.["content-type"] || req.headers?.["Content-Type"];
  const boundary = extractBoundary(contentType);
  if (!boundary) {
    throw createHttpError(
      400,
      "BAD_REQUEST",
      "multipart/form-data içeriği bekleniyor."
    );
  }
  const boundaryMarker = Buffer.from(`--${boundary}`);
  const closingMarker = Buffer.from(`--${boundary}--`);
  const body = await readRequestBuffer(req, limit);
  const fields = {};
  const files = {};
  let position = 0;

  while (position < body.length) {
    const boundaryIndex = body.indexOf(boundaryMarker, position);
    if (boundaryIndex === -1) {
      break;
    }
    position = boundaryIndex + boundaryMarker.length;

    const isClosing =
      position + 1 < body.length &&
      body[position] === DASH_CODE &&
      body[position + 1] === DASH_CODE;
    if (isClosing) {
      break;
    }

    if (
      position + 1 < body.length &&
      body[position] === CRLF_BUFFER[0] &&
      body[position + 1] === CRLF_BUFFER[1]
    ) {
      position += 2;
    }

    let nextBoundaryIndex = body.indexOf(boundaryMarker, position);
    const closingIndex = body.indexOf(closingMarker, position);
    if (closingIndex !== -1 && (closingIndex < nextBoundaryIndex || nextBoundaryIndex === -1)) {
      nextBoundaryIndex = closingIndex;
    }
    const endIndex = nextBoundaryIndex === -1 ? body.length : nextBoundaryIndex;
    const partBuffer = trimTrailingCrlf(body.slice(position, endIndex));
    const part = parsePart(partBuffer);
    if (part && part.name) {
      if (part.filename) {
        files[part.name] = {
          fileName: part.filename,
          mimeType: part.contentType,
          buffer: part.data,
        };
      } else {
        fields[part.name] = part.data.toString("utf8");
      }
    }
    position = endIndex;
  }

  return { fields, files };
}

async function readUploadRequest(req) {
  const { fields, files } = await parseMultipartForm(req);
  const path = safeString(fields.path);
  const file = files.file;
  if (!file) {
    return { path, file: null };
  }
  return {
    path,
    file: {
      buffer: file.buffer,
      fileName: safeString(file.fileName),
      mimeType: safeString(file.mimeType),
    },
  };
}

function handleUploadError(res, error) {
  const statusCode = Number.isInteger(error?.statusCode)
    ? error.statusCode
    : 500;
  let reason = safeString(error?.reason);
  let message = safeString(error?.message);

  if (error instanceof BunnyStorageError) {
    if (statusCode === 503) {
      reason = "BUNNY_STORAGE_NOT_CONFIGURED";
      if (!message) {
        message = "Bunny Storage yapılandırması eksik.";
      }
    } else {
      reason = "BUNNY_PUT_FAILED";
      if (!message) {
        message = "Bunny Storage yüklemesi başarısız oldu.";
      }
    }
  }

  if (!reason) {
    if (statusCode === 400) {
      reason = "BAD_REQUEST";
      if (!message) {
        message = "Geçersiz istek gönderildi.";
      }
    } else if (statusCode === 413) {
      reason = "PAYLOAD_TOO_LARGE";
      if (!message) {
        message = "Dosya boyutu sınırı aşıldı.";
      }
    } else if (statusCode === 503) {
      reason = "SERVER_UNAVAILABLE";
      if (!message) {
        message = "Servis geçici olarak kullanılamıyor.";
      }
    } else {
      reason = "SERVER_ERROR";
      if (!message) {
        message = "Dosya yüklenemedi.";
      }
    }
  }

  sendJson(res, statusCode, {
    ok: false,
    reason,
    message,
  });
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

  if (url.pathname === "/api/media/upload-image") {
    if (req.method === "HEAD") {
      const configured = isBunnyConfigured();
      if (!configured) {
        sendEmpty(res, 503);
        return;
      }
      sendEmpty(res, 200);
      return;
    }
    if (req.method === "GET") {
      const configured = isBunnyConfigured();
      if (!configured) {
        sendJson(res, 503, {
          ok: false,
          reason: "BUNNY_STORAGE_NOT_CONFIGURED",
          message: "Bunny Storage yapılandırması eksik.",
        });
        return;
      }
      const status = getBunnyStorageStatus();
      sendJson(res, 200, {
        ok: true,
        available: true,
        cdnBaseUrl: status.cdnBaseUrl || null,
      });
      return;
    }

    if (req.method === "POST") {
      try {
        const { path, file } = await readUploadRequest(req);
        if (!file?.buffer?.length || !path) {
          throw createHttpError(
            400,
            "BAD_REQUEST",
            "Dosya ve hedef yolu zorunludur."
          );
        }
        const result = await uploadBufferToBunny(
          path,
          file.buffer,
          file.mimeType || "application/octet-stream"
        );
        sendJson(res, 201, {
          ok: true,
          path: result.path,
          cdnUrl: result.cdnUrl || result.url || null,
          cdnBaseUrl: result.cdnBaseUrl || null,
        });
      } catch (error) {
        if (
          !(error instanceof BunnyStorageError) &&
          (error?.statusCode ?? 500) >= 500
        ) {
          console.error("Bunny yükleme hatası", error);
        }
        handleUploadError(res, error);
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