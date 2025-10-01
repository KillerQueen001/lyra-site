import { useMemo, useRef, useState } from "react";
import AdminTimelinePanel from "../components/AdminTimelinePanel";
import "./VideoEditor.css";

const VOICE_LIBRARY = [
  {
    id: "ayse",
    name: "Ayşe G.",
    description: "Sıcak ve samimi bir ton ile anlatım yapan ana spiker.",
  },
  {
    id: "mert",
    name: "Mert K.",
    description: "Hareketli sahnelerde enerjik performansıyla öne çıkan erkek ses.",
  },
  {
    id: "hannah",
    name: "Hannah L.",
    description: "Yumuşak vurgularla genç karakterleri seslendirmede uzman.",
  },
  {
    id: "ali",
    name: "Ali R.",
    description: "Derin bas tonu ile fragman ve duyuru metinlerine güç katar.",
  },
];

const INITIAL_TIMELINE = [
  {
    id: "intro",
    start: 0,
    end: 4,
    label: "Açılış",
    cast: [VOICE_LIBRARY[0].name],
    kind: "dialogue",
  },
];

export default function VideoEditor() {
  const videoRef = useRef(null);
  const [title, setTitle] = useState("Yeni Video");
  const [description, setDescription] = useState(
    "Sahne sahne açıklamanızı buraya yazın."
  );
  const [timelineSlots, setTimelineSlots] = useState(INITIAL_TIMELINE);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [activeVoiceId, setActiveVoiceId] = useState(VOICE_LIBRARY[0].id);

  const castPalette = useMemo(
    () => VOICE_LIBRARY.map((voice) => voice.name),
    []
  );

  const activeVoice = useMemo(
    () => VOICE_LIBRARY.find((voice) => voice.id === activeVoiceId) ?? VOICE_LIBRARY[0],
    [activeVoiceId]
  );

  const handleTimelineSave = (slots) => {
    setTimelineSlots(slots);
    setLastSavedAt(new Date());
  };

  const handleVoiceDragStart = (event, voice) => {
    event.dataTransfer.setData(
      "application/x-slot",
      JSON.stringify({ cast: voice.name })
    );
    event.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className="video-editor-page">
      <div className="video-editor-shell">
        <header className="video-editor-header">
          <div>
            <h1>Video Düzenleyici</h1>
            <p>
              Sağdaki listeden seslendirenleri seçin, timeline üzerine sürükleyin ve
              sahnelerinizi düzenleyin.
            </p>
          </div>
        </header>

        <div className="video-editor-grid">
          <section className="editor-main">
            <div className="video-stage">
              <div className="video-frame">
                <video
                  ref={videoRef}
                  controls
                  preload="metadata"
                >
                  <source src="/videos/sample.mp4" type="video/mp4" />
                  Tarayıcınız video etiketini desteklemiyor.
                </video>
              </div>
              <div className="stage-fields">
                <label>
                  <span>Başlık</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Video başlığını yazın"
                  />
                </label>
                <label>
                  <span>Açıklama</span>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Videoda neler oluyor?"
                  />
                </label>
              </div>
            </div>

            <div className="timeline-panel">
              <div className="timeline-header">
                <div>
                  <h2>Timeline</h2>
                  <p>
                    Kişileri aşağıdaki çubuğa sürükleyin, blokları uzatarak veya
                    taşıyarak ayarlayın.
                  </p>
                </div>
                <div className="timeline-meta">
                  <span>{timelineSlots.length} kayıt</span>
                  {lastSavedAt && (
                    <span>
                      Son kaydedilen: {lastSavedAt.toLocaleTimeString("tr-TR")}
                    </span>
                  )}
                </div>
              </div>
              <AdminTimelinePanel
                videoRef={videoRef}
                initialSlots={timelineSlots}
                castPalette={castPalette}
                onSave={handleTimelineSave}
                className="timeline-component"
              />
            </div>
          </section>

          <aside className="editor-sidebar">
            <div className="voice-library">
              <div className="voice-library__header">
                <h2>Seslendiren Seçin</h2>
                <p>
                  Her kartı sürükleyip timeline&apos;a bırakın. Seçerek açıklamasını
                  görün.
                </p>
              </div>
              <ul className="voice-library__list">
                {VOICE_LIBRARY.map((voice) => (
                  <li key={voice.id}>
                    <button
                      type="button"
                      className={`voice-card${
                        voice.id === activeVoiceId ? " voice-card--active" : ""
                      }`}
                      onClick={() => setActiveVoiceId(voice.id)}
                      draggable
                      onDragStart={(event) => handleVoiceDragStart(event, voice)}
                    >
                      <div className="voice-card__avatar" aria-hidden>
                        {voice.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")}
                      </div>
                      <div className="voice-card__body">
                        <div className="voice-card__name">{voice.name}</div>
                        <div className="voice-card__desc">{voice.description}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="voice-library__new">
                Yeni seslendirmen ekleyin
              </button>
            </div>

            <div className="voice-detail">
              <h3>Seçili seslendiren</h3>
              <div className="voice-detail__card">
                <div className="voice-detail__initials" aria-hidden>
                  {activeVoice.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")}
                </div>
                <div>
                  <div className="voice-detail__name">{activeVoice.name}</div>
                  <p className="voice-detail__description">
                    {activeVoice.description}
                  </p>
                </div>
              </div>
              <div className="voice-detail__hint">
                Timeline&apos;a sürüklediğiniz blokların üzerine tıklayarak süreyi
                düzenleyebilirsiniz.
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

