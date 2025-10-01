import { useMemo, useRef, useState } from "react";
import AdminTimelinePanel from "../components/AdminTimelinePanel";
import "./AdminTimeline.css";

const CAST_LIBRARY = [
  { id: "ayse", name: "Ayşe G.", description: "Sıcak ve samimi bir anlatım." },
  { id: "mert", name: "Mert K.", description: "Enerjik ve tempolu sahneler için ideal." },
  { id: "hannah", name: "Hannah L.", description: "Genç karakterler için yumuşak ton." },
  { id: "ali", name: "Ali R.", description: "Fragmanlara güç katan bas ton." },
  { id: "melis", name: "Melis T.", description: "Duygusal sahnelerde öne çıkan ses." },
];

const INITIAL_TIMELINE = [
  {
    id: "intro",
    start: 0,
    end: 3.5,
    label: "Açılış",
    cast: [CAST_LIBRARY[0].name],
    kind: "dialogue",
  },
  {
    id: "teaser",
    start: 3.5,
    end: 7,
    label: "Tanıtım",
    cast: [CAST_LIBRARY[1].name],
    kind: "dialogue",
  },
];

export default function AdminTimeline() {
  const videoRef = useRef(null);
  const [slots, setSlots] = useState(INITIAL_TIMELINE);
  const [selectedCastId, setSelectedCastId] = useState(CAST_LIBRARY[0].id);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const castPalette = useMemo(
    () => CAST_LIBRARY.map((voice) => voice.name),
    []
  );

  const activeCast = useMemo(
    () => CAST_LIBRARY.find((voice) => voice.id === selectedCastId) ?? CAST_LIBRARY[0],
    [selectedCastId]
  );

  const handleTimelineSave = (nextSlots) => {
    setSlots(nextSlots);
    setLastSavedAt(new Date());
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
          <span>{slots.length} blok</span>
          {lastSavedAt && (
            <span>Son kaydetme: {lastSavedAt.toLocaleTimeString("tr-TR")}</span>
          )}
        </div>
      </header>

      <div className="admin-timeline-body">
        <section className="admin-timeline-stage">
          <div className="admin-timeline-video">
            <video ref={videoRef} controls preload="metadata">
              <source src="/videos/sample.mp4" type="video/mp4" />
              Tarayıcınız video etiketini desteklemiyor.
            </video>
          </div>
          <div className="admin-timeline-help">
            <h2>Nasıl çalışır?</h2>
            <p>
              Sağdaki listeden bir seslendiren seçin ve aşağıdaki timeline
              üzerine sürükleyerek blok ekleyin. Blokları sürükleyip bırakabilir,
              kenarlardan tutarak sürelerini ayarlayabilirsiniz.
            </p>
          </div>
        </section>

        <section className="admin-timeline-panel">
          <AdminTimelinePanel
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
            {CAST_LIBRARY.map((voice) => (
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
                    <div className="timeline-voice-card__desc">{voice.description}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

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
                <div className="timeline-voice-detail__name">{activeCast.name}</div>
                <p className="timeline-voice-detail__description">
                  {activeCast.description}
                </p>
              </div>
            </div>
            <p className="timeline-voice-detail__hint">
              Eklediğiniz bloklara çift tıklayarak videoda o ana gidebilirsiniz.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}