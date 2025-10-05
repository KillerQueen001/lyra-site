/* eslint-env node */
import"./env.js"
import process from "node:process";
import { safeString, slugify } from "./utils.js";

const DEFAULT_STORAGE_HOST = "storage.bunnycdn.com";
const STORAGE_PROTOCOL = "https://";

function readEnv(name) {
  if (typeof process === "undefined" || !process.env) {
    return "";
  }
  return safeString(process.env[name]);
}

function sanitizePathSegment(value) {
  const slug = slugify(value);
  if (slug) return slug;
  return value
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function sanitizeFileName(fileName) {
  const name = safeString(fileName);
  if (!name) return "";
  const parts = name.split(".");
  if (parts.length === 1) {
    return sanitizePathSegment(name);
  }
  const extension = sanitizePathSegment(parts.pop() || "");
  const base = sanitizePathSegment(parts.join("."));
  if (!base && !extension) return "";
  if (extension) {
    return `${base || Date.now().toString(36)}.${extension}`;
  }
  return base;
}

function sanitizeRemotePath(path) {
  const raw = safeString(path).replace(/\\/g, "/");
  if (!raw) return "";
  const parts = raw
    .split("/")
    .map((segment) => sanitizePathSegment(segment))
    .filter(Boolean);
  return parts.join("/");
}

function getStorageHost() {
  return readEnv("BUNNY_STORAGE_HOST") || DEFAULT_STORAGE_HOST;
}

function getCdnHost(zone) {
  const fromEnv = readEnv("BUNNY_STORAGE_CDN_HOST") || readEnv("BUNNY_CDN_HOST");
  if (fromEnv) {
    return fromEnv.replace(/^(https?:)?\/?\//, "").replace(/\/$/, "");
  }
  const fallback = safeString(zone);
  if (!fallback) return "";
  return `${fallback}.b-cdn.net`;
}

function getCdnBaseUrl(config) {
  const host = safeString(config?.cdnHost);
  if (!host) return "";
  return `${STORAGE_PROTOCOL}${host.replace(/\/$/, "")}`;
}

function joinCdnBaseWithPath(baseUrl, path) {
  const base = safeString(baseUrl).replace(/\/$/, "");
  const relative = safeString(path).replace(/^\/+/, "");
  if (!base || !relative) return "";
  return `${base}/${relative}`;
}

function resolveConfig() {
  const zone = readEnv("BUNNY_STORAGE_ZONE");
  const apiKey = readEnv("BUNNY_STORAGE_KEY") || readEnv("BUNNY_STORAGE_PASSWORD");
  if (!zone || !apiKey) {
    return null;
  }
  const storageHost = getStorageHost();
  const cdnHost = getCdnHost(zone);
  return {
    zone,
    apiKey,
    storageHost,
    cdnHost,
  };
}

export function getBunnyStorageStatus() {
  const config = resolveConfig();
  if (!config) {
    return { available: false };
  }
  const cdnBaseUrl = getCdnBaseUrl(config);
  return {
    available: true,
    cdnBaseUrl: cdnHost ? `${STORAGE_PROTOCOL}${cdnHost}` : null,
  };
}

export class BunnyStorageError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = "BunnyStorageError";
    this.statusCode = statusCode;
  }
}

function ensureConfigured() {
  const config = resolveConfig();
  if (!config) {
    throw new BunnyStorageError(
      "Bunny Storage yapılandırılmamış. BUNNY_STORAGE_ZONE ve BUNNY_STORAGE_KEY ortam değişkenlerini ayarlayın.",
      503
    );
  }
  return config;
}

function ensureFetch() {
  if (typeof fetch === "function") return fetch;
  throw new BunnyStorageError("fetch API mevcut değil", 500);
}

export function buildCdnUrl(path) {
  const config = resolveConfig();
  if (!config) return "";
  const sanitized = sanitizeRemotePath(path);
  if (!sanitized) return "";
  const base = getCdnBaseUrl(config);
  if (!base) return "";
  return joinCdnBaseWithPath(base, sanitized);
}

export async function uploadBufferToBunny(path, buffer, contentType = "application/octet-stream") {
  const config = ensureConfigured();
  const uploadPath = sanitizeRemotePath(path);
  if (!uploadPath) {
    throw new BunnyStorageError("Yükleme yolu belirtilmedi", 400);
  }
  const targetUrl = `${STORAGE_PROTOCOL}${config.storageHost}/${config.zone}/${uploadPath}`;
  const fetchImpl = ensureFetch();
  const response = await fetchImpl(targetUrl, {
    method: "PUT",
    headers: {
      AccessKey: config.apiKey,
      "Content-Type": contentType || "application/octet-stream",
    },
    body: buffer,
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new BunnyStorageError(
      message || `Bunny Storage yüklemesi başarısız oldu: ${response.status}`,
      response.status
    );
  }
  const cdnBaseUrl = getCdnBaseUrl(config);
  const cdnUrl = cdnBaseUrl ? joinCdnBaseWithPath(cdnBaseUrl, uploadPath) : "";
  return {
    path: uploadPath,
    url: cdnUrl,
    cdnUrl: cdnUrl || null,
    cdnBaseUrl: cdnBaseUrl || null,
    size: buffer?.length ?? 0,
  };
}

export async function deleteFromBunny(path) {
  const config = ensureConfigured();
  const targetPath = sanitizeRemotePath(path);
  if (!targetPath) {
    throw new BunnyStorageError("Silinecek dosya yolu bulunamadı", 400);
  }
  const url = `${STORAGE_PROTOCOL}${config.storageHost}/${config.zone}/${targetPath}`;
  const fetchImpl = ensureFetch();
  const response = await fetchImpl(url, {
    method: "DELETE",
    headers: { AccessKey: config.apiKey },
  });
  if (!response.ok && response.status !== 404) {
    const message = await response.text().catch(() => "");
    throw new BunnyStorageError(
      message || `Bunny Storage silme işlemi başarısız oldu: ${response.status}`,
      response.status
    );
  }
  return { path: targetPath };
}

export function createStoragePath({
  folder = "",
  fileName = "",
  extension = "",
}) {
  const segments = [];
  const normalizedFolder = safeString(folder).replace(/\\/g, "/");
  if (normalizedFolder) {
    normalizedFolder
      .split("/")
      .map((segment) => sanitizePathSegment(segment))
      .filter(Boolean)
      .forEach((segment) => {
        segments.push(segment);
      });
  }
  let normalizedName = sanitizeFileName(fileName);
  if (!normalizedName) {
    normalizedName = Date.now().toString(36);
  }
  const ext = safeString(extension)
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  const finalName = ext && !normalizedName.endsWith(`.${ext}`)
    ? `${normalizedName}.${ext}`
    : normalizedName;
  segments.push(finalName);
  return segments.join("/");
}