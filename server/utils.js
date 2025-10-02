export function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function slugify(value) {
  const input = safeString(value);
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}