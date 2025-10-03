const baseGroups = {
  "lyra-records": {
    name: "Lyra Records",
    description: "Kendi dublaj projelerimizi üretiyoruz.",
    banner: "/lyra_banner.png",
    logo: "/lyra_logo.png",
  },
  "lavinia-dublaj": {
    name: "Lavinia Dublaj",
    description: "Sesin şiirle buluştuğu an.",
    banner: "/lavinia_banner.png",
    logo: "/lavinia_logo.png",
  },
};

export const groups = { ...baseGroups };

const subscribers = new Set();
let cachedSnapshot = null;

function invalidateSnapshot() {
  cachedSnapshot = null;
}

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeGroupEntryInput(entry = {}) {
  if (!entry || typeof entry !== "object") return null;
  const id = safeString(entry.id || entry.slug);
  if (!id) return null;
  const data = {};
  const name = safeString(entry.name || entry.title);
  if (name) data.name = name;
  const description = safeString(entry.description);
  if (description) data.description = description;
  const banner = safeString(entry.banner);
  if (banner) data.banner = banner;
  const logo = safeString(entry.logo);
  if (logo) data.logo = logo;
  const createdAt = safeString(entry.createdAt);
  if (createdAt) data.createdAt = createdAt;
  const updatedAt = safeString(entry.updatedAt);
  if (updatedAt) data.updatedAt = updatedAt;
  return { id, data };
}

function entriesEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (typeof a !== "object" || typeof b !== "object") {
    return a === b;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => entriesEqual(a[key], b[key]));
}

function applyNormalizedGroupEntry(normalized) {
  if (!normalized) return false;
  const { id, data } = normalized;
  if (!id) return false;
  const existing = groups[id];
  const next = existing ? { ...existing } : {};
  let changed = !existing;
  Object.entries(data).forEach(([key, value]) => {
    if (value == null || value === "") return;
    if (typeof value === "object" && !Array.isArray(value)) {
      if (!entriesEqual(existing?.[key], value)) {
        next[key] = value;
        changed = true;
      }
    } else if (existing?.[key] !== value) {
      next[key] = value;
      changed = true;
    }
  });
  if (changed) {
    groups[id] = next;
    invalidateSnapshot();
  }
  return changed;
}

function notifyGroupSubscribers() {
  subscribers.forEach((callback) => {
    try {
      callback();
    } catch (error) {
      console.error("Group subscriber error", error);
    }
  });
}

export function registerRemoteGroupEntries(entries = []) {
  const list = Array.isArray(entries) ? entries : [entries];
  let changed = false;
  list.forEach((item) => {
    const normalized = normalizeGroupEntryInput(item);
    if (!normalized) return;
    if (applyNormalizedGroupEntry(normalized)) {
      changed = true;
    }
  });
  if (changed) {
    notifyGroupSubscribers();
  }
}

export function getGroupsSnapshot() {
  if (!cachedSnapshot) {
    const snapshot = {};
    Object.entries(groups).forEach(([groupId, entry]) => {
      snapshot[groupId] = { ...entry };
    });
    cachedSnapshot = snapshot;
  }
  return cachedSnapshot;
}

export function subscribeToGroups(callback) {
  if (typeof callback !== "function") {
    return () => {};
  }
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

export function resetGroups() {
  Object.keys(groups).forEach((key) => {
    delete groups[key];
  });
  Object.entries(baseGroups).forEach(([key, value]) => {
    groups[key] = { ...value };
  });
  invalidateSnapshot();
  notifyGroupSubscribers();
}