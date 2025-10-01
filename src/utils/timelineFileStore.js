const DEFAULT_BASE_URL =
  (typeof window !== "undefined" &&
    `${window.location.protocol}//${window.location.hostname}:4173/api`)
    || "http://localhost:4173/api";

function resolveBaseUrl() {
  let envUrl;
  try {
    if (typeof import.meta !== "undefined" && import.meta.env) {
      envUrl = import.meta.env.VITE_TIMELINE_API_BASE;
    }
  } catch {
    envUrl = undefined;
  }
  if (typeof envUrl === "string" && envUrl.trim().length > 0) {
    return envUrl.replace(/\/$/, "");
  }
  return DEFAULT_BASE_URL;
}

const API_BASE = resolveBaseUrl();

function buildUrl(path) {
  if (!API_BASE) return null;
  const base = API_BASE.replace(/\/$/, "");
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${safePath}`;
}

function sanitizeTimelinePayload(payload = {}) {
  const slots = Array.isArray(payload.slots) ? payload.slots : [];
  const castLibrary = Array.isArray(payload.castLibrary)
    ? payload.castLibrary
    : [];
  const updatedAt = payload.updatedAt || new Date().toISOString();
  return { slots, castLibrary, updatedAt };
}

export async function fetchTimelineFromFile(videoId) {
  if (!videoId) return null;
  const url = buildUrl(`/timelines/${encodeURIComponent(videoId)}`);
  if (!url || typeof fetch === "undefined") return null;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data || typeof data !== "object") return null;
    return sanitizeTimelinePayload(data);
  } catch (error) {
    console.warn("Uzak timeline okuma hatası:", error);
    return null;
  }
}

export async function listTimelinesFromFile() {
  const url = buildUrl("/timelines");
  if (!url || typeof fetch === "undefined") return null;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data || typeof data !== "object") return null;
    const videos = Array.isArray(data.videos)
      ? data.videos
      : Object.entries(data.videos || {}).map(([videoId, entry]) => ({
          videoId,
          ...sanitizeTimelinePayload(entry),
        }));
    return videos.map((item) => ({
      videoId: item.videoId,
      slots: item.slots,
      castLibrary: item.castLibrary,
      updatedAt: item.updatedAt,
    }));
  } catch (error) {
    console.warn("Uzak timeline listeleme hatası:", error);
    return null;
  }
}

function triggerDownload(videoId, payload) {
  if (typeof window === "undefined") return false;
  try {
    const snapshot = JSON.stringify(
      {
        videoId,
        ...sanitizeTimelinePayload(payload),
      },
      null,
      2
    );
    const blob = new Blob([snapshot], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .replace("Z", "");
    anchor.href = url;
    anchor.download = `timeline-${videoId}-${timestamp}.json`;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.warn("Timeline dosyası indirilirken hata oluştu:", error);
    return false;
  }
}

export async function persistTimelineToFile(videoId, payload) {
  if (!videoId) return { ok: false };
  const url = buildUrl(`/timelines/${encodeURIComponent(videoId)}`);
  const sanitized = sanitizeTimelinePayload(payload);
  if (!url || typeof fetch === "undefined") {
    const downloaded = triggerDownload(videoId, sanitized);
    return { ok: downloaded, downloaded };
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sanitized),
    });
    if (!response.ok) {
      throw new Error(`Zaman çizelgesi kaydedilemedi: ${response.status}`);
    }
    const data = await response.json();
    return { ok: true, data: sanitizeTimelinePayload(data) };
  } catch (error) {
    console.warn("Uzak timeline kaydetme hatası:", error);
    const downloaded = triggerDownload(videoId, sanitized);
    return { ok: false, error, downloaded };
  }
}