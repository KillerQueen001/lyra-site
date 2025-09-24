import { getVideoEntry } from "../data/videoLibrary";

const QUALITY_SUFFIX_RE = /_(\d{3,4})$/;

export const USE_SINGLE_MP4 = import.meta.env.VITE_USE_SINGLE_MP4 !== "0";

export function isHlsSource(src) {
  if (!src) return false;
  return /\.m3u8(\?.*)?$/i.test(src);
}

function pickFromLibrary(id, quality) {
  const entry = getVideoEntry(id);
  if (!entry) return null;

  const { files, stream, url, defaultQuality } = entry;

  if (files) {
    if (quality && files[quality]) return files[quality];
    if (defaultQuality && files[defaultQuality]) return files[defaultQuality];

    const single = files.single || files.default;
    if (single) return single;

    const numericKeys = Object.keys(files).filter((key) => /^\d{3,4}$/.test(key));
    numericKeys.sort((a, b) => Number(b) - Number(a));
    for (const key of numericKeys) {
      const value = files[key];
      if (value) return value;
    }

    const first = Object.values(files).find(Boolean);
    if (first) return first;
  }

  if (stream) return stream;
  if (url) return url;
  return null;
}


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
  const librarySrc = pickFromLibrary(id, quality);
  if (librarySrc) return librarySrc;

  const parsed = parseVideoId(id);
  if (!parsed) return "";
  if (parsed.type === "url" || parsed.type === "absolute") {
    return parsed.value;
  }

  const { base, ext, baseWithoutQuality, qualityFromName } = parsed;
  const normalizedBase = baseWithoutQuality || base;

  if (USE_SINGLE_MP4) {
    return joinVideosPath(`${normalizedBase}${ext}`);
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
  const entrySrc = pickFromLibrary(id);
  if (entrySrc) return entrySrc;

  const parsed = parseVideoId(id);
  if (!parsed) return "";
  if (parsed.type === "url" || parsed.type === "absolute") {
    return parsed.value;
  }

  const { base, baseWithoutQuality, ext } = parsed;
  const normalizedBase = baseWithoutQuality || base;

  return joinVideosPath(`${normalizedBase}${ext}`);
}

export function resolveVideoCandidates(id, quality, fallbackQualities = []) {
  const entry = getVideoEntry(id);
  if (entry) {
    const { files, stream, url } = entry;
    const list = [];
    const push = (value) => {
      if (value && !list.includes(value)) {
        list.push(value);
      }
    };

    if (files) {
      const keys = [quality, ...(fallbackQualities || [])].filter(Boolean);
      for (const key of keys) {
        if (files[key]) push(files[key]);
      }
      if (files.single) push(files.single);
      if (files.default) push(files.default);
      for (const value of Object.values(files)) {
        push(value);
      }
    }
    if (stream) push(stream);
    if (url) push(url);
    if (list.length) return list;
  }


  const parsed = parseVideoId(id);
  if (!parsed) return [];
  if (parsed.type === "url" || parsed.type === "absolute") {
    return [parsed.value];
  }

  const { base, ext, baseWithoutQuality, qualityFromName } = parsed;
  const normalizedBase = baseWithoutQuality || base;
  const candidates = [];

  const push = (path) => {
    const full = joinVideosPath(path);
    if (!candidates.includes(full)) {
      candidates.push(full);
    }
  };

  if (USE_SINGLE_MP4) {
      push(`${normalizedBase}${ext}`);
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