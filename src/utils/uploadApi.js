import { buildApiUrl } from "./apiClient";
import { slugifyWithFallback } from "./slugify";

const MIME_EXTENSION_MAP = {
  "image/png": "png",
  "image/x-png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

const DEFAULT_STATUS = {
  available: false,
  cdnBaseUrl: "",
  reason: "",
  message: "",
};

let cachedStatus = null;
let statusPromise = null;
let frontendCdnBase = undefined;

function cleanString(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed;
}

function cleanBaseUrl(value) {
  const str = cleanString(value);
  if (!str) return "";
  return str.replace(/\/$/, "");
}

function getFrontendCdnBase() {
  if (frontendCdnBase !== undefined) {
    return frontendCdnBase;
  }
  let host = "";
  try {
    if (typeof import.meta !== "undefined" && import.meta.env) {
      host = cleanString(import.meta.env.VITE_CDN_HOST);
    }
  } catch {
    host = "";
  }
  if (!host) {
    frontendCdnBase = "";
    return frontendCdnBase;
  }
  const normalized = host
    .replace(/^(https?:)?\/?\//, "")
    .replace(/\/$/, "");
  frontendCdnBase = normalized ? `https://${normalized}` : "";
  return frontendCdnBase;
}

function mergeStatus(base, update) {
  const next = {
    available: base?.available ?? DEFAULT_STATUS.available,
    cdnBaseUrl: base?.cdnBaseUrl || DEFAULT_STATUS.cdnBaseUrl,
    reason: base?.reason || DEFAULT_STATUS.reason,
    message: base?.message || DEFAULT_STATUS.message,
  };
  if (Object.prototype.hasOwnProperty.call(update, "available")) {
    next.available = Boolean(update.available);
  }
  if (update.cdnBaseUrl) {
    next.cdnBaseUrl = cleanBaseUrl(update.cdnBaseUrl);
  }
    if (Object.prototype.hasOwnProperty.call(update, "reason")) {
    next.reason = cleanString(update.reason);
  }
  if (Object.prototype.hasOwnProperty.call(update, "message")) {
    next.message = cleanString(update.message);
  }
  if (!next.cdnBaseUrl) {
    next.cdnBaseUrl = cleanBaseUrl(getFrontendCdnBase());
  }
  return next;
}

function rememberStatus(update) {
  cachedStatus = mergeStatus(cachedStatus || DEFAULT_STATUS, update);
  return cachedStatus;
}

async function fetchUploadStatus() {
  const url = buildApiUrl("/media/upload-image");
  if (!url || typeof fetch === "undefined") {
    throw new Error("Bunny Storage durumuna ulaşılamadı");
  }
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
    const data = await response.json().catch(() => ({}));
  if (response.status === 503) {
    return rememberStatus({
      available: false,
      cdnBaseUrl: data.cdnBaseUrl || data.cdnBaseURL || "",
      reason: data.reason || "BUNNY_STORAGE_NOT_CONFIGURED",
      message:
        data.message ||
        "Bunny Storage yapılandırması eksik görünüyor. Lütfen sunucu .env ayarlarını doğrulayın.",
    });
  }
  if (!response.ok) {
    throw new Error(
      data?.message || data?.error || `Bunny Storage durumu alınamadı: ${response.status}`
    );
  }
  return rememberStatus({
    available: true,
    cdnBaseUrl: data.cdnBaseUrl || data.cdnBaseURL || "",
    reason: "",
    message: "",
  });
}

export function getCachedUploadStatus() {
  return cachedStatus;
}

export async function loadUploadStatus(options = {}) {
  const { force = false } = options;
  if (force) {
    cachedStatus = null;
    statusPromise = null;
  }
  if (!force && cachedStatus) {
    return cachedStatus;
  }
  if (!force && statusPromise) {
    return statusPromise;
  }
  const promise = fetchUploadStatus()
    .then((status) => {
      statusPromise = null;
      return status;
    })
    .catch((error) => {
      statusPromise = null;
      throw error;
    });
  statusPromise = promise;
  return promise;
}

export function refreshUploadStatus() {
  return loadUploadStatus({ force: true });
}

function getExtension(file, override) {
  const explicit = cleanString(override).toLowerCase();
  if (explicit) {
    return explicit.replace(/[^a-z0-9]/g, "");
  }
  const type = cleanString(file?.type).toLowerCase();
  if (type && MIME_EXTENSION_MAP[type]) {
    return MIME_EXTENSION_MAP[type];
  }
  const name = cleanString(file?.name).toLowerCase();
  if (name) {
    const parts = name.split(".");
    if (parts.length > 1) {
      return parts.pop() || "";
    }
  }
  return "";
}

function sanitizeFolder(value) {
  const raw = cleanString(value).replace(/\\/g, "/");
  if (!raw) return "";
  return raw
    .split("/")
    .map((segment) => slugifyWithFallback(segment, ""))
    .filter(Boolean)
    .join("/");
}

function sanitizeFileName(value, fallback) {
  const base = slugifyWithFallback(value, fallback || "asset");
  return base || fallback || "asset";
}

function buildUploadPath(file, options = {}) {
  const explicit = cleanString(options.path).replace(/^\/+/, "");
  if (explicit) {
    return explicit.replace(/\\/g, "/");
  }
  const folder = sanitizeFolder(options.folder);
  const fallbackName = slugifyWithFallback(file?.name, "asset");
  const fileName = sanitizeFileName(options.fileName, fallbackName);
  const extension = getExtension(file, options.extension);
  const finalName = extension ? `${fileName}.${extension}` : fileName;
  return folder ? `${folder}/${finalName}` : finalName;
}

function ensureUploadEndpoint() {
  const url = buildApiUrl("/media/upload-image");
  if (!url) {
    throw new Error("Yükleme servisine ulaşılamadı");
  }
  return url;
}

function joinUrl(base, path) {
  const normalizedBase = cleanBaseUrl(base);
  const normalizedPath = cleanString(path).replace(/^\/+/, "");
  if (!normalizedBase || !normalizedPath) return "";
  return `${normalizedBase}/${normalizedPath}`;
}

export async function uploadAsset(file, options = {}) {
  if (!file) {
    throw new Error("Yüklenecek dosya bulunamadı");
  }
  let status;
  try {
    status = await loadUploadStatus();
  } catch (error) {
    throw new Error(error.message || "Bunny Storage durumu alınamadı");
  }
  if (!status?.available) {
    throw new Error(
      status?.message ||
        "Bunny Storage yapılandırması eksik görünüyor. Lütfen .env ayarlarını kontrol edin."
    );
  }
  const path = buildUploadPath(file, options);
  if (!path) {
    throw new Error("Yüklenecek dosya yolu oluşturulamadı");
  }
  const url = ensureUploadEndpoint();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("path", path);
  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 503) {
    rememberStatus({
      available: false,
      cdnBaseUrl: data.cdnBaseUrl || data.cdnBaseURL || "",
      reason: data.reason || "BUNNY_STORAGE_NOT_CONFIGURED",
      message:
        data.message ||
        "Bunny Storage yapılandırması eksik görünüyor. Lütfen sunucu ayarlarını doğrulayın.",
    });
    throw new Error(
      data.message || "Bunny Storage yapılandırması eksik görünüyor. Lütfen ayarları doğrulayın."
    );
  }
  if (!response.ok || data?.ok === false) {
    const message =
      data?.message ||
      data?.error ||
      `Dosya yüklenemedi: ${response.status}`;
    throw new Error(message);
  }
  const updatedStatus = rememberStatus({
    available: true,
    cdnBaseUrl: data.cdnBaseUrl || data.cdnBaseURL || "",
    reason: "",
    message: "",
  });
  const cdnBaseUrl =
    cleanBaseUrl(data.cdnBaseUrl || data.cdnBaseURL || updatedStatus?.cdnBaseUrl) || "";
  const explicitUrl = cleanString(data.cdnUrl || data.url);
  const finalUrl = explicitUrl || joinUrl(cdnBaseUrl, path);
  return {
    path,
    url: finalUrl,
    cdnUrl: finalUrl || null,
    cdnBaseUrl,
    size: typeof file.size === "number" ? file.size : undefined,
    contentType: file.type || "application/octet-stream",
  };
}

