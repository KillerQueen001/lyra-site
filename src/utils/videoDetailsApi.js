import { buildApiUrl } from "./apiClient";

function sanitizeThumbnail(thumbnail) {
  if (!thumbnail || typeof thumbnail !== "object") {
    return { src: "", name: "" };
  }
  return {
    src: typeof thumbnail.src === "string" ? thumbnail.src : "",
    name: typeof thumbnail.name === "string" ? thumbnail.name : "",
  };
}

function sanitizeVideoDetails(details = {}) {
  const title = typeof details.title === "string" ? details.title : "";
  const description =
    typeof details.description === "string" ? details.description : "";
  const ageRating = typeof details.ageRating === "string"
    ? details.ageRating
    : "all";
  const thumbnail = sanitizeThumbnail(details.thumbnail);
  const updatedAt =
    typeof details.updatedAt === "string" ? details.updatedAt : null;

  return {
    title,
    description,
    ageRating,
    thumbnail,
    updatedAt,
  };
}

export async function fetchAllVideoDetails() {
  const url = buildApiUrl("/video-details");
  if (!url || typeof fetch === "undefined") return {};
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return {};
    const data = await response.json();
    if (!data || typeof data !== "object") return {};
    const entries =
      data.videos && typeof data.videos === "object" ? data.videos : {};
    return Object.fromEntries(
      Object.entries(entries).map(([videoId, entry]) => [
        videoId,
        sanitizeVideoDetails(entry),
      ])
    );
  } catch (error) {
    console.warn("Video detayları alınamadı:", error);
    return {};
  }
}

export async function fetchVideoDetails(videoId) {
  if (!videoId) return null;
  const url = buildApiUrl(`/video-details/${encodeURIComponent(videoId)}`);
  if (!url || typeof fetch === "undefined") return null;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data || typeof data !== "object") return null;
    return sanitizeVideoDetails(data);
  } catch (error) {
    console.warn("Video detayları yüklenemedi:", error);
    return null;
  }
}

export async function saveVideoDetails(videoId, details) {
  if (!videoId) return { ok: false };
  const url = buildApiUrl(`/video-details/${encodeURIComponent(videoId)}`);
  if (!url || typeof fetch === "undefined") {
    return { ok: false };
  }
  const payload = sanitizeVideoDetails(details);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return { ok: false, status: response.status };
    }
    const data = await response.json();
    return { ok: true, data: sanitizeVideoDetails(data) };
  } catch (error) {
    console.warn("Video detayları kaydedilemedi:", error);
    return { ok: false, error };
  }
}
