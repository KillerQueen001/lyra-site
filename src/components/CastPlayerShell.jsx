import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import XRayPanel from "./XRayPanel";
import "../routes/Watch.css";

function formatTime(s) {
  if (!isFinite(s)) return "0:00";
  const minutes = Math.floor(s / 60);
  const seconds = Math.floor(s % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function Icon({ src, alt }) {
  return <img src={src} alt={alt || ""} className="watch-icon" />;
}

export default function CastPlayerShell({ videoRef, poster, castList = [] }) {
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);

  const hideTimerRef = useRef(null);

  const safeCastList = useMemo(() => (Array.isArray(castList) ? castList : []), [castList]);
  const activeXray = useMemo(
    () =>
      safeCastList.filter((item) =>
        item?.slots?.some((slot) => current >= slot.start && current <= slot.end)
      ),
    [safeCastList, current]
  );

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    if (!playing || panelOpen) return;
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, 2400);
  }, [playing, panelOpen, clearHideTimer]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    if (panelOpen) {
      setControlsVisible(true);
      clearHideTimer();
      return;
    }
    if (playing) {
      scheduleHide();
    } else {
      clearHideTimer();
      setControlsVisible(true);
    }
  }, [panelOpen, playing, clearHideTimer, scheduleHide]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoaded = () => {
      setDuration(video.duration || 0);
      setCurrent(video.currentTime || 0);
    };
    const onTime = () => setCurrent(video.currentTime || 0);
    const onPlay = () => {
      setPlaying(true);
      setPanelOpen(false);
      setControlsVisible(false);
      scheduleHide();
    };
    const onPause = () => {
      setPlaying(false);
      setPanelOpen(true);
      setControlsVisible(true);
      clearHideTimer();
    };
    const onEnded = () => {
      setPlaying(false);
      setPanelOpen(true);
      setControlsVisible(true);
      clearHideTimer();
    };

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
    };
  }, [videoRef, scheduleHide, clearHideTimer]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [videoRef]);

  const onSeek = useCallback(
    (value) => {
      const video = videoRef.current;
      if (!video) return;
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return;
      const clamped = Math.max(0, Math.min(duration || 0, numeric));
      video.currentTime = clamped;
      setCurrent(clamped);
    },
    [videoRef, duration]
  );

  const changeVol = useCallback((value) => {
    const vol = Number(value);
    setVolume(vol);
    setMuted(vol === 0);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => !prev);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    if (!muted) {
      video.volume = volume;
    }
  }, [videoRef, muted, volume]);

  const hideCursor = playing && !controlsVisible && !panelOpen;
  const progress = duration ? (current / duration) * 100 : 0;
  const volumeProgress = muted ? 0 : volume * 100;

  const togglePanel = useCallback(() => {
    setPanelOpen((open) => {
      const next = !open;
      if (next) {
        setControlsVisible(true);
        clearHideTimer();
      } else {
        scheduleHide();
      }
      return next;
    });
  }, [clearHideTimer, scheduleHide]);

  return (
    <div className="watch-player-area">
      <div
        className={`watch-player-shell${hideCursor ? " no-cursor" : ""}`}
        onMouseMove={showControls}
        onMouseLeave={() => {
          if (playing && !panelOpen) {
            setControlsVisible(false);
          }
        }}
        onTouchStart={() => {
          setControlsVisible(true);
          scheduleHide();
        }}
      >
        <video
          ref={videoRef}
          controls={false}
          preload="metadata"
          className="watch-video"
          onClick={togglePlay}
          poster={poster}
        />

        <XRayPanel
          open={panelOpen}
          onClose={() => {
            setPanelOpen(false);
            scheduleHide();
          }}
          items={activeXray}
        />

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
                style={{ "--watch-progress": `${volumeProgress}%` }}
              />
            </div>

            <div className="watch-flex-spacer" />

            <div className="watch-control-group">
              <button
                type="button"
                onClick={togglePanel}
                aria-label="Cast panelini aç/kapat"
                className="watch-control-button"
              >
                <Icon src="/icons/cast.png" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}