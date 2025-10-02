import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminTimelinePanel from "../components/AdminTimelinePanel";
import StudioVideoPlayer from "../components/StudioVideoPlayer";
import { videoLibrary } from "../data/videoLibrary";
import {
  buildTimelineCastLibrary,
  fetchCasts,
  getPresetCasts,
  mergeCasts,
} from "../utils/castApi";
import {
  loadVideoTimeline,
  saveVideoTimeline,
  syncVideoTimeline,
} from "../utils/timelineLocal";
import "./AdminTimeline.css";

const PRESET_CASTS = getPresetCasts();
const PRESET_CAST_LIBRARY = buildTimelineCastLibrary(PRESET_CASTS);

const INITIAL_TIMELINE = [];

const VIDEO_OPTIONS = Object.entries(videoLibrary).map(([id, entry]) => ({
  id,
  title: entry.title || id,
}));

export default function AdminTimeline() {
  const videoRef = useRef(null);
  const defaultVideoId = VIDEO_OPTIONS[0]?.id || "sample";
  const [selectedVideoId, setSelectedVideoId] = useState(defaultVideoId);
  const [slots, setSlots] = useState(INITIAL_TIMELINE);
  const [baseCastLibrary, setBaseCastLibrary] = useState(PRESET_CAST_LIBRARY);
  const [castLibrary, setCastLibrary] = useState(PRESET_CAST_LIBRARY);
  const [selectedCastId, setSelectedCastId] = useState(
    PRESET_CAST_LIBRARY[0]?.id || null
  );
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [persistenceStatus, setPersistenceStatus] = useState(null);
  const [serverStatus, setServerStatus] = useState("loading");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const remote = await fetchCasts();
        if (!alive) return;
        const merged = mergeCasts(remote, PRESET_CASTS);
        setBaseCastLibrary(buildTimelineCastLibrary(merged));
        setServerStatus("online");
      } catch (error) {
        console.warn("Cast kütüphanesi alınamadı:", error);
        if (!alive) return;
        setBaseCastLibrary(PRESET_CAST_LIBRARY);
        setServerStatus("offline");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const mergeCastLibrary = useCallback(
    (source) => {
      const map = new Map();
      baseCastLibrary.forEach((cast) => {
        if (!cast) return;
        const id = cast.id || cast.slug || cast.name;
        if (!id) return;
        map.set(id, { ...cast, id });
      });
      (Array.isArray(source) ? source : []).forEach((entry) => {
        if (!entry) return;
        const id = entry.id || entry.slug || entry.name;
        if (!id) return;
        const base = map.get(id) || {};
        map.set(id, { ...base, ...entry, id });
      });
      return Array.from(map.values());
    },
    [baseCastLibrary]
  );

  useEffect(() => {
    const stored = loadVideoTimeline(selectedVideoId);
    const nextSlots = stored?.slots?.length ? stored.slots : INITIAL_TIMELINE;
    const nextCastLibrary = mergeCastLibrary(stored?.castLibrary)
    setSlots(nextSlots);
    setCastLibrary(nextCastLibrary);
    setLastSavedAt(stored?.updatedAt ? new Date(stored.updatedAt) : null);
    setPersistenceStatus(null);
    setSelectedCastId((prev) => {
      if (prev && nextCastLibrary.some((cast) => cast.id === prev)) {
        return prev;
      }
      return nextCastLibrary[0]?.id || null;
    });
    let cancelled = false;
    syncVideoTimeline(selectedVideoId).then((synced) => {
      if (cancelled || !synced) return;
      setSlots(synced.slots || INITIAL_TIMELINE);
      setCastLibrary(mergeCastLibrary(synced.castLibrary));
      if (synced.updatedAt) {
        setLastSavedAt(new Date(synced.updatedAt));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedVideoId, mergeCastLibrary]);

  useEffect(() => {
    setCastLibrary((prev) => mergeCastLibrary(prev));
  }, [mergeCastLibrary]);

  const castPalette = useMemo(
    () => castLibrary.map((voice) => voice.name),
    [castLibrary]
  );

  const activeCast = useMemo(() => {
    if (!selectedCastId) return castLibrary[0] || null;
    return castLibrary.find((voice) => voice.id === selectedCastId) || null;
  }, [castLibrary, selectedCastId]);

  const handleTimelineSave = (nextSlots) => {
    setSlots(nextSlots);
    const saved = saveVideoTimeline(selectedVideoId, {
      slots: nextSlots,
      castLibrary,
    });
    setLastSavedAt(saved?.updatedAt ? new Date(saved.updatedAt) : new Date());
    setPersistenceStatus("local");
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleTimelineEvent = (event) => {
      const detail = event.detail || {};
      if (detail.videoId !== selectedVideoId) return;
      if (detail.updatedAt) {
        setLastSavedAt(new Date(detail.updatedAt));
      }
      if (detail.source === "remote") {
        setPersistenceStatus("remote");
      } else if (detail.source === "download") {
        setPersistenceStatus("download");
      }
    };
    window.addEventListener("lyra:timeline-updated", handleTimelineEvent);
    return () => {
      window.removeEventListener("lyra:timeline-updated", handleTimelineEvent);
    };
  }, [selectedVideoId]);

  const handleCastDragStart = (event, voice) => {
    event.dataTransfer.setData(
      "application/x-slot",
      JSON.stringify({ cast: voice.name })
    );
    event.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="admin-timeline-page">
      <header className="admin-timeline-header">
        <div>
          <h1>Admin Timeline</h1>
          <p>
            Cast kartlarını sürükleyerek timeline üzerinde bloklar oluşturun,
            düzenleyin ve videonun belirli anlarına atayın.
          </p>
        </div>
        <div className="admin-timeline-meta">
          <label className="admin-timeline-select">
            <span>Video</span>
            <select
              value={selectedVideoId}
              onChange={(event) => setSelectedVideoId(event.target.value)}
            >
              {VIDEO_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title}
                </option>
              ))}
            </select>
          </label>
          <span>{slots.length} blok</span>
          {lastSavedAt && (
            <span>
              Son kaydetme: {lastSavedAt.toLocaleTimeString("tr-TR")}
            </span>
          )}
          {persistenceStatus === "remote" && (
            <span className="admin-timeline-status admin-timeline-status--remote">
              Dosya kaynağı güncellendi
            </span>
          )}
          {persistenceStatus === "download" && (
            <span className="admin-timeline-status admin-timeline-status--download">
              JSON dosyası indirildi
            </span>
          )}
        </div>
      </header>

      <div className="admin-timeline-body">
        <section className="admin-timeline-stage">
          <div className="admin-timeline-video">
            <StudioVideoPlayer videoId={selectedVideoId} videoRef={videoRef} />
          </div>
          <div className="admin-timeline-help">
            <h2>Nasıl çalışır?</h2>
            <p>
              Sağdaki listeden bir seslendiren seçin ve aşağıdaki timeline
              üzerine sürükleyerek blok ekleyin. Shift + scroll ile görünümü
              kaydırabilir, Ctrl ile yakınlaştırıp uzaklaştırabilir, Alt ile
              dikey yüksekliği ayarlayabilirsiniz.
            </p>
          </div>
        </section>

        <section className="admin-timeline-panel">
          <AdminTimelinePanel
            key={selectedVideoId}
            videoRef={videoRef}
            initialSlots={slots}
            castPalette={castPalette}
            onSave={handleTimelineSave}
            className="admin-timeline-component"
          />
        </section>

        <aside className="admin-timeline-sidebar">
          <div className="admin-timeline-sidebar__header">
            <h2>Cast Kütüphanesi</h2>
            <p>Sürüklemek için kartları tutup timeline&apos;a bırakın.</p>
            <span
              className={`admin-timeline-sidebar__status admin-timeline-sidebar__status--${serverStatus}`}
            >
              {serverStatus === "online"
                ? "Topluluk castleri senkron"
                : serverStatus === "offline"
                ? "Sunucuya ulaşılamadı, varsayılan kütüphane"
                : "Cast listesi yükleniyor"}
            </span>
          </div>
          <ul className="admin-timeline-cast-list">
            {castLibrary.map((voice) => (
              <li key={voice.id}>
                <button
                  type="button"
                  className={`timeline-voice-card${
                    voice.id === selectedCastId ? " timeline-voice-card--active" : ""
                  }`}
                  onClick={() => setSelectedCastId(voice.id)}
                  draggable
                  onDragStart={(event) => handleCastDragStart(event, voice)}
                >
                  <div className="timeline-voice-card__avatar" aria-hidden>
                    {voice.name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")}
                  </div>
                  <div className="timeline-voice-card__body">
                    <div className="timeline-voice-card__name">{voice.name}</div>
                    <div className="timeline-voice-card__desc">
                      {voice.description || voice.role}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {activeCast && (
            <div className="admin-timeline-sidebar__active">
              <h3>Seçili cast</h3>
              <div className="timeline-voice-detail">
                <div className="timeline-voice-detail__initials" aria-hidden>
                  {activeCast.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")}
                </div>
                <div>
                  <div className="timeline-voice-detail__name">
                    {activeCast.name}
                  </div>
                  <p className="timeline-voice-detail__description">
                    {activeCast.description || activeCast.role}
                  </p>
                </div>
              </div>
              <p className="timeline-voice-detail__hint">
                Eklediğiniz bloklara çift tıklayarak videoda o ana gidebilirsiniz.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}