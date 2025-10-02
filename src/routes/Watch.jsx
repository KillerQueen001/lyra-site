import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import XRayPanel from "../components/XRayPanel";
import { applyOverrides } from "../utils/castLocal";
import { buildCastListFromTimeline } from "../utils/timelineLocal";
import { xrayDemo } from "../data/xrayDemo"; // zaten var
import { findEpisodeByVideoId } from "../data/contents";
import { getVideoEntry, videoLibrary } from "../data/videoLibrary";
import { fetchVideoDetails } from "../utils/videoDetailsApi";
import { getAgeRatingLabel } from "../utils/videoCatalog";
import { loadHls } from "../utils/loadHls";
import {
  isHlsSource,
  resolveSingleVideo,
  resolveVideoSrc,
  USE_SINGLE_MP4,
} from "../utils/videoSource";
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
  const videoEntry = useMemo(() => getVideoEntry(id), [id]);
  const episodeInfo = useMemo(() => findEpisodeByVideoId(id), [id]);
  const fileQualities = useMemo(() => {
    if (!videoEntry?.files) return [];
    return Object.keys(videoEntry.files)
      .filter((key) => /^\d{3,4}$/.test(key))
      .sort((a, b) => Number(b) - Number(a));
  }, [videoEntry]);
  const qualityOptions = useMemo(
    () => (fileQualities.length ? fileQualities : QUALITIES),
    [fileQualities]
  );
  const defaultQuality = useMemo(() => {
    if (videoEntry?.defaultQuality) return videoEntry.defaultQuality;
    if (qualityOptions.includes("720")) return "720";
    return qualityOptions[0] || "720";
  }, [videoEntry, qualityOptions]);
  const [quality, setQuality] = useState(defaultQuality);
  useEffect(() => {
    setQuality(defaultQuality);
  }, [defaultQuality]);
  const src = useMemo(() => resolveVideoSrc(id, quality), [id, quality]);

  const isHls = useMemo(
    () => isHlsSource(src) || (videoEntry?.stream ? isHlsSource(videoEntry.stream) : false),
    [src, videoEntry]
  );

  const videoRef = useRef(null);
  const hlsRef = useRef(null);

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
  const toastTimerRef = useRef(null);
  const [videoDetails, setVideoDetails] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setVideoDetails(null);
    if (!id) return () => {
      cancelled = true;
    };
    (async () => {
      const details = await fetchVideoDetails(id);
      if (!cancelled) {
        setVideoDetails(details);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);
  const showToast = useCallback(
    (message, duration = 1800) => {
      setToast(message);
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (duration > 0) {
        toastTimerRef.current = window.setTimeout(() => {
          setToast("");
          toastTimerRef.current = null;
        }, duration);
      } else {
        toastTimerRef.current = null;
      }
    },
    [setToast]
  );

  const allowQualityMenu = !isHls && qualityOptions.length > 1;
  const detailsTitle = videoDetails?.title?.trim();
  const detailsDescription = videoDetails?.description?.trim();
  const ageRatingLabel = getAgeRatingLabel(videoDetails?.ageRating);
  const headerTitle =
    detailsTitle ||
    episodeInfo?.episode?.title ||
    videoEntry?.title ||
    "Player Sayfası";
  const fallbackSubtitle = episodeInfo
    ? `${episodeInfo.content.title}${
        episodeInfo.episode?.id ? ` • Bölüm ${episodeInfo.episode.id}` : ""
      }`
    : videoEntry?.description || "";
  const headerSubtitle = detailsDescription || fallbackSubtitle;
  const sourceLabel = isHls ? "HLS akışı" : "MP4 dosyası";
  const qualityHint = isHls
    ? "Bu video HLS (HTTP Live Streaming) formatında yayınlanıyor; kalite seçimi oynatıcı tarafından otomatik yapılır."
    : videoEntry?.files
    ? fileQualities.length
      ? `Tanımlı kalite dosyaları: ${fileQualities
          .map((q) => `${q}p`)
          .join(", ")}${videoEntry.files.single ? " + ana MP4" : ""}.`
      : "Bu video tek bir MP4 kaynağı ile yapılandırılmış durumda."
    : `Varsayılan kalite adlandırması: /videos/${id}_480.mp4, _720, _1080.`;

  const displayDescription =
    detailsDescription ||
    episodeInfo?.content?.description ||
    videoEntry?.description ||
    "Lyra Records arşivinden bir video.";

  const recommendedEpisodes = useMemo(() => {
    if (episodeInfo?.content?.episodes?.length) {
      const siblings = episodeInfo.content.episodes
        .filter((ep) => ep.videoId !== id)
        .map((ep) => {
          const entry = getVideoEntry(ep.videoId);
          return {
            id: ep.videoId,
            title: entry?.title || `${episodeInfo.content.title} — ${ep.title}`,
            description:
              entry?.description ||
              episodeInfo.content.description ||
              "Lyra Records arşivinden önerilen bölüm.",
            badge: ep.title,
            poster: entry?.poster || null,
          };
        });
      if (siblings.length) {
        return siblings;
      }
    }

    return Object.entries(videoLibrary)
      .filter(([videoId]) => videoId !== id)
      .map(([videoId, entry]) => ({
        id: videoId,
        title: entry.title,
        description:
          entry.description || "Lyra Records arşivinden önerilen bölüm.",
        badge: "Önerilen",
        poster: entry.poster || null,
      }));
  }, [episodeInfo, id]);

  useEffect(() => {
    if (!allowQualityMenu) {
      setQualityOpen(false);
    }
  }, [allowQualityMenu]);

  useEffect(() => () => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
  }, []);

  // X-Ray panel
  const [xrayOpen, setXrayOpen] = useState(false);
  const [allXray, setAllXray] = useState(() => {
    const timelineData = buildCastListFromTimeline(id, xrayDemo);
    return timelineData ? timelineData.items : [...xrayDemo];
  });
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
    const video = videoRef.current;
    if (!video || !src) return undefined;

    const detachHls = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    if (isHls) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        if (video.dataset.loadedSrc !== src) {
          video.src = src;
          video.load();
          video.dataset.loadedSrc = src;
        }
        return () => {
          detachHls();
        };
      }

      let cancelled = false;

      loadHls()
        .then((HlsLib) => {
          if (cancelled) return;
          const HlsCtor = HlsLib?.default ?? HlsLib;
          if (!HlsCtor || !HlsCtor.isSupported?.()) {
            showToast("Tarayıcı HLS akışını desteklemiyor.", 3000);
            return;
          }
          detachHls();
          const instance = new HlsCtor();
          hlsRef.current = instance;
          instance.loadSource(src);
          instance.attachMedia(video);
          video.dataset.loadedSrc = src;
        })
        .catch(() => {
          if (cancelled) return;
          showToast("HLS kütüphanesi yüklenemedi.", 3000);
        });

      return () => {
        cancelled = true;
        detachHls();
      };
    }

    detachHls();
    if (video.dataset.loadedSrc !== src) {
      video.src = src;
      video.load();
      video.dataset.loadedSrc = src;
    }

    return () => {
      detachHls();
    };
  }, [src, isHls, showToast]);

  useEffect(() => {
    function refresh() {
      if (!id) return;
      const timelineData = buildCastListFromTimeline(id, xrayDemo);
      if (timelineData) {
        setAllXray(timelineData.items);
      } else {
        setAllXray(applyOverrides(id, xrayDemo));
      }
    }
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("lyra:timeline-updated", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("lyra:timeline-updated", refresh);
    };
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
        if (!allowQualityMenu || isHls) {
      setQualityOpen(false);
      if (isHls) {
        showToast("HLS akışında kalite otomatik yönetilir.", 2200);
      }
      return;
    }
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
        showToast("Tek video kullanıldığı için kalite aynı dosyayla oynatılıyor.", 1800);
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
        showToast(`${q}p varyasyonu bulunamadı, tek dosya açılıyor.`, 2200);
        v.src = fallbackSrc;
        v.dataset.loadedSrc = fallbackSrc;
        v.load();
        return;
      }
      showToast(`${q}p bulunamadı, geri dönüyorum.`, 1600);
      const oldSrc = resolveVideoSrc(id, prevQuality);
      v.src = oldSrc;
      v.dataset.loadedSrc = oldSrc;      
      v.load();
      setQuality(prevQuality);
      setTimeout(() => setToast(""), 1600);
      v.removeEventListener("error", onError);
    };

    showToast(`Kalite değiştiriliyor: ${q}p…`, 1600);
    setQuality(q);
    setQualityOpen(false)
    v.src = newSrc;
    v.dataset.loadedSrc = newSrc;    
    v.load();
    v.addEventListener("loadedmetadata", onLoaded, { once: true });
    v.addEventListener("error", onError);
  }

  const progress = duration ? (current / duration) * 100 : 0;
  const hideCursor = !(controlsVisible || xrayOpen);

  return (
    <div className="watch-page">
      <div className="watch-breadcrumb">
        <Link to="/videos">Videolar</Link>
        {episodeInfo?.content && (
          <>
            <span>/</span>
            <Link to={`/content/${episodeInfo.contentId}`}>
              {episodeInfo.content.title}
            </Link>
          </>
        )}
        <span>/</span>
        <span>{episodeInfo?.episode?.title || headerTitle}</span>
      </div>

      <header className="watch-header">
        <div className="watch-header-info">
          <h1 className="watch-title">{headerTitle}</h1>
          {headerSubtitle && (
            <p className="watch-subtitle">{headerSubtitle}</p>
          )}
          <div className="watch-meta">
            <span>
              Yaş Sınırı: <b className="watch-accent">{ageRatingLabel}</b>
            </span>
            {episodeInfo?.episode?.title && <span>{episodeInfo.episode.title}</span>}
            <span>
              Video ID: <b className="watch-accent">{id}</b>
            </span>
            <span>
              Kaynak: <b className="watch-accent">{sourceLabel}</b>
            </span>
          </div>
        </div>

        <div className="watch-actions">
          <button
            type="button"
            className="watch-primary-btn"
            onClick={togglePlay}
          >
            İzlemeye Başla
          </button>
          <button
            type="button"
            onClick={() => window.open(`/cast/select/${id}`, "_blank", "noopener")}
            className="watch-secondary-btn"
          >
            Kast yerleştir
          </button>
        </div>
      </header>

      <div className="watch-layout">
        <main className="watch-main">
          <div className="watch-player-area">
            <div
              onMouseMove={showControlsTemporarily}
              onMouseLeave={() => {
                if (playing && !(speedOpen || qualityOpen || xrayOpen)) {
                  setControlsVisible(false);
                }
              }}
              onTouchStart={() => {
                setControlsVisible(true);
                scheduleAutoHide();
              }}
              className={`watch-player-shell${hideCursor ? " no-cursor" : ""}`}
            >
              <video
                ref={videoRef}
                controls={false}
                preload="metadata"
                className="watch-video"
                onClick={togglePlay}
                poster={
                  videoDetails?.thumbnail?.src || videoEntry?.poster || undefined
                }
              />

              <XRayPanel
                open={xrayOpen}
                onClose={() => setXrayOpen(false)}
                items={xrayItems}
              />

              {toast && <div className="watch-toast">{toast}</div>}

              <div className={`watch-controls${controlsVisible ? " is-visible" : ""}`}>
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

                <div className="watch-control-row">
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

                    />
                  </div>

                  <div className="watch-flex-spacer" />

                  <div className="watch-control-group">
                    <button
                      type="button"
                      onClick={() => setXrayOpen((o) => !o)}
                      aria-label="Castlar"
                      className="watch-control-button"
                    >
                      <Icon src="/icons/cast.png" />
                    </button>

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

                    <div className="menu-quality">
                      <button
                        type="button"
                        onClick={() => {
                          if (!allowQualityMenu) {
                            showToast("HLS akışında kalite otomatik seçilir.", 2200);
                            return;
                          }
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
                      {allowQualityMenu && (
                        <div className={`watch-dropdown${qualityOpen ? " is-open" : ""}`}>
                          <MenuCard title="Kalite">
                            {qualityOptions.map((q) => (
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
                      )}
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

          <p className="watch-description">{displayDescription}</p>

          <section className="watch-rating" aria-label="Video beğeni ve puanlama">
            <h3>Bu bölümü puanla</h3>
            <div className="rating-stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className="rating-star"
                  aria-label={`${star} yıldız ver`}
                >
                  ★
                </button>
              ))}
            </div>
          </section>

          <section className="watch-comment" aria-label="Video yorumları">
            <h3>Yorumunu bırak</h3>
            <textarea placeholder="Bu bölüm hakkında düşüncelerini paylaş..." />
            <button type="button">Yorumu Gönder</button>
          </section>

          <section className="watch-info-card" aria-label="Teknik bilgiler">
            <h3>Oynatıcı bilgileri</h3>
            <p className="watch-info-text">{qualityHint}</p>
            {src && (
              <p className="watch-info-text">
                Aktif kaynak: <code>{src}</code>
              </p>
            )}
          </section>
        </main>

        <aside className="watch-sidebar">
          <h3>Önerilen Videolar</h3>
          <div className="watch-recommended-list">
            {recommendedEpisodes.slice(0, 4).map((item) => (
              <Link
                key={item.id}
                to={`/watch/${item.id}`}
                className="watch-recommended-card"
              >
                <div className="watch-recommended-thumb">
                  {item.poster ? (
                    <img src={item.poster} alt="" loading="lazy" />
                  ) : (
                    <span className="watch-recommended-fallback">Lyra</span>
                  )}
                  <span>{item.badge}</span>
                </div>
                <div className="watch-recommended-info">
                  <h4>{item.title}</h4>
                  <p>{item.description}</p>
                  <div className="watch-recommended-meta">
                    <span>Video ID: {item.id}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
