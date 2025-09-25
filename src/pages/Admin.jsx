import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminTimelinePanel from "../components/AdminTimelinePanel";
import { getVideoEntry, videoLibrary } from "../data/videoLibrary";
import { loadXray, saveXray } from "../utils/xrayStore";
import { loadHls } from "../utils/loadHls";
import { clearVideoMeta, loadVideoMeta, saveVideoMeta } from "../utils/videoMetaStore";
import { isHlsSource, resolveSingleVideo, resolveVideoSrc } from "../utils/videoSource";

const QUALITY_FALLBACKS = ["1080", "720", "480"];
const COLOR_WHEEL = ["#7c4bd9", "#b598ff", "#ff8fa3", "#5ad1b3", "#ffd166", "#8ecae6"];

function buildDisplayName(cast) {
  if (!cast) return "";
  const name = typeof cast.name === "string" ? cast.name.trim() : "";
  const role = typeof cast.role === "string" ? cast.role.trim() : "";
  if (name && role) return `${name} — ${role}`;
  return name || role || "İsimsiz";
}

function parseDisplayLabel(label) {
  if (!label) return { name: "", role: "" };
  const emParts = label.split(" — ");
  if (emParts.length > 1) {
    return { name: emParts[0].trim(), role: emParts.slice(1).join(" — ").trim() };
  }
  const dashParts = label.split(" - ");
  if (dashParts.length > 1) {
    return { name: dashParts[0].trim(), role: dashParts.slice(1).join(" - ").trim() };
  }
  return { name: label.trim(), role: "" };
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function ensureCastId(name, role, existingIds) {
  const base = slugify(name || role || "cast") || "cast";
  let candidate = base;
  let counter = 1;
  while (!candidate || existingIds.has(candidate)) {
    candidate = `${base || "cast"}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function ensureColor(map, key, indexRef) {
  if (map.has(key)) return map.get(key);
  const color = COLOR_WHEEL[indexRef.current % COLOR_WHEEL.length];
  indexRef.current += 1;
  map.set(key, color);
  return color;
}

function flattenXrayToTimeline(casts) {
  const merged = new Map();
  const colorMap = new Map();
  const colorIdx = { current: 0 };

  casts.forEach((cast) => {
    if (!cast) return;
    const display = buildDisplayName(cast);
    if (!display) return;
    const preferredColor = ensureColor(colorMap, display, colorIdx);
    const slots = Array.isArray(cast.slots) ? cast.slots : [];
    slots.forEach((slot) => {
      if (!slot) return;
      const start = Number(slot.start ?? 0);
      const end = Number(slot.end ?? 0);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
      const key = slot.slotId || `${start}-${end}-${slot.label || display}`;
      const baseCast = Array.isArray(slot.cast) && slot.cast.length
        ? slot.cast.filter((item) => typeof item === "string" && item.trim())
        : [display];
      const existing = merged.get(key);
      if (existing) {
        const combined = new Set([...(existing.cast ?? []), ...baseCast]);
        existing.cast = [...combined];
        if (slot.label) existing.label = slot.label;
        if (slot.kind) existing.kind = slot.kind;
        if (slot.color) existing.color = slot.color;
      } else {
        merged.set(key, {
          id: slot.slotId || `slot-${key}-${Math.random().toString(36).slice(2, 8)}`,
          start,
          end,
          label: slot.label || display,
          cast: [...new Set(baseCast)],
          kind: slot.kind || "dialogue",
          color: slot.color || preferredColor,
        });
      }
    });
  });

  return Array.from(merged.values()).sort((a, b) => a.start - b.start);
}

function convertTimelineToXray(timelineSlots, baseCasts) {
  const result = baseCasts.map((item) => ({ ...item, slots: [] }));
  const byDisplay = new Map();
  const existingIds = new Set(result.map((item) => item.id));

  result.forEach((item) => {
    byDisplay.set(buildDisplayName(item), item);
  });

  const ensureEntry = (label) => {
    const display = label.trim();
    if (!display) return null;
    if (byDisplay.has(display)) return byDisplay.get(display);
    const { name, role } = parseDisplayLabel(display);
    const base = slugify(name || role || "cast") || "cast";
    let candidate = base;
    let counter = 1;
    while (!candidate || existingIds.has(candidate)) {
      candidate = `${base || "cast"}-${counter}`;
      counter += 1;
    }
    existingIds.add(candidate);
    const created = {
      id: candidate,
      name: name || display,
      role: role || "",
      photo: "",
      slots: [],
    };
    result.push(created);
    byDisplay.set(display, created);
    return created;
  };

  timelineSlots.forEach((slot) => {
    if (!slot) return;
    const start = Number(slot.start ?? 0);
    const end = Number(slot.end ?? 0);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    const castList = Array.isArray(slot.cast) ? slot.cast : [];
    if (!castList.length) return;
    castList.forEach((label) => {
      if (typeof label !== "string") return;
      const target = ensureEntry(label);
      if (!target) return;
      const nextSlot = {
        start,
        end,
        label: typeof slot.label === "string" ? slot.label : "",
        kind: typeof slot.kind === "string" ? slot.kind : "dialogue",
        color: typeof slot.color === "string" ? slot.color : undefined,
        slotId: slot.id,
        cast: [...castList],
      };
      target.slots = [...(target.slots || []), nextSlot];
    });
  });

  return result.map((item) => ({
    ...item,
    slots: (item.slots || [])
      .map((slot) => ({
        ...slot,
        start: Number(slot.start ?? 0),
        end: Number(slot.end ?? 0),
      }))
      .filter((slot) => Number.isFinite(slot.start) && Number.isFinite(slot.end) && slot.end > slot.start)
      .sort((a, b) => a.start - b.start),
  }));
}

export default function Admin() {
  const videoIds = useMemo(() => Object.keys(videoLibrary), []);
  const [videoId, setVideoId] = useState(() => videoIds[0] || "sample");
  const [activeSection, setActiveSection] = useState("overview");
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const timelineSaveTimerRef = useRef(null);
  const metaSaveTimerRef = useRef(null);

  const videoEntry = useMemo(() => getVideoEntry(videoId), [videoId]);
  const fileQualities = useMemo(() => {
    if (!videoEntry?.files) return [];
    return Object.keys(videoEntry.files)
      .filter((key) => /^\d{3,4}$/.test(key))
      .sort((a, b) => Number(b) - Number(a));
  }, [videoEntry]);
  const qualityOptions = useMemo(
    () => (fileQualities.length ? fileQualities : QUALITY_FALLBACKS),
    [fileQualities]
  );

  const [prefIdx, setPrefIdx] = useState(0);
  const [src, setSrc] = useState(() =>
    resolveVideoSrc(videoId, qualityOptions[0] || QUALITY_FALLBACKS[0])
  );
  useEffect(() => {
    setPrefIdx(0);
  }, [videoId, qualityOptions]);
  useEffect(() => {
    const key = qualityOptions[prefIdx] || qualityOptions[0] || QUALITY_FALLBACKS[0];
    setSrc(resolveVideoSrc(videoId, key));
  }, [videoId, prefIdx, qualityOptions]);

  const isHls = useMemo(
    () => isHlsSource(src) || (videoEntry?.stream ? isHlsSource(videoEntry.stream) : false),
    [src, videoEntry]
  );

  const [casts, setCasts] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [playerMessage, setPlayerMessage] = useState("");
  const [saveState, setSaveState] = useState("idle");
  const [videoMeta, setVideoMeta] = useState({ title: "", description: "", poster: "" });
  const [metaStatus, setMetaStatus] = useState("idle");
  const [metaLoading, setMetaLoading] = useState(false);
  const [castEditorId, setCastEditorId] = useState(null);
  const [castForm, setCastForm] = useState({ id: null, name: "", role: "", photo: "" });
  const [castStatus, setCastStatus] = useState("idle");

  const castStatusTimerRef = useRef(null);

  useEffect(() => {
    let alive = true;
    setLoadingTimeline(true);
    loadXray(videoId)
      .then((data) => {
        if (!alive) return;
        setCasts(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!alive) return;
        setCasts([]);
      })
      .finally(() => {
        if (!alive) return;
        setLoadingTimeline(false);
      });
    return () => {
      alive = false;
    };
  }, [videoId]);

    useEffect(() => {
    if (activeSection !== "videos") return undefined;
    let alive = true;
    setMetaLoading(true);
    loadVideoMeta(videoId, {
      title: videoEntry?.title ?? "",
      description: videoEntry?.description ?? "",
      poster: videoEntry?.poster ?? "",
    })
      .then((data) => {
        if (!alive) return;
        setVideoMeta(data);
        setMetaStatus("idle");
      })
      .catch(() => {
        if (!alive) return;
        setVideoMeta({
          title: videoEntry?.title ?? "",
          description: videoEntry?.description ?? "",
          poster: videoEntry?.poster ?? "",
        });
        setMetaStatus("error");
      })
      .finally(() => {
        if (!alive) return;
        setMetaLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [activeSection, videoEntry?.description, videoEntry?.poster, videoEntry?.title, videoId]);

  useEffect(() => {
    if (!castEditorId) {
      setCastForm({ id: null, name: "", role: "", photo: "" });
      return;
    }
    const entry = casts.find((item) => item.id === castEditorId);
    if (!entry) {
      setCastEditorId(null);
      setCastForm({ id: null, name: "", role: "", photo: "" });
      return;
    }
    setCastForm({
      id: entry.id,
      name: entry.name || "",
      role: entry.role || "",
      photo: entry.photo || "",
    });
  }, [castEditorId, casts]);

  useEffect(() => {
    setCastEditorId(null);
    setCastForm({ id: null, name: "", role: "", photo: "" });
    setCastStatus("idle");
  }, [videoId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return undefined;

    const detach = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    if (isHls) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        if (video.dataset.loadedSrc !== src) {
          video.src = src;
          video.dataset.loadedSrc = src;
          video.load();
        }
        setPlayerMessage("");
        return () => detach();
      }

      let cancelled = false;
      loadHls()
        .then((HlsLib) => {
          if (cancelled) return;
          const HlsCtor = HlsLib?.default ?? HlsLib;
          if (!HlsCtor || !HlsCtor.isSupported?.()) {
            setPlayerMessage("Tarayıcı HLS akışını desteklemiyor.");
            return;
          }
          detach();
          const instance = new HlsCtor();
          hlsRef.current = instance;
          instance.loadSource(src);
          instance.attachMedia(video);
          video.dataset.loadedSrc = src;
          setPlayerMessage("");
        })
        .catch(() => {
          if (cancelled) return;
          setPlayerMessage("HLS kütüphanesi yüklenemedi.");
        });

      return () => {
        cancelled = true;
        detach();
      };
    }

    detach();
    setPlayerMessage("");
    if (video.dataset.loadedSrc !== src) {
      video.src = src;
      video.dataset.loadedSrc = src;
      video.load();
    }

    return () => {
      detach();
    };
  }, [src, isHls]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const fallbackSrc = resolveSingleVideo(videoId);
    const onError = () => {
      setPrefIdx((idx) => {
        if (idx < qualityOptions.length - 1) {
          return idx + 1;
        }
        if (fallbackSrc && fallbackSrc !== src) {
          setSrc(fallbackSrc);
        }
        return idx;
      });
    };
    video.addEventListener("error", onError);
    return () => {
      video.removeEventListener("error", onError);
    };
  }, [videoId, qualityOptions, src]);

  useEffect(() => () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (timelineSaveTimerRef.current) {
      window.clearTimeout(timelineSaveTimerRef.current);
      timelineSaveTimerRef.current = null;
    }
    if (metaSaveTimerRef.current) {
      window.clearTimeout(metaSaveTimerRef.current);
      metaSaveTimerRef.current = null;
    }
    if (castStatusTimerRef.current) {
      window.clearTimeout(castStatusTimerRef.current);
      castStatusTimerRef.current = null;
    }    
  }, []);

  const timelineSlots = useMemo(() => flattenXrayToTimeline(casts), [casts]);
  const castPalette = useMemo(() => {
    const base = casts
      .map((item) => buildDisplayName(item))
      .filter((name) => typeof name === "string" && name.trim());
    return Array.from(new Set([...base, "SFX-Drone", "Crowd"]));
  }, [casts]);
  const totalSlots = useMemo(
    () => casts.reduce((sum, item) => sum + (item.slots?.length ?? 0), 0),
    [casts]
  );

  const handleSave = useCallback(
    async (editedSlots) => {
      if (!videoId) return;
      setSaveState("saving");
      try {
        const updated = convertTimelineToXray(editedSlots, casts);
        await saveXray(videoId, updated);
        setCasts(updated);
        setSaveState("saved");
        if (timelineSaveTimerRef.current) {
          window.clearTimeout(timelineSaveTimerRef.current);
        }
        timelineSaveTimerRef.current = window.setTimeout(() => {
          setSaveState("idle");
        }, 2200);
      } catch {
        setSaveState("error");
      }
    },
    [videoId, casts]
  );

  const allowQualitySelection = !isHls && qualityOptions.length > 1;
  const currentQuality = qualityOptions[prefIdx] || (isHls ? "Auto" : qualityOptions[0]);

    const metaTitle = (videoMeta.title || "").trim() || videoEntry?.title || videoId;
  const metaDescription =
    (videoMeta.description || "").trim() || videoEntry?.description || "Açıklama girilmemiş.";
  const metaPoster = (videoMeta.poster || "").trim() || videoEntry?.poster || "";

  const handleMetaFieldChange = useCallback((field, value) => {
    setVideoMeta((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleMetaSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (!videoId) return;
      setMetaStatus("saving");
      const payload = {
        title: (videoMeta.title || "").trim(),
        description: (videoMeta.description || "").trim(),
        poster: (videoMeta.poster || "").trim(),
      };
      try {
        const saved = await saveVideoMeta(videoId, payload);
        setVideoMeta(saved);
        setMetaStatus("saved");
        if (metaSaveTimerRef.current) {
          window.clearTimeout(metaSaveTimerRef.current);
        }
        metaSaveTimerRef.current = window.setTimeout(() => {
          setMetaStatus("idle");
        }, 2200);
      } catch {
        setMetaStatus("error");
      }
    },
    [videoId, videoMeta]
  );

  const handleMetaReset = useCallback(async () => {
    if (!videoId) return;
    setMetaStatus("saving");
    try {
      await clearVideoMeta(videoId);
      const defaults = await loadVideoMeta(videoId, {
        title: videoEntry?.title ?? "",
        description: videoEntry?.description ?? "",
        poster: videoEntry?.poster ?? "",
      });
      setVideoMeta(defaults);
      setMetaStatus("reset");
      if (metaSaveTimerRef.current) {
        window.clearTimeout(metaSaveTimerRef.current);
      }
      metaSaveTimerRef.current = window.setTimeout(() => {
        setMetaStatus("idle");
      }, 2200);
    } catch {
      setMetaStatus("error");
    }
  }, [videoEntry?.description, videoEntry?.poster, videoEntry?.title, videoId]);

  const handleCastFieldChange = useCallback((field, value) => {
    setCastForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleCastSelect = useCallback((id) => {
    setCastEditorId(id);
    setCastStatus("idle");
  }, []);

  const handleCastStartNew = useCallback(() => {
    setCastEditorId(null);
    setCastForm({ id: null, name: "", role: "", photo: "" });
    setCastStatus("idle");
  }, []);

  const handleCastSubmit = useCallback(
    (event) => {
      if (event) event.preventDefault();
      const name = (castForm.name || "").trim();
      const role = (castForm.role || "").trim();
      const photo = (castForm.photo || "").trim();
      if (!name && !role) {
        setCastStatus("error");
        if (castStatusTimerRef.current) {
          window.clearTimeout(castStatusTimerRef.current);
        }
        castStatusTimerRef.current = window.setTimeout(() => {
          setCastStatus("idle");
        }, 2400);
        return;
      }

      let createdId = castForm.id || null;
      setCasts((prev) => {
        if (castForm.id) {
          return prev.map((item) => {
            if (item.id !== castForm.id) return item;
            const oldDisplay = buildDisplayName(item);
            const updated = {
              ...item,
              name,
              role,
              photo,
            };
            const newDisplay = buildDisplayName(updated);
            const updatedSlots = (item.slots || []).map((slot) => {
              const castList = Array.isArray(slot.cast) ? slot.cast : [];
              const replaced = castList.map((entry) =>
                entry === oldDisplay ? newDisplay : entry
              );
              const normalized = replaced.length
                ? [...new Set(replaced)]
                : [newDisplay];
              return {
                ...slot,
                label: slot.label === oldDisplay ? newDisplay : slot.label,
                cast: normalized,
              };
            });
            return { ...updated, slots: updatedSlots };
          });
        }

        const existingIds = new Set(prev.map((item) => item.id));
        const newId = ensureCastId(name, role, existingIds);
        createdId = newId;
        const newEntry = {
          id: newId,
          name,
          role,
          photo,
          slots: [],
        };
        return [...prev, newEntry];
      });

      const nextId = createdId || castForm.id;
      setCastEditorId(nextId);
      setCastForm({ id: nextId, name, role, photo });
      const nextStatus = castForm.id ? "updated" : "added";
      setCastStatus(nextStatus);
      if (castStatusTimerRef.current) {
        window.clearTimeout(castStatusTimerRef.current);
      }
      castStatusTimerRef.current = window.setTimeout(() => {
        setCastStatus("idle");
      }, 2400);
    },
    [castForm]
  );

  const metaStatusText = useMemo(() => {
    switch (metaStatus) {
      case "saving":
        return "Kaydediliyor…";
      case "saved":
        return "Güncellemeler kaydedildi.";
      case "reset":
        return "Varsayılan metinler geri yüklendi.";
      case "error":
        return "Video bilgileri kaydedilirken bir hata oluştu.";
      default:
        return "";
    }
  }, [metaStatus]);

  const castStatusText = useMemo(() => {
    switch (castStatus) {
      case "added":
        return "Yeni cast eklendi.";
      case "updated":
        return "Cast bilgileri güncellendi.";
      case "error":
        return "Lütfen isim veya rol bilgisi girin.";
      default:
        return "";
    }
  }, [castStatus]);

  return (
    <div className="min-h-screen bg-[#0f0f14] text-[#eee] py-8">
      <div className="max-w-6xl mx-auto px-4 space-y-6">
        {activeSection !== "videos" ? (
          <div className="space-y-10">
            <header className="rounded-2xl border border-white/10 bg-[#1b1b24] p-8 shadow-xl shadow-black/10">
              <p className="text-sm uppercase tracking-[0.3em] text-[#7a75a5] mb-4">
                Yönetim Paneli
              </p>
              <h1 className="text-3xl font-semibold mb-3">Hoş geldiniz</h1>
              <p className="text-base text-[#bfb8d6] max-w-2xl">
                Projelerinizi yönetmek için bir alan. Videoların başlık ve açıklamalarını düzenleyin,
                ardından ihtiyaç halinde cast yerleştirme zaman çizelgesini açarak rollerinizi
                güncelleyin.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="rounded-lg bg-[#5b4bff] px-5 py-2 text-sm font-medium text-white hover:bg-[#7263ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b4bff]"
                  onClick={() => setActiveSection("videos")}
                >
                  Videoları Yönet
                </button>
              </div>
            </header>

            <section className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-[#1b1b24] p-6">
                <h2 className="text-lg font-semibold text-[#eee]">Videolar</h2>
                <p className="mt-2 text-sm text-[#bfb8d6]">
                  Başlık ve açıklamaları güncelleyin, poster görsellerini değiştirin ve cast
                  yerleştirmeyi gerektiğinde açın.
                </p>
              </div>
              <div className="rounded-xl border border-dashed border-white/10 bg-[#131320] p-6 text-sm text-[#7a75a5]">
                Yakında: diğer yönetim araçları ve istatistik panelleri burada yer alacak.
              </div>
            </section>
          </div>
        ) : (
          <div className="space-y-8">
            <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 text-xs text-[#9da1c1] hover:text-[#c6cbff]"
                  onClick={() => setActiveSection("overview")}
                >
                  <span aria-hidden="true">←</span>
                  Panele dön
                </button>
                <div className="space-y-1">
                  <h1 className="text-3xl font-semibold text-[#f4f3ff]">Video Çalışma Alanı</h1>
                  <p className="text-sm text-[#bfb8d6]">
                    Videoyu izlerken zaman çizelgesine cast yerleştirin, meta verileri ve oyuncu kütüphanesini
                    yönetin.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="text-[#bfb8d6]" htmlFor="admin-video-select">
                  Video Seç
                </label>
                <select
                  id="admin-video-select"
                  className="bg-[#1b1b24] border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-[#5b4bff] focus:outline-none"
                  value={videoId}
                  onChange={(e) => setVideoId(e.target.value)}
                >
                  {videoIds.map((id) => (
                    <option key={id} value={id}>
                      {videoLibrary[id]?.title || id}
                    </option>
                  ))}
                </select>
              </div>
            </header>

            <div className="grid gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
              <section className="rounded-[32px] border border-white/10 bg-[linear-gradient(160deg,#19192d,#0d0d16)] p-6 md:p-8 shadow-[0_20px_50px_rgba(10,10,20,0.45)]">
                <div className="space-y-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-[0.3em] text-[#7a75a5]">Video Önizleme</p>
                      <h2 className="text-2xl font-semibold text-white">{metaTitle}</h2>
                      <p className="text-sm text-[#bfb8d6] leading-relaxed max-w-xl">{metaDescription}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[#bfb8d6]">
                      <span className="rounded-full border border-white/10 px-3 py-1.5 bg-white/5">
                        {isHls ? "HLS Akışı" : "Dosya"}
                      </span>
                      <span className="rounded-full border border-white/10 px-3 py-1.5 bg-white/5">
                        {currentQuality ? `${currentQuality}${isHls ? "" : "p"}` : "Kalite bilinmiyor"}
                      </span>
                      {allowQualitySelection && (
                        <label className="flex items-center gap-2">
                          <span>Kalite</span>
                          <select
                            className="bg-[#0f0f14] border border-white/10 rounded px-2 py-1 focus:border-[#5b4bff] focus:outline-none"
                            value={currentQuality}
                            onChange={(e) => {
                              const value = e.target.value;
                              const idx = qualityOptions.indexOf(value);
                              setPrefIdx(idx === -1 ? 0 : idx);
                            }}
                          >
                            {qualityOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}p
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black shadow-[0_15px_40px_rgba(5,5,15,0.6)]">
                    <video
                      ref={videoRef}
                      controls
                      preload="metadata"
                      className="w-full h-full"
                      poster={metaPoster || undefined}
                    />
                    {playerMessage && (
                      <div className="absolute bottom-4 left-4 right-4 rounded-xl bg-black/70 px-4 py-3 text-xs text-amber-300 backdrop-blur">
                        {playerMessage}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#9da1c1]">
                    <span>
                      Kaynak yolu: <code className="break-all text-[#d9d6ff]">{src}</code>
                    </span>
                    <span>{Math.round(videoRef.current?.duration || 0)} sn</span>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-[#141426]/80 p-5 shadow-inner shadow-black/30">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-white">Zaman Çizelgesi</h3>
                        <p className="text-xs text-[#bfb8d6]">
                          Cast çiplerini sürükleyerek slot oluşturun, süreleri timeline üzerinden ayarlayın.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[#bfb8d6]">
                          {totalSlots} slot
                        </span>
                        {loadingTimeline && (
                          <span className="text-[#9da1c1]">Zaman çizelgesi yükleniyor…</span>
                        )}
                        {saveState === "saving" && <span className="text-amber-300">Kaydediliyor…</span>}
                        {saveState === "saved" && <span className="text-emerald-400">Kaydedildi ✓</span>}
                        {saveState === "error" && <span className="text-red-400">Kaydetme hatası</span>}
                      </div>
                    </div>
                    <div className="mt-4">
                      <AdminTimelinePanel
                        videoRef={videoRef}
                        initialSlots={timelineSlots}
                        onSave={handleSave}
                        castPalette={castPalette}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <aside className="space-y-6">
                <div className="rounded-3xl border border-white/10 bg-[#19192d]/80 p-6 shadow-[0_15px_30px_rgba(8,8,18,0.45)]">
                  <h2 className="text-lg font-semibold text-white">Video Metinleri</h2>
                  {metaLoading ? (
                    <div className="mt-3 text-sm text-[#bfb8d6]">Video bilgileri yükleniyor…</div>
                  ) : (
                    <form className="mt-4 space-y-4" onSubmit={handleMetaSubmit}>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wide text-[#9da1c1]">
                          Başlık
                        </label>
                        <input
                          type="text"
                          value={videoMeta.title}
                          onChange={(e) => handleMetaFieldChange("title", e.target.value)}
                          className="w-full rounded-lg border border-white/10 bg-[#0f0f14] px-3 py-2 text-sm focus:border-[#5b4bff] focus:outline-none"
                          placeholder="Video başlığı"
                          disabled={metaStatus === "saving"}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wide text-[#9da1c1]">
                          Açıklama
                        </label>
                        <textarea
                          value={videoMeta.description}
                          onChange={(e) => handleMetaFieldChange("description", e.target.value)}
                          className="w-full min-h-[120px] rounded-lg border border-white/10 bg-[#0f0f14] px-3 py-2 text-sm focus:border-[#5b4bff] focus:outline-none"
                          placeholder="Video açıklaması"
                          disabled={metaStatus === "saving"}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wide text-[#9da1c1]">
                          Poster URL
                        </label>
                        <input
                          type="text"
                          value={videoMeta.poster}
                          onChange={(e) => handleMetaFieldChange("poster", e.target.value)}
                          className="w-full rounded-lg border border-white/10 bg-[#0f0f14] px-3 py-2 text-sm focus:border-[#5b4bff] focus:outline-none"
                          placeholder="https://"
                          disabled={metaStatus === "saving"}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="submit"
                          className="rounded-lg bg-[#5b4bff] px-4 py-2 text-sm font-medium text-white hover:bg-[#7263ff] disabled:opacity-60"
                          disabled={metaStatus === "saving"}
                        >
                          Kaydet
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-white/20 px-4 py-2 text-sm font-medium text-[#eee] hover:border-white/40 disabled:opacity-60"
                          onClick={handleMetaReset}
                          disabled={metaStatus === "saving"}
                        >
                          Varsayılanı Yükle
                        </button>
                        {metaStatusText && (
                          <span className="text-xs text-[#bfb8d6]">{metaStatusText}</span>
                        )}
                      </div>
                    </form>
                  )}
                </div>

                <div className="rounded-3xl border border-white/10 bg-[#19192d]/80 p-6 shadow-[0_15px_30px_rgba(8,8,18,0.45)] space-y-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-white">Cast Kütüphanesi</h2>
                      <p className="text-xs text-[#bfb8d6]">
                        Mevcut seslendirenleri düzenleyin, yeni cast ekleyin ve fotoğraf URL'si tanımlayın.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg border border-white/20 px-4 py-2 text-xs font-medium text-[#eee] hover:border-white/40"
                      onClick={handleCastStartNew}
                    >
                      Yeni Cast
                    </button>
                  </div>

                  <form className="grid gap-3" onSubmit={handleCastSubmit}>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[#9da1c1]">
                        İsim
                      </label>
                      <input
                        type="text"
                        value={castForm.name}
                        onChange={(e) => handleCastFieldChange("name", e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-[#0f0f14] px-3 py-2 text-sm focus:border-[#5b4bff] focus:outline-none"
                        placeholder="Oyuncu adı"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[#9da1c1]">
                        Rol
                      </label>
                      <input
                        type="text"
                        value={castForm.role}
                        onChange={(e) => handleCastFieldChange("role", e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-[#0f0f14] px-3 py-2 text-sm focus:border-[#5b4bff] focus:outline-none"
                        placeholder="Karakter veya görev"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[#9da1c1]">
                        Fotoğraf URL
                      </label>
                      <input
                        type="text"
                        value={castForm.photo}
                        onChange={(e) => handleCastFieldChange("photo", e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-[#0f0f14] px-3 py-2 text-sm focus:border-[#5b4bff] focus:outline-none"
                        placeholder="https://"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="submit"
                        className="rounded-lg bg-[#5b4bff] px-4 py-2 text-sm font-medium text-white hover:bg-[#7263ff]"
                      >
                        {castForm.id ? "Güncelle" : "Cast Ekle"}
                      </button>
                      {castStatusText && (
                        <span
                          className={`text-xs ${castStatus === "error" ? "text-red-400" : "text-[#bfb8d6]"}`}
                        >
                          {castStatusText}
                        </span>
                      )}
                    </div>
                  </form>

                  <div className="space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[#7a75a5]">
                      Cast Kartları
                    </div>
                    <div className="grid gap-3">
                      {loadingTimeline ? (
                        <div className="text-sm text-[#bfb8d6]">Cast bilgileri yükleniyor…</div>
                      ) : casts.length === 0 ? (
                        <div className="text-sm text-[#bfb8d6]">
                          Henüz bu videoya atanmış cast bulunmuyor. Yeni bir cast ekleyebilirsiniz.
                        </div>
                      ) : (
                        casts.map((cast) => {
                          const displayName = buildDisplayName(cast) || "İsimsiz";
                          const initials = (cast.name || cast.role || "C").slice(0, 2).toUpperCase();
                          const slotCount = cast.slots?.length ?? 0;
                          return (
                            <div
                              key={cast.id}
                              className={`flex gap-3 rounded-2xl border border-white/10 bg-[#0f0f18]/80 p-3 transition ${
                                castEditorId === cast.id ? "ring-1 ring-[#5b4bff]" : "hover:border-white/30"
                              }`}
                            >
                              <div className="h-14 w-14 overflow-hidden rounded-xl border border-white/10 bg-[#151527]">
                                {cast.photo ? (
                                  <img
                                    src={cast.photo}
                                    alt={displayName}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-xs text-[#7a75a5]">
                                    {initials}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm font-medium text-white truncate">{displayName}</div>
                                  <button
                                    type="button"
                                    className="text-xs text-[#9da1c1] hover:text-[#c6cbff]"
                                    onClick={() => handleCastSelect(cast.id)}
                                  >
                                    Düzenle
                                  </button>
                                </div>
                                <div className="text-xs text-[#bfb8d6] truncate">
                                  {cast.role || "Rol belirtilmemiş"}
                                </div>
                                <div className="text-[11px] text-[#7a75a5]">{slotCount} slot</div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}