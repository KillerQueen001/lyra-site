import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import XRayPanel from "../components/XRayPanel";
import { applyOverrides } from "../utils/castLocal";
import { xrayDemo } from "../data/xrayDemo"; // zaten var
import { resolveSingleVideo, resolveVideoSrc, USE_SINGLE_MP4 } from "../utils/videoSource";
import "./Watch.css";

const QUALITIES = ["480", "720", "1080"];

function formatTime(s) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

/** ikon */
function Icon({ src, alt }) {
  return <img src={src} alt={alt || ""} className="watch-icon" />;
}

function MenuCard({ title, children }) {
  return (
    <div className="watch-dropdown-card">
      <div className="watch-dropdown-title">{title}</div>
      {children}
    </div>
  );
}
function MenuItem({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`watch-menu-item${active ? " is-active" : ""}`}
    >
      {label} {active ? "✓" : ""}
    </button>
  );
}

export default function Watch() {
  const { id } = useParams();
  const [quality, setQuality] = useState("720");
  const src = useMemo(() => resolveVideoSrc(id, quality), [id, quality]);

  const videoRef = useRef(null);

  // durumlar
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  const [speedOpen, setSpeedOpen] = useState(false);
  const [speed, setSpeed] = useState(1);

  const [qualityOpen, setQualityOpen] = useState(false);
  const [toast, setToast] = useState("");

  // X-Ray panel
  const [xrayOpen, setXrayOpen] = useState(false);
  const [allXray, setAllXray] = useState(() => [...xrayDemo]);
  const [xrayItems, setXrayItems] = useState([]);

  // auto-hide controls
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleAutoHide = useCallback(() => {
    if (!playing) return;
    if (speedOpen || qualityOpen || xrayOpen) return; // panel açıkken gizleme
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, 5000);
  }, [playing, speedOpen, qualityOpen, xrayOpen, clearHideTimer]);

  const showControlsTemporarily = useCallback(() => {
    setControlsVisible(true);
    scheduleAutoHide();
  }, [scheduleAutoHide]);

  // X-Ray demo (slotlara göre filtre)
  useEffect(() => {
    const t = current;
    const visible = allXray.filter((item) =>
      item.slots?.some((s) => t >= s.start && t <= s.end)
    );
    setXrayItems(visible);
  }, [current, allXray]);

  // video event’leri
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => {
      setDuration(v.duration || 0);
      setPlaying(!v.paused);
    };
    const onTime = () => setCurrent(v.currentTime || 0);
    const onPlay = () => {
      setPlaying(true);
      setXrayOpen(false); // oynarken panel kapansın
      clearHideTimer();
      setControlsVisible(false);
      scheduleAutoHide();
    };
    const onPause = () => {
      setPlaying(false);
      setXrayOpen(true); // pause → panel aç
      clearHideTimer();
      setControlsVisible(true);
    };

    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, [scheduleAutoHide, clearHideTimer]);

  useEffect(() => {
    function refresh() {
      if (!id) return;
      setAllXray(applyOverrides(id, xrayDemo));
    }
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [id]);

  // hız & ses
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    if (!muted) v.volume = volume;
  }, [muted, volume]);

  // dış tık menüler
  useEffect(() => {
    const close = (e) => {
      const target = e.target;
      if (target instanceof HTMLElement) {
        if (!target.closest?.(".menu-speed")) setSpeedOpen(false);
        if (!target.closest?.(".menu-quality")) setQualityOpen(false);
      }
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  // aksiyonlar
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  };
  const onSeek = (val) => {
    const v = videoRef.current;
    if (!v) return;
    const to = Number(val);
    v.currentTime = to;
    setCurrent(to);
  };
  const changeVol = (val) => {
    const value = Number(val);
    setVolume(value);
    setMuted(value === 0);
  };
  const toggleMute = () => setMuted((m) => !m);
  const enterFs = () => {
    const el = videoRef.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  // kalite değiştir (pozisyonu koru)
  async function setQualityAndStay(q) {
    if (!id || q === quality) {
      setQualityOpen(false);
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    const wasPlaying = !v.paused;
    const t = v.currentTime;
    const prevQuality = quality;
    const currentSrc = resolveVideoSrc(id, prevQuality);
    const newSrc = resolveVideoSrc(id, q);
    const fallbackSrc = resolveSingleVideo(id);

    if (newSrc === currentSrc) {
      setQuality(q);
      setQualityOpen(false);
      if (USE_SINGLE_MP4) {
        setToast("Tek video kullanıldığı için kalite aynı dosyayla oynatılıyor.");
        setTimeout(() => setToast(""), 1800);
      }
      return;
    }

    let triedSingle = false;

    const onLoaded = () => {
      v.currentTime = t;
      setToast("");
      if (wasPlaying) {
        v.play().catch(() => {});
      }
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("error", onError);
      scheduleAutoHide();
    };
    const onError = () => {
            if (!triedSingle && fallbackSrc && fallbackSrc !== newSrc) {
        triedSingle = true;
        setToast(`${q}p varyasyonu bulunamadı, tek dosya açılıyor.`);
        v.src = fallbackSrc;
        v.load();
        return;
      }
      setToast(`${q}p bulunamadı, geri dönüyorum.`);
      const oldSrc = resolveVideoSrc(id, prevQuality);
      v.src = oldSrc;
      v.load();
      setQuality(prevQuality);
      setTimeout(() => setToast(""), 1600);
      v.removeEventListener("error", onError);
    };

    setToast(`Kalite değiştiriliyor: ${q}p…`);
    setQuality(q);
    setQualityOpen(false)
    v.src = newSrc;
    v.load();
    v.addEventListener("loadedmetadata", onLoaded, { once: true });
    v.addEventListener("error", onError);
  }

  const progress = duration ? (current / duration) * 100 : 0;
  const hideCursor = !(controlsVisible || xrayOpen);

  return (
    <div className="watch-page">
      <p>
        <Link to="/" className="watch-back-link">
          ← Listeye dön
        </Link>
      </p>

      <div className="watch-header">
        <div>
          <h1 className="watch-title">Player Sayfası</h1>
          <p className="watch-subtitle">
            Video ID: <b className="watch-accent">{id}</b>
          </p>
        </div>

        {/* Kast yerleştir (yeni sekme) */}
        <button
          type="button"
          onClick={() => window.open(`/cast/select/${id}`, "_blank", "noopener")}
          className="watch-open-cast-button"
        >
          Kast yerleştir
        </button>
      </div>

      {/* Player kabuğu */}
      <div className="watch-layout">
        <div
          onMouseMove={showControlsTemporarily}
          onMouseLeave={() => {
            if (playing && !(speedOpen || qualityOpen || xrayOpen)) setControlsVisible(false);
          }}
          onTouchStart={() => {
            setControlsVisible(true);
            scheduleAutoHide();
          }}
          className={`watch-player-shell${hideCursor ? " no-cursor" : ""}`}
        >
          <video
            ref={videoRef}
            src={src}
            controls={false}
            preload="metadata"
            className="watch-video"
            onClick={togglePlay}
          />

          {/* === Castlar Paneli (X-Ray) === */}
          <XRayPanel open={xrayOpen} onClose={() => setXrayOpen(false)} items={xrayItems} />

          {/* küçük toast */}
          {toast && (
            <div className="watch-toast">{toast}</div>
          )}

          {/* Kontrol barı */}
          <div className={`watch-controls${controlsVisible ? " is-visible" : ""}`}>
            {/* süre çubuğu */}
            <div className="watch-timeline">
              <div className="watch-time">{formatTime(current)}</div>

              <input
                className="watch-range"
                type="range"
                min={0}
                max={Math.max(duration, 0.1)}
                step={0.1}
                value={current}
                onChange={(e) => onSeek(e.currentTarget.value)}
                style={{ "--watch-progress": `${progress}%` }}
              />
              <div className="watch-time watch-time-right">{formatTime(duration)}</div>
            </div>

            {/* butonlar */}
            <div className="watch-control-row">
              {/* sol */}
              <div className="watch-control-group">
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={playing ? "Duraklat" : "Oynat"}
                  className="watch-control-button"
                >
                  <Icon src={playing ? "/icons/pause.png" : "/icons/play.png"} />
                </button>

                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={muted ? "Sesi aç" : "Sesi kapat"}
                  className="watch-control-button"
                >
                  <Icon src={muted ? "/icons/mute.png" : "/icons/volume.png"} />
                </button>
                <input
                  className="watch-range watch-volume-range"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(e) => changeVol(e.currentTarget.value)}
                  style={{ width: 120, background: COLORS.track }}
                />
              </div>

              <div className="watch-flex-spacer" />

              {/* sağ */}
              <div className="watch-control-group">
                {/* Castlar */}
                <button
                  type="button"
                  onClick={() => setXrayOpen((o) => !o)}
                  aria-label="Castlar"
                  className="watch-control-button"
                >
                  <Icon src="/icons/cast.png" />
                </button>

                {/* hız */}
                <div className="menu-speed">
                  <button
                    type="button"
                    onClick={() => { 
                      const next = !speedOpen;
                      setSpeedOpen(next);
                      clearHideTimer();
                      if (!next) scheduleAutoHide();
                    }}
                    aria-label="Hız"
                    className="watch-control-button"
                  >
                    <img
                      src="/icons/speed.png"
                      alt=""
                      className={`watch-speed-icon${speedOpen ? " is-open" : ""}`}
                    />
                  </button>
                  <div className={`watch-dropdown${speedOpen ? " is-open" : ""}`}>
                    <MenuCard title="Oynatma Hızı">
                      {[0.5, 1, 1.25, 1.5, 2].map((s) => (
                        <MenuItem
                          key={s}
                          active={s === speed}
                          label={`${s}×`}
                          onClick={() => {
                            setSpeed(s);
                            setSpeedOpen(false);
                            scheduleAutoHide();
                          }}
                        />
                      ))}
                    </MenuCard>
                  </div>
                </div>

                {/* kalite */}
                <div className="menu-quality">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !qualityOpen;
                      setQualityOpen(next);
                      clearHideTimer();
                      if (!next) scheduleAutoHide();
                    }}
                    aria-label="Kalite"
                    className="watch-control-button"
                  >
                    <Icon src="/icons/quality.png" />
                  </button>
                  <div className={`watch-dropdown${qualityOpen ? " is-open" : ""}`}>
                    <MenuCard title="Kalite">
                      {QUALITIES.map((q) => (
                        <MenuItem
                          key={q}
                          active={q === quality}
                          label={`${q}p`}
                          onClick={() => {
                            setQualityAndStay(q);
                          }}
                        />
                      ))}
                    </MenuCard>
                  </div>
                </div>

                <button
                  type="button"
                  className="watch-control-button"
                  onClick={enterFs}
                  aria-label="Tam ekran"
                >
                  <Icon src="/icons/fullscreen.png" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="watch-info-text">
        Kalite adlandırması: <code>{`/videos/${id}_480.mp4`}</code>, <code>_720</code>, <code>_1080</code>.
      </p>
    </div>
  );
}

