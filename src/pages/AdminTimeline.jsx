import { useEffect, useMemo, useRef, useState } from "react";
import AdminTimelinePanel from "../components/AdminTimelinePanel";
import StudioVideoPlayer from "../components/StudioVideoPlayer";
import { videoLibrary } from "../data/videoLibrary";
import { xrayDemo } from "../data/xrayDemo";
import { loadVideoTimeline, saveVideoTimeline } from "../utils/timelineLocal";
import "./AdminTimeline.css";

const SAMPLE_CAST = [
  {
    id: "ayse",
    name: "Ayşe G.",
    description: "Sıcak ve samimi anlatım tonuyla girişleri taşır.",
    role: "Anlatıcı",
    photo: null,
  },
  {
    id: "mert",
    name: "Mert K.",
    description: "Enerjik sahnelere tempo katan erkek sesi.",
    role: "Enerjik erkek",
    photo: null,
  },
  {
    id: "hannah",
    name: "Hannah L.",
    description: "Genç karakterler için yumuşak ton.",
    role: "Genç kadın",
    photo: null,
  },
  {
    id: "ali",
    name: "Ali R.",
    description: "Fragmanlarda derin bas tonuyla öne çıkar.",
    role: "Tanıtım sesi",
    photo: null,
  },
];

const XRAY_CAST = xrayDemo.map((actor) => ({
  id: actor.id,
  name: actor.name,
  description: actor.role,
  role: actor.role,
  photo: actor.photo,
}));

const DEFAULT_CAST_LIBRARY = Array.from(
  new Map([...SAMPLE_CAST, ...XRAY_CAST].map((item) => [item.id, item])).values()
);

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
  const [castLibrary, setCastLibrary] = useState(DEFAULT_CAST_LIBRARY);
  const [selectedCastId, setSelectedCastId] = useState(
    DEFAULT_CAST_LIBRARY[0]?.id || null
  );
  const [lastSavedAt, setLastSavedAt] = useState(null);

  useEffect(() => {
    const stored = loadVideoTimeline(selectedVideoId);
    const nextSlots = stored?.slots?.length ? stored.slots : INITIAL_TIMELINE;
    const nextCastLibrary = stored?.castLibrary?.length
      ? stored.castLibrary
      : DEFAULT_CAST_LIBRARY;
    setSlots(nextSlots);
    setCastLibrary(nextCastLibrary);
    setLastSavedAt(stored?.updatedAt ? new Date(stored.updatedAt) : null);
    setSelectedCastId((prev) => {
      if (prev && nextCastLibrary.some((cast) => cast.id === prev)) {
        return prev;
      }
      return nextCastLibrary[0]?.id || null;
    });
  }, [selectedVideoId]);

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
  };

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