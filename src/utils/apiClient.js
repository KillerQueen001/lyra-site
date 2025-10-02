let cachedBase = null;

function sanitizeBase(url) {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/$/, "");
}

export function getApiBase() {
  if (cachedBase) return cachedBase;

  let envUrl;
  try {
    if (typeof import.meta !== "undefined" && import.meta.env) {
      envUrl =
        import.meta.env.VITE_TIMELINE_API_BASE ?? import.meta.env.VITE_API_BASE;
    }
  } catch {
    envUrl = undefined;
  }

  const fromEnv = sanitizeBase(envUrl);
  if (fromEnv) {
    cachedBase = fromEnv;
    return cachedBase;
  }

  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    cachedBase = `${protocol}//${hostname}:4173/api`;
    return cachedBase;
  }

  cachedBase = "http://localhost:4173/api";
  return cachedBase;
}

export function overrideApiBase(url) {
  cachedBase = sanitizeBase(url);
}

export function buildApiUrl(path = "") {
  const base = getApiBase();
  if (!base) return null;
  const sanitizedBase = base.replace(/\/$/, "");
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${sanitizedBase}${safePath}`;
}