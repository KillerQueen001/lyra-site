const QUALITY_SUFFIX_RE = /_(\d{3,4})$/;

export const USE_SINGLE_MP4 = import.meta.env.VITE_USE_SINGLE_MP4 !== "0";

function parseVideoId(id) {
  if (id == null) return null;
  let raw = `${id}`.trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    return { type: "url", value: raw };
  }

  if (raw.startsWith("/videos/")) {
    raw = raw.slice("/videos/".length);
  } else if (raw.startsWith("/")) {
    return { type: "absolute", value: raw };
  } else if (raw.startsWith("videos/")) {
    raw = raw.slice("videos/".length);
  }

  const dotIndex = raw.lastIndexOf(".");
  const ext = dotIndex !== -1 ? raw.slice(dotIndex) : ".mp4";
  const base = dotIndex !== -1 ? raw.slice(0, dotIndex) : raw;

  const match = base.match(QUALITY_SUFFIX_RE);
  const baseWithoutQuality = match ? base.slice(0, -match[0].length) : base;
  const qualityFromName = match ? match[1] : "";

  return {
    type: "relative",
    base,
    ext,
    baseWithoutQuality,
    qualityFromName,
  };
}

function joinVideosPath(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/videos/")) return path;
  if (path.startsWith("/")) return `/videos${path}`;
  return `/videos/${path}`;
}

export function resolveVideoSrc(id, quality = "720") {
  const parsed = parseVideoId(id);
  if (!parsed) return "";
  if (parsed.type === "url" || parsed.type === "absolute") {
    return parsed.value;
  }

  const { base, ext, baseWithoutQuality, qualityFromName } = parsed;

  if (USE_SINGLE_MP4) {
    return joinVideosPath(`${base}${ext}`);
  }

  const desired = quality || qualityFromName;

  if (qualityFromName) {
    if (!desired || desired === qualityFromName) {
      return joinVideosPath(`${base}${ext}`);
    }
    return joinVideosPath(`${baseWithoutQuality}_${desired}${ext}`);
  }

  if (!desired) {
    return joinVideosPath(`${base}${ext}`);
  }

  return joinVideosPath(`${base}_${desired}${ext}`);
}

export function resolveSingleVideo(id) {
  const parsed = parseVideoId(id);
  if (!parsed) return "";
  if (parsed.type === "url" || parsed.type === "absolute") {
    return parsed.value;
  }

  return joinVideosPath(`${parsed.base}${parsed.ext}`);
}

export function resolveVideoCandidates(id, quality, fallbackQualities = []) {
  const parsed = parseVideoId(id);
  if (!parsed) return [];
  if (parsed.type === "url" || parsed.type === "absolute") {
    return [parsed.value];
  }

  const { base, ext, baseWithoutQuality, qualityFromName } = parsed;
  const candidates = [];

  const push = (path) => {
    const full = joinVideosPath(path);
    if (!candidates.includes(full)) {
      candidates.push(full);
    }
  };

  if (USE_SINGLE_MP4) {
    push(`${base}${ext}`);
  }

  const list = [quality, ...fallbackQualities].filter(Boolean);

  for (const q of list) {
    if (!q) continue;
    if (qualityFromName && q === qualityFromName) {
      push(`${base}${ext}`);
    } else if (qualityFromName) {
      push(`${baseWithoutQuality}_${q}${ext}`);
    } else {
      push(`${base}_${q}${ext}`);
    }
  }

  if (!USE_SINGLE_MP4) {
    push(`${base}${ext}`);
  }

  return candidates;
}