import type { XRayItem } from "../components/XRayPanel";
import { xrayDemo } from "../data/xrayDemo";

/** localStorage key: xray:<videoId>  — yoksa demo verisi döner */
const KEY = (videoId: string) => `xray:${videoId}`;

export async function loadXray(videoId: string): Promise<XRayItem[]> {
  const raw = localStorage.getItem(KEY(videoId));
  if (raw) {
    try { return JSON.parse(raw) as XRayItem[]; } catch { /* ignore */ }
  }
  // yoksa demo verisini kopyala
  return JSON.parse(JSON.stringify(xrayDemo)) as XRayItem[];
}

/** overwrite (tam set) */
export async function saveXray(videoId: string, items: XRayItem[]): Promise<void> {
  localStorage.setItem(KEY(videoId), JSON.stringify(items));
}

/** tek bir cast’ın slotlarını overwrite et */
export async function upsertCastSlots(
  videoId: string,
  castId: string,
  nextSlots: { start: number; end: number }[]
): Promise<XRayItem[]> {
  const list = await loadXray(videoId);
  const idx = list.findIndex((x) => x.id === castId);
  if (idx === -1) return list;
  const next = [...list];
  next[idx] = { ...next[idx], slots: nextSlots };
  await saveXray(videoId, next);
  return next;
}
