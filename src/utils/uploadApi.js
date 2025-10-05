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

const DEFAULT_STATUS = { available: false, cdnBaseUrl: "" };

let cachedStatus = null;
let statusPromise = null;

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

function extractStatus(raw) {
  if (!raw || typeof raw !== "object") return {};
  const status = {};
  if (Object.prototype.hasOwnProperty.call(raw, "available")) {
    status.available = Boolean(raw.available);
  }
  const candidates = [
    raw.cdnBaseUrl,
    raw.cdnBaseURL,
    raw.cdnBase,
    raw.baseUrl,
    raw.baseURL,
    raw.cdnUrlBase,
  ];
  for (const candidate of candidates) {
    const cleaned = cleanBaseUrl(candidate);
    if (cleaned) {
      status.cdnBaseUrl = cleaned;
      break;
    }
  }
  return status;
}

function mergeStatus(base, update) {
  const next = {
    available: base?.available ?? DEFAULT_STATUS.available,
    cdnBaseUrl: base?.cdnBaseUrl || DEFAULT_STATUS.cdnBaseUrl,
  };
  if (Object.prototype.hasOwnProperty.call(update, "available")) {
    next.available = Boolean(update.available);
  }
  if (update.cdnBaseUrl) {
    next.cdnBaseUrl = cleanBaseUrl(update.cdnBaseUrl);
  }
  return next;
}

function rememberStatus(status) {
  const extracted = extractStatus(status);
  cachedStatus = mergeStatus(cachedStatus || DEFAULT_STATUS, extracted);
  return cachedStatus;
}

async function fetchUploadStatus() {
  const url = buildApiUrl("/uploads/status");
  if (!url || typeof fetch === "undefined") {
    throw new Error("Bunny Storage durumuna ulaşılamadı");
  }
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Bunny Storage durumu alınamadı: ${response.status}`);
  }
  const data = await response.json().catch(() => ({}));
  return rememberStatus(data);
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

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Dosya içeriği okunamadı"));
        return;
      }
      const commaIndex = result.indexOf(",");
      if (commaIndex >= 0) {
        resolve(result.slice(commaIndex + 1));
      } else {
        resolve(result);
      }
    };
    reader.onerror = () => {
      reject(new Error("Dosya okunamadı"));
    };
    reader.readAsDataURL(file);
  });
}

function getExtension(file, explicitExtension) {
  if (explicitExtension) {
    return explicitExtension.replace(/[^a-z0-9]/gi, "").toLowerCase();
  }
  if (file?.type && MIME_EXTENSION_MAP[file.type]) {
    return MIME_EXTENSION_MAP[file.type];
  }
  const name = typeof file?.name === "string" ? file.name.toLowerCase() : "";
  const nameParts = name.split(".");
  if (nameParts.length > 1) {
    return nameParts.pop();
  }
  return "";
}

function buildUploadPayload(file, options = {}) {
  if (!file) {
    throw new Error("Yüklenecek dosya bulunamadı");
  }
  const folder = options.folder || "uploads";
  const fallbackName = slugifyWithFallback(file.name || "dosya", "asset");
  const fileName = options.fileName || fallbackName;
  const extension = getExtension(file, options.extension);
  const contentType = options.contentType || file.type || "application/octet-stream";
  return {
    folder,
    fileName,
    extension,
    contentType,
  };
}

export async function uploadAsset(file, options = {}) {
  const url = buildApiUrl("/uploads");
  if (!url || typeof fetch === "undefined") {
    throw new Error("Yükleme servisine ulaşılamadı");
  }
  let status;
  try {
    status = await loadUploadStatus();
  } catch (error) {
    throw new Error(error.message || "Bunny Storage durumuna ulaşılamadı");
  }
  if (!status?.available) {
    throw new Error(
      "Bunny Storage yapılandırması eksik görünüyor. Lütfen .env ayarlarını kontrol edin."
    );
  }
  const payload = buildUploadPayload(file, options);
  const base64 = await readFileAsBase64(file);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      folder: payload.folder,
      fileName: payload.fileName,
      extension: payload.extension,
      contentType: payload.contentType,
      data: base64,
    }),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Dosya yüklenemedi: ${response.status}`);
  }
  const data = await response.json();
  if (!data || !data.path) {
    throw new Error("Sunucudan geçerli yükleme yanıtı alınamadı");
  }
  const updatedStatus = rememberStatus({
    available: true,
    cdnBaseUrl:
      cleanBaseUrl(data.cdnBaseUrl) || cleanBaseUrl(status?.cdnBaseUrl) || DEFAULT_STATUS.cdnBaseUrl,
  });
  const path = cleanString(data.path);
  const size = typeof data.size === "number" ? data.size : file?.size || 0;
  const responseUrl = cleanString(data.url) || cleanString(data.cdnUrl);
  const cdnBaseUrl = updatedStatus?.cdnBaseUrl || "";
  const finalUrl = responseUrl || (cdnBaseUrl && path ? `${cdnBaseUrl}/${path}` : "");
  return {
    path,
    url: finalUrl,
    cdnUrl: finalUrl || null,
    cdnBaseUrl,
    size,
    contentType: payload.contentType,
  };
}

export async function deleteAsset(path) {
  const sanitizedPath = typeof path === "string" ? path.trim() : "";
  if (!sanitizedPath) {
    throw new Error("Silinecek dosya yolu belirtilmedi");
  }
  const url = buildApiUrl(`/uploads?path=${encodeURIComponent(sanitizedPath)}`);
  if (!url || typeof fetch === "undefined") {
    throw new Error("Yükleme servisine ulaşılamadı");
  }
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok && response.status !== 204) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Dosya silinemedi: ${response.status}`);
  }
  return sanitizedPath;
}