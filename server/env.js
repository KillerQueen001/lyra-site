/* eslint-env node */
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SERVER_DIR, "..");
const ENV_FILES = [".env.local", ".env"];

function parseEnv(content) {
  const result = {};
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    if (!key) continue;
    let value = line.slice(equalsIndex + 1).trim();
    if (value.startsWith("\"") && value.endsWith("\"")) {
      value = value.slice(1, -1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function applyEnv(vars) {
  if (!vars) return;
  for (const [key, value] of Object.entries(vars)) {
    if (typeof process === "undefined" || !process.env) return;
    if (Object.prototype.hasOwnProperty.call(process.env, key)) continue;
    process.env[key] = value;
  }
}

export function loadEnv() {
  for (const fileName of ENV_FILES) {
    const filePath = resolve(ROOT_DIR, "..", fileName);
    if (!existsSync(filePath)) continue;
    try {
      const content = readFileSync(filePath, "utf8");
      const parsed = parseEnv(content);
      applyEnv(parsed);
    } catch (error) {
      console.warn(`.env dosyası okunamadı (${fileName}):`, error);
    }
  }
}

loadEnv();