import { videoLibrary } from "../data/videoLibrary";

function safeText(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

export function getAgeRatingLabel(value) {
  switch (safeText(value)) {
    case "7":
      return "+7";
    case "13":
      return "+13";
    case "16":
      return "+16";
    case "18":
      return "+18";
    case "all":
    default:
      return "Genel İzleyici";
  }
}

function normalizeThumbnail(detailThumbnail, basePoster) {
  const detailSrc = safeText(detailThumbnail?.src);
  const detailName = safeText(detailThumbnail?.name);
  const baseSrc = safeText(basePoster);
  const src = detailSrc || baseSrc;
  const name = detailName || (src ? src.split("/").pop() || "" : "");
  return {
    src,
    name,
    isCustom: Boolean(detailSrc),
  };
}

function mergeVideoEntry(videoId, detailEntry = {}, baseEntry = {}) {
  const title =
    safeText(detailEntry.title) || safeText(baseEntry.title) || videoId;
  const description =
    safeText(detailEntry.description) || safeText(baseEntry.description);
  const ageRatingRaw = safeText(detailEntry.ageRating) || "all";
  const thumbnail = normalizeThumbnail(detailEntry.thumbnail, baseEntry.poster);
  const stream = typeof baseEntry.stream === "string" ? baseEntry.stream : "";
  const files =
    baseEntry.files && typeof baseEntry.files === "object"
      ? { ...baseEntry.files }
      : null;

  return {
    id: videoId,
    title,
    description,
    ageRating: ageRatingRaw,
    ageRatingLabel: getAgeRatingLabel(ageRatingRaw),
    thumbnail,
    poster: thumbnail.src,
    stream,
    files,
    base: baseEntry,
    updatedAt: detailEntry.updatedAt || null,
    hasCustomDetails: Boolean(
      detailEntry.title || detailEntry.description || detailEntry.ageRating
    ),
  };
}

export function buildVideoCatalog(detailsMap = {}) {
  const ids = new Set([
    ...Object.keys(videoLibrary),
    ...Object.keys(detailsMap || {}),
  ]);
  const entries = [];
  ids.forEach((videoId) => {
    const baseEntry = videoLibrary[videoId] || {};
    const detailEntry = detailsMap[videoId] || {};
    entries.push(mergeVideoEntry(videoId, detailEntry, baseEntry));
  });

  entries.sort((a, b) => {
    if (a.updatedAt && b.updatedAt) {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
    if (a.updatedAt) return -1;
    if (b.updatedAt) return 1;
    return a.title.localeCompare(b.title, "tr", { sensitivity: "base" });
  });

  return entries;
}

export function buildVideoCatalogMap(detailsMap = {}) {
  const map = {};
  const ids = new Set([
    ...Object.keys(videoLibrary),
    ...Object.keys(detailsMap || {}),
  ]);
  ids.forEach((videoId) => {
    const baseEntry = videoLibrary[videoId] || {};
    const detailEntry = detailsMap[videoId] || {};
    map[videoId] = mergeVideoEntry(videoId, detailEntry, baseEntry);
  });
  return map;
}

export function resolveVideoSourceForCatalogEntry(entry) {
  if (!entry) return "/videos/sample.mp4";
  if (entry.stream && entry.stream.endsWith(".mp4")) {
    return entry.stream;
  }
  if (entry.files) {
    return (
      entry.files.single ||
      entry.files["1080"] ||
      entry.files["720"] ||
      entry.files["480"] ||
      "/videos/sample.mp4"
    );
  }
  return "/videos/sample.mp4";
}