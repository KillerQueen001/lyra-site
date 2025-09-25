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
  const [showTimeline, setShowTimeline] = useState(false);

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
    setShowTimeline(false);
  }, [videoId, activeSection]);

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
          <div className="space-y-6">
            <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-3">
                <button
                  type="button"
                  className="text-xs text-[#9da1c1] hover:text-[#c6cbff] inline-flex items-center gap-2"
                  onClick={() => setActiveSection("overview")}
                >
                  <span aria-hidden="true">←</span>
                  Panele dön
                </button>
                <div>
                  <h1 className="text-3xl font-semibold">Video Yönetimi</h1>
                  <p className="text-sm text-[#bfb8d6] mt-1">
                    Videoların metinlerini güncelleyin, önizleyin ve gerekli olduğunda cast
                    yerleştirme panelini açın.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <label className="text-[#bfb8d6]" htmlFor="admin-video-select">
                  Video Seç
                </label>
                <select
                  id="admin-video-select"
                  className="bg-[#1b1b24] border border-white/10 rounded-lg px-3 py-2 text-sm"
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

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.85fr)]">
              <div className="space-y-6">
                <div className="rounded-xl border border-white/10 bg-[#1b1b24] overflow-hidden">
                  <div className="p-4 border-b border-white/10 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">Video Önizleme</h2>
                      <p className="text-xs text-[#bfb8d6]">
                        Kaynak: <span className="font-medium">{isHls ? "HLS Akışı" : "MP4"}</span> —
                        Kalite: {currentQuality || "-"}
                      </p>
                    </div>
                    {allowQualitySelection && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[#bfb8d6]">Kalite</span>
                        <select
                          className="bg-[#0f0f14] border border-white/10 rounded px-2 py-1"
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
                      </div>
                    )}
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="space-y-2">
                      <h3 className="text-xl font-medium">{metaTitle}</h3>
                      <p className="text-sm text-[#bfb8d6] leading-relaxed">{metaDescription}</p>
                    </div>
                    <video
                      ref={videoRef}
                      controls
                      preload="metadata"
                      className="w-full rounded-lg border border-white/10 bg-black"
                      poster={metaPoster || undefined}
                    />
                    <div className="text-xs text-[#bfb8d6] break-words">
                      Kaynak yolu: <code>{src}</code>
                    </div>
                    {playerMessage && (
                      <div className="text-xs text-amber-300">{playerMessage}</div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#1b1b24]">
                  <div className="p-4 border-b border-white/10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <h2 className="text-lg font-semibold">Cast Yerleştirme</h2>
                      <p className="text-xs text-[#bfb8d6]">Toplam {totalSlots} slot listelenmiş.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[#bfb8d6]">
                      {saveState === "saving" && <span className="text-amber-300">Kaydediliyor…</span>}
                      {saveState === "saved" && <span className="text-emerald-400">Kaydedildi ✓</span>}
                      {saveState === "error" && <span className="text-red-400">Kaydetme hatası</span>}
                      <button
                        type="button"
                        className="rounded-md border border-white/20 px-3 py-1 font-medium text-[#eee] hover:border-white/40"
                        onClick={() => setShowTimeline((value) => !value)}
                      >
                        {showTimeline ? "Paneli Gizle" : "Paneli Aç"}
                      </button>
                    </div>
                  </div>
                  <div className="p-4">
                    {showTimeline ? (
                      loadingTimeline ? (
                        <div className="text-sm text-[#bfb8d6]">Zaman çizelgesi yükleniyor…</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <AdminTimelinePanel
                            videoRef={videoRef}
                            initialSlots={timelineSlots}
                            onSave={handleSave}
                            castPalette={castPalette}
                          />
                        </div>
                      )
                    ) : (
                      <div className="text-sm text-[#bfb8d6]">
                        Cast yerleştirme paneli kapalı. Düzenlemeye başlamak için "Paneli Aç" butonuna
                        tıklayın.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <aside className="space-y-6">
                <div className="rounded-xl border border-white/10 bg-[#1b1b24] p-4">
                  <h2 className="text-lg font-semibold mb-3">Video Metinleri</h2>
                  {metaLoading ? (
                    <div className="text-sm text-[#bfb8d6]">Video bilgileri yükleniyor…</div>
                  ) : (
                    <form className="space-y-4" onSubmit={handleMetaSubmit}>
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

                <div className="rounded-xl border border-white/10 bg-[#1b1b24] p-4 space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold mb-2">Aktif Cast Listesi</h2>
                    <ul className="space-y-2 text-sm text-[#bfb8d6] max-h-[320px] overflow-auto pr-1">
                      {casts.length === 0 && !loadingTimeline && (
                        <li className="text-xs text-[#bfb8d6]">Henüz atanmış cast bulunmuyor.</li>
                      )}
                      {casts.map((cast) => (
                        <li key={cast.id} className="rounded-lg border border-white/10 px-3 py-2 bg-[#0f0f14]">
                          <div className="font-medium text-[#eee]">{cast.name || "İsimsiz"}</div>
                          <div className="text-xs text-[#bfb8d6]">{cast.role || "Rol belirtilmemiş"}</div>
                          <div className="text-[11px] text-[#9da1c1] mt-1">{cast.slots?.length ?? 0} slot</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="text-xs text-[#bfb8d6] border-t border-white/10 pt-3">
                    <p className="mb-1 font-semibold text-[#eee]">İpuçları</p>
                    <ul className="list-disc ml-4 space-y-1">
                      <li>
                        Paletten cast veya tür sürükleyip timeline üzerinde yeni slotlar oluşturabilirsiniz.
                      </li>
                      <li>
                        Seçili slotu sağ panelden manuel olarak düzenleyebilir, süreleri klavyeyle ince
                        ayarlayabilirsiniz.
                      </li>
                      <li>Kaydet butonuna bastığınızda veriler tarayıcıda yerel olarak saklanır.</li>
                    </ul>
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