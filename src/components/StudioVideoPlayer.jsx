import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadHls } from "../utils/loadHls";
import { getVideoEntry } from "../data/videoLibrary";
import {
  isHlsSource,
  resolveVideoSrc,
  resolveSingleVideo,
} from "../utils/videoSource";
import "./StudioVideoPlayer.css";

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export default function StudioVideoPlayer({
  videoId,
  videoRef: externalRef,
  className = "",
}) {
  const innerRef = useRef(null);
  const videoRef = externalRef ?? innerRef;
  const hlsRef = useRef(null);

  const entry = useMemo(() => getVideoEntry(videoId), [videoId]);
  const poster = entry?.poster;
  const src = useMemo(() => resolveVideoSrc(videoId), [videoId]);
  const fallbackSrc = useMemo(() => resolveSingleVideo(videoId), [videoId]);
  const [resolvedSrc, setResolvedSrc] = useState(src || fallbackSrc);
  const [isHls, setIsHls] = useState(() => isHlsSource(src || fallbackSrc));
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const nextSrc = src || fallbackSrc || "";
    setResolvedSrc(nextSrc);
    setIsHls(isHlsSource(nextSrc));
  }, [src, fallbackSrc]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resolvedSrc) return undefined;

    const detachHls = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    if (isHls) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        if (video.dataset.loadedSrc !== resolvedSrc) {
          video.src = resolvedSrc;
          video.load();
          video.dataset.loadedSrc = resolvedSrc;
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
            detachHls();
            const fallback = fallbackSrc || resolvedSrc;
            video.src = fallback;
            video.load();
            video.dataset.loadedSrc = fallback;
            setIsHls(isHlsSource(fallback));
            return;
          }
          detachHls();
          const instance = new HlsCtor();
          hlsRef.current = instance;
          instance.loadSource(resolvedSrc);
          instance.attachMedia(video);
          video.dataset.loadedSrc = resolvedSrc;
        })
        .catch(() => {
          if (cancelled) return;
          detachHls();
          if (fallbackSrc) {
            video.src = fallbackSrc;
            video.load();
            video.dataset.loadedSrc = fallbackSrc;
            setIsHls(isHlsSource(fallbackSrc));
          }
        });

      return () => {
        cancelled = true;
        detachHls();
      };
    }

    detachHls();
    if (video.dataset.loadedSrc !== resolvedSrc) {
      video.src = resolvedSrc;
      video.load();
      video.dataset.loadedSrc = resolvedSrc;
    }

    return () => {
      detachHls();
    };
  }, [resolvedSrc, isHls, fallbackSrc, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const handleLoaded = () => {
      setDuration(video.duration || 0);
      setCurrent(video.currentTime || 0);
      setPlaying(!video.paused);
      setMuted(video.muted);
      setVolume(video.muted ? 0 : video.volume);
    };
    const handleTime = () => setCurrent(video.currentTime || 0);
    const handlePlay = () => setPlaying(true);
    const handlePause = () => setPlaying(false);
    const handleVolume = () => {
      setMuted(video.muted);
      setVolume(video.muted ? 0 : video.volume);
    };

    video.addEventListener("loadedmetadata", handleLoaded);
    video.addEventListener("timeupdate", handleTime);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("volumechange", handleVolume);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoaded);
      video.removeEventListener("timeupdate", handleTime);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("volumechange", handleVolume);
    };
  }, [videoRef]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  }, [videoRef]);

  const onSeek = useCallback(
    (value) => {
      const video = videoRef.current;
      if (!video) return;
      const next = Number(value);
      if (!Number.isFinite(next)) return;
      video.currentTime = Math.min(Math.max(next, 0), video.duration || next);
    },
    [videoRef]
  );

  const onChangeVolume = useCallback(
    (value) => {
      const video = videoRef.current;
      if (!video) return;
      const next = Number(value);
      if (!Number.isFinite(next)) return;
      video.volume = Math.min(Math.max(next, 0), 1);
      if (video.muted && next > 0) {
        video.muted = false;
      }
    },
    [videoRef]
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, [videoRef]);

  const progress = duration > 0 ? Math.min((current / duration) * 100, 100) : 0;

  return (
    <div className={`studio-player ${className}`.trim()}>
      <div className="studio-player__viewport" onClick={togglePlay}>
        <video ref={videoRef} controls={false} poster={poster} />
        <button
          type="button"
          className={`studio-player__play${playing ? " is-playing" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            togglePlay();
          }}
        >
          {playing ? "⏸" : "▶"}
        </button>
      </div>

      <div className="studio-player__controls">
        <div className="studio-player__timing">
          <span>{formatTime(current)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(duration, 0.1)}
            step={0.1}
            value={current}
            onChange={(event) => onSeek(event.target.value)}
            style={{ "--studio-progress": `${progress}%` }}
          />
          <span>{formatTime(duration)}</span>
        </div>

        <div className="studio-player__bottom">
          <button
            type="button"
            className="studio-player__button"
            onClick={togglePlay}
            aria-label={playing ? "Duraklat" : "Oynat"}
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            className="studio-player__button"
            onClick={toggleMute}
            aria-label={muted ? "Sesi aç" : "Sesi kapat"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(event) => onChangeVolume(event.target.value)}
            className="studio-player__volume"
          />
        </div>
      </div>
    </div>
  );
}