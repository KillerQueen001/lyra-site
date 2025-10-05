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
  return {
    path: data.path,
    url: data.url || data.cdnUrl,
    size: data.size,
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