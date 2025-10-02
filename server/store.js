import { access, readFile, writeFile } from "fs/promises";
import { constants } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeCastEntry } from "./casts.js";
import { sanitizeVideoLibraryMap } from "./videoLibrary.js";
import { sanitizeVideoDetailsMap } from "./videoDetails.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH = path.join(__dirname, "timelineStore.json");

const DEFAULT_STORE = {
  videos: {},
  casts: [],
  videoLibrary: {},
  videoDetails: {},
};

export async function ensureStoreFile() {
  try {
    await access(DATA_PATH, constants.F_OK);
  } catch {
    await writeFile(DATA_PATH, JSON.stringify(DEFAULT_STORE, null, 2), "utf8");
  }
}

function cloneDefaultStore() {
  return {
    videos: {},
    casts: [],
    videoLibrary: {},
    videoDetails: {},
  };
}

export async function readStore() {
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
    const videoLibrary = sanitizeVideoLibraryMap(parsed.videoLibrary);
    const videoDetails = sanitizeVideoDetailsMap(parsed.videoDetails);
    return { videos, casts, videoLibrary, videoDetails };
  } catch (error) {
    console.warn("timelineStore JSON parse failed, resetting file", error);
    await writeFile(DATA_PATH, JSON.stringify(DEFAULT_STORE, null, 2), "utf8");
    return cloneDefaultStore();
  }
}

export async function writeStore(store) {
  const videos =
    store && store.videos && typeof store.videos === "object"
      ? { ...store.videos }
      : {};
  const casts = [];
  const source = Array.isArray(store?.casts) ? store.casts : [];
  for (const entry of source) {
    casts.push(normalizeCastEntry(entry, casts));
  }
  const videoLibrary = sanitizeVideoLibraryMap(store?.videoLibrary);
  const videoDetails = sanitizeVideoDetailsMap(store?.videoDetails);
  await writeFile(
    DATA_PATH,
    JSON.stringify({ videos, casts, videoLibrary, videoDetails }, null, 2),
    "utf8"
  );
}

export { DATA_PATH, DEFAULT_STORE };