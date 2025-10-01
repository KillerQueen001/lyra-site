/* eslint-env node */

import { createServer } from "http";
import { access, readFile, writeFile } from "fs/promises";
import { constants } from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

async function ensureStoreFile() {
  try {
    await access(DATA_PATH, constants.F_OK);
  } catch {
    await writeFile(DATA_PATH, JSON.stringify({ videos: {} }, null, 2), "utf8");
  }
}

async function readStore() {
  await ensureStoreFile();
  const raw = await readFile(DATA_PATH, "utf8");
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { videos: {} };
    if (!parsed.videos || typeof parsed.videos !== "object") {
      return { videos: {} };
    }
    return { videos: { ...parsed.videos } };
  } catch (error) {
    console.warn("timelineStore JSON parse failed, resetting file", error);
    await writeFile(DATA_PATH, JSON.stringify({ videos: {} }, null, 2), "utf8");
    return { videos: {} };
  }
}

async function writeStore(store) {
  await writeFile(DATA_PATH, JSON.stringify(store, null, 2), "utf8");
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
  console.log(`Timeline server listening on http://localhost:${PORT}/api/timelines`);
});