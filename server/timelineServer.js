/* eslint-env node */

import { createServer } from "http";
import { readStore, writeStore } from "./store.js";
import { createCastEntry } from "./casts.js";
import {
  listVideoLibraryEntries,
  createVideoLibraryEntry,
} from "./videoLibrary.js";
import {
  normalizeVideoDetailsEntry,
  upsertVideoDetailsEntry,
} from "./videoDetails.js";

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
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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
        const { id, entry } = createVideoLibraryEntry(payload, existing);
        await writeStore({
          videos: store.videos,
          casts: store.casts,
          videoLibrary: { ...existing, [id]: entry },
          videoDetails: store.videoDetails,
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

  notFound(res);
});

server.listen(PORT, () => {
  console.log(
    `Timeline server listening on http://localhost:${PORT}/api (timelines, casts, video-library, video-details)`
  );
});