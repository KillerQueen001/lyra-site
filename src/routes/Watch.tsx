import { Link, useParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import XRayPanel from "../components/XRayPanel";
import type { XRayItem } from "../components/XRayPanel";
import { applyOverrides } from "../utils/castLocal";
import { xrayDemo } from "../data/xrayDemo"; // zaten var

/** Lyra renk paleti */
const COLORS = {
  bg: "rgba(18,18,24,0.88)",
  card: "#1b1b24",
  text: "#eee",
  textMuted: "#bfb8d6",
  accent: "#7c4bd9",
  accentSoft: "#b598ff",
  track: "#3a334a",
  border: "rgba(255,255,255,.14)",
};

type Q = "480" | "720" | "1080";
const QUALITIES: Q[] = ["480", "720", "1080"];

function formatTime(s: number) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}
function srcFor(id: string | undefined, q: Q) {
  if (!id) return "";
  return `/videos/${id}_${q}.mp4`;
}

/** ikon */
function Icon({ src, alt }: { src: string; alt?: string }) {
  return (
    <img
      src={src}
      alt={alt || ""}
      style={{ width: 28, height: 28, objectFit: "contain", display: "block" }}
    />
  );
}

/** buton style */
function btnStyle(): React.CSSProperties {
  return {
    width: 42,
    height: 42,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    transition: "background .18s ease",
  };
}
function hoverize(e: React.MouseEvent<HTMLButtonElement>, on = true) {
  e.currentTarget.style.background = on ? "rgba(124,75,217,0.18)" : "transparent";
}

/** menü */
function dropdownStyle(open: boolean): React.CSSProperties {
  return {
    position: "absolute",
    right: 0,
    bottom: 42,
    pointerEvents: open ? "auto" : "none",
    opacity: open ? 1 : 0,
    transform: open ? "translateY(0)" : "translateY(6px)",
    transition: "opacity .16s ease, transform .16s ease",
  };
}
function MenuCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        minWidth: 140,
        padding: 8,
        borderRadius: 12,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.card,
        color: COLORS.text,
        boxShadow: "0 12px 40px rgba(0,0,0,.35)",
      }}
    >
      <div style={{ fontSize: 12, color: COLORS.textMuted, margin: "2px 6px 8px" }}>{title}</div>
      {children}
    </div>
  );
}
function MenuItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "8px 10px",
        borderRadius: 8,
        border: "none",
        background: active ? "rgba(124,75,217,.18)" : "transparent",
        color: active ? COLORS.accentSoft : COLORS.text,
        cursor: "pointer",
      }}
    >
      {label} {active ? "✓" : ""}
    </button>
  );
}

export default function Watch() {
  const { id } = useParams();
  const [quality, setQuality] = useState<Q>("720");
  const src = useMemo(() => srcFor(id, quality), [id, quality]);

  const videoRef = useRef<HTMLVideoElement>(null);

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
  const [allXray, setAllXray] = useState<XRayItem[]>(xrayDemo);
  const [xrayItems, setXrayItems] = useState<XRayItem[]>([]);

  // auto-hide controls
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

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
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest?.(".menu-speed")) setSpeedOpen(false);
      if (!t.closest?.(".menu-quality")) setQualityOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  // aksiyonlar
  const togglePlay = () => {
    const v = videoRef.current!;
    if (v.paused) {
      v.play().catch(() => {});
    } else v.pause();
  };
  const onSeek = (val: number | string) => {
    const v = videoRef.current!;
    const to = Number(val);
    v.currentTime = to;
    setCurrent(to);
  };
  const changeVol = (val: number | string) => {
    const v = Number(val);
    setVolume(v);
    setMuted(v === 0);
  };
  const toggleMute = () => setMuted((m) => !m);
  const enterFs = () => {
    const el = videoRef.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  // kalite değiştir (pozisyonu koru)
  async function setQualityAndStay(q: Q) {
    if (!id || q === quality) {
      setQualityOpen(false);
      return;
    }
    const v = videoRef.current!;
    const wasPlaying = !v.paused;
    const t = v.currentTime;

    const newSrc = srcFor(id, q);
    setToast(`Kalite değiştiriliyor: ${q}p…`);
    setQuality(q);
    setQualityOpen(false);

    const onLoaded = () => {
      v.currentTime = t;
      setToast("");
      if (wasPlaying) {
        v.play().catch(() => {});
      }
      v.removeEventListener("loadedmetadata", onLoaded);
      scheduleAutoHide();
    };
    const onError = () => {
      setToast(`${q}p bulunamadı, geri dönüyorum.`);
      const oldSrc = srcFor(id, quality);
      v.src = oldSrc;
      v.load();
      v.currentTime = t;
      if (wasPlaying) {
        v.play().catch(() => {});
      }
      setTimeout(() => setToast(""), 1600);
      v.removeEventListener("error", onError);
      setQuality(quality);
    };

    v.src = newSrc;
    v.load();
    v.addEventListener("loadedmetadata", onLoaded, { once: true });
    v.addEventListener("error", onError, { once: true });
  }

  return (
    <div style={{ padding: 24 }}>
      <p>
        <Link to="/" style={{ color: COLORS.accent }}>
          ← Listeye dön
        </Link>
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: "12px 0", color: COLORS.text, fontSize: 36, fontWeight: 800 }}>
            Player Sayfası
          </h1>
          <p style={{ marginBottom: 12, color: COLORS.text }}>
            Video ID: <b style={{ color: COLORS.accent }}>{id}</b>
          </p>
        </div>

        {/* Kast yerleştir (yeni sekme) */}
        <button
          onClick={() => window.open(`/cast/select/${id}`, "_blank", "noopener")}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.card,
            color: COLORS.text,
            cursor: "pointer",
          }}
        >
          Kast yerleştir
        </button>
      </div>

      {/* Player kabuğu */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div
          onMouseMove={showControlsTemporarily}
          onMouseLeave={() => {
            if (playing && !(speedOpen || qualityOpen || xrayOpen)) setControlsVisible(false);
          }}
          onTouchStart={() => {
            setControlsVisible(true);
            scheduleAutoHide();
          }}
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 960,
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 10px 40px rgba(0,0,0,.35)",
            background: "#000",
            cursor: controlsVisible || xrayOpen ? "default" : "none",
          }}
        >
          <video
            ref={videoRef}
            src={src}
            controls={false}
            preload="metadata"
            style={{ display: "block", width: "100%", height: "auto" }}
            onClick={togglePlay}
          />

          {/* === Castlar Paneli (X-Ray) === */}
          <XRayPanel open={xrayOpen} onClose={() => setXrayOpen(false)} items={xrayItems} />

          {/* küçük toast */}
          {toast && (
            <div
              style={{
                position: "absolute",
                left: 12,
                bottom: 70,
                padding: "6px 10px",
                borderRadius: 8,
                background: "rgba(18,18,24,.9)",
                color: "#eee",
                fontSize: 12,
                border: `1px solid ${COLORS.border}`,
                zIndex: 5,
              }}
            >
              {toast}
            </div>
          )}

          {/* Kontrol barı */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "10px 12px 12px",
              background: COLORS.bg,
              backdropFilter: "blur(8px)",
              borderTop: `1px solid ${COLORS.border}`,
              color: COLORS.text,
              opacity: controlsVisible ? 1 : 0,
              pointerEvents: controlsVisible ? "auto" : "none",
              transition: "opacity .25s ease",
              zIndex: 40,
            }}
          >
            {/* süre çubuğu */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "56px 1fr 56px",
                gap: 8,
                alignItems: "center",
              }}
            >
              <div style={{ fontSize: 12, color: COLORS.textMuted }}>{formatTime(current)}</div>
              <input
                className="range"
                type="range"
                min={0}
                max={Math.max(duration, 0.1)}
                step={0.1}
                value={current}
                onChange={(e) => onSeek(e.currentTarget.value)}
                style={{
                  width: "100%",
                  background: `linear-gradient(90deg, ${COLORS.accent} ${
                    (duration ? current / duration : 0) * 100
                  }%, ${COLORS.track} 0)`,
                }}
              />
              <div style={{ fontSize: 12, color: COLORS.textMuted, textAlign: "right" }}>
                {formatTime(duration)}
              </div>
            </div>

            {/* butonlar */}
            <div
              style={{
                marginTop: 10,
                display: "flex",
                alignItems: "center",
                gap: 10,
                justifyContent: "space-between",
              }}
            >
              {/* sol */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={togglePlay}
                  aria-label={playing ? "Duraklat" : "Oynat"}
                  style={btnStyle()}
                  onMouseEnter={(e) => hoverize(e, true)}
                  onMouseLeave={(e) => hoverize(e, false)}
                >
                  <Icon src={playing ? "/icons/pause.png" : "/icons/play.png"} />
                </button>

                <button
                  onClick={toggleMute}
                  aria-label={muted ? "Sesi aç" : "Sesi kapat"}
                  style={btnStyle()}
                  onMouseEnter={(e) => hoverize(e, true)}
                  onMouseLeave={(e) => hoverize(e, false)}
                >
                  <Icon src={muted ? "/icons/mute.png" : "/icons/volume.png"} />
                </button>
                <input
                  className="range"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(e) => changeVol(e.currentTarget.value)}
                  style={{ width: 120, background: COLORS.track }}
                />
              </div>

              <div style={{ flex: 1 }} />

              {/* sağ */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {/* Castlar */}
                <button
                  onClick={() => setXrayOpen((o) => !o)}
                  aria-label="Castlar"
                  style={btnStyle()}
                  onMouseEnter={(e) => hoverize(e, true)}
                  onMouseLeave={(e) => hoverize(e, false)}
                >
                  <Icon src="/icons/cast.png" />
                </button>

                {/* hız */}
                <div className="menu-speed" style={{ position: "relative" }}>
                  <button
                    onClick={() => {
                      const next = !speedOpen;
                      setSpeedOpen(next);
                      clearHideTimer();
                      if (!next) scheduleAutoHide();
                    }}
                    aria-label="Hız"
                    style={btnStyle()}
                    onMouseEnter={(e) => hoverize(e, true)}
                    onMouseLeave={(e) => hoverize(e, false)}
                  >
                    <img
                      src="/icons/speed.png"
                      alt=""
                      style={{
                        width: 28,
                        height: 28,
                        transform: speedOpen ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform .18s",
                      }}
                    />
                  </button>
                  <div style={dropdownStyle(speedOpen)}>
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
                <div className="menu-quality" style={{ position: "relative" }}>
                  <button
                    onClick={() => {
                      const next = !qualityOpen;
                      setQualityOpen(next);
                      clearHideTimer();
                      if (!next) scheduleAutoHide();
                    }}
                    aria-label="Kalite"
                    style={btnStyle()}
                    onMouseEnter={(e) => hoverize(e, true)}
                    onMouseLeave={(e) => hoverize(e, false)}
                  >
                    <Icon src="/icons/quality.png" />
                  </button>
                  <div style={dropdownStyle(qualityOpen)}>
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
                  onClick={enterFs}
                  aria-label="Tam ekran"
                  style={btnStyle()}
                  onMouseEnter={(e) => hoverize(e, true)}
                  onMouseLeave={(e) => hoverize(e, false)}
                >
                  <Icon src="/icons/fullscreen.png" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p style={{ marginTop: 10, color: COLORS.textMuted, fontSize: 12 }}>
        Kalite adlandırması: <code>{`/videos/${id}_480.mp4`}</code>, <code>_720</code>, <code>_1080</code>.
      </p>
    </div>
  );
}

