import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVideoCatalog } from "../hooks/useVideoCatalog";
import { useGroups } from "../hooks/useGroups";
import {
  getAgeRatingLabel,
  resolveVideoSourceForCatalogEntry,
} from "../utils/videoCatalog";
import { loadHls } from "../utils/loadHls";
import { isHlsSource } from "../utils/videoSource";
import "./Videos.css";

export default function Videos() {
  const { catalog, isLoading } = useVideoCatalog();
  const { groups: groupsById } = useGroups();

  const spotlight = useMemo(() => catalog.slice(0, 1)[0] || null, [catalog]);
  const rest = useMemo(() => (spotlight ? catalog.slice(1) : catalog), [
    catalog,
    spotlight,
  ]);
    const groupNameById = useMemo(() => {
    const map = {};
    Object.entries(groupsById || {}).forEach(([groupId, entry]) => {
      map[groupId] = entry?.name || groupId;
    });
    return map;
  }, [groupsById]);

  return (
    <div className="videos-page">
      <div className="videos-noise" aria-hidden="true" />
      <header className="videos-header">
        <div className="videos-header-meta">
          <span className="videos-kicker">Stüdyo Kataloğu</span>
          <h1>Video Arşivi</h1>
          <p>
            Özenle hazırladığımız prodüksiyonları inceleyin, öne çıkan
            yapımlarımıza göz atın ve yeni içerikleri keşfetmeye başlayın.
          </p>
        </div>
        <div className="videos-count" aria-live="polite">
          {isLoading ? "Yükleniyor..." : `${catalog.length} içerik`}
          <span>güncel arşiv</span>
        </div>
      </header>

      {isLoading ? (
        <div className="videos-loading" role="status">
          <span className="videos-spinner" aria-hidden="true" />
          <span>Video bilgileri yükleniyor...</span>
        </div>
      ) : catalog.length === 0 ? (
        <div className="videos-empty">
          <h2>Henüz video eklenmemiş</h2>
          <p>
            Video düzenleyici üzerinden kaydedilen içerikler burada otomatik
            olarak listelenecek.
          </p>
        </div>
      ) : (
        <>
          {spotlight ? (
            <section className="videos-spotlight" aria-label="Öne çıkan video">
              <VideoCard
                video={spotlight}
                spotlight
                groupName={groupNameById[spotlight.groupId] || ""}
              />
            </section>
          ) : null}
          <div className="videos-grid" role="list">
            {rest.map((video, index) => (
              <VideoCard
                key={video.id}
                video={video}
                index={index}
                groupName={groupNameById[video.groupId] || ""}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function VideoCard({ video, spotlight = false, index = 0, groupName = "" }) {
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const previewTimer = useRef(null);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  const previewSrc = useMemo(
    () => resolveVideoSourceForCatalogEntry(video),
    [video]
  );

  const handlePointerEnter = useCallback(() => {
    window.clearTimeout(previewTimer.current);
    setIsHovering(true);
    previewTimer.current = window.setTimeout(() => {
      setIsPreviewing(true);
    }, 3000);
  }, []);

  const cancelPreview = useCallback(() => {
    setIsHovering(false);
    window.clearTimeout(previewTimer.current);
    previewTimer.current = null;
    setIsPreviewing(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, []);

  useEffect(() => {
    return () => {
      window.clearTimeout(previewTimer.current);
    };
  }, []);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return undefined;

    let cancelled = false;

    const detach = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    if (!previewSrc) {
      detach();
      delete videoElement.dataset.previewSrc;
      videoElement.removeAttribute("src");
      videoElement.load();
      return () => {
        cancelled = true;
        detach();
      };
    }

    const assignDirectSource = () => {
      if (videoElement.dataset.previewSrc === previewSrc) return;
      detach();
      videoElement.src = previewSrc;
      videoElement.load();
      videoElement.dataset.previewSrc = previewSrc;
    };

    if (isHlsSource(previewSrc)) {
      if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
        assignDirectSource();
      } else {
        loadHls()
          .then((HlsLib) => {
            if (cancelled) return;
            const HlsCtor = HlsLib?.default ?? HlsLib;
            if (!HlsCtor?.isSupported?.()) {
              assignDirectSource();
              return;
            }
            detach();
            const instance = new HlsCtor();
            hlsRef.current = instance;
            instance.loadSource(previewSrc);
            instance.attachMedia(videoElement);
            videoElement.dataset.previewSrc = previewSrc;
          })
          .catch(() => {
            if (cancelled) return;
            assignDirectSource();
          });
      }
    } else {
      assignDirectSource();
    }

    return () => {
      cancelled = true;
      detach();
      delete videoElement.dataset.previewSrc;
      videoElement.removeAttribute("src");
      videoElement.load();
    };
  }, [previewSrc]);

  useEffect(() => {
    if (!videoRef.current) return;
    if (isPreviewing) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [isPreviewing]);

  return (
    <Link
      to={`/watch/${encodeURIComponent(video.id)}`}
      className={`videos-card${spotlight ? " videos-card-spotlight" : ""}`}
      role={spotlight ? undefined : "listitem"}
      onMouseEnter={handlePointerEnter}
      onMouseLeave={cancelPreview}
      onFocus={handlePointerEnter}
      onBlur={cancelPreview}
      style={{
        animationDelay: !spotlight ? `${Math.min(index, 6) * 80}ms` : undefined,
      }}
    >
      <div className="videos-card-media">
        <div className="videos-card-thumb">
          {video.thumbnail.src ? (
            <img
              src={video.thumbnail.src}
              alt={`${video.title} için kapak görseli`}
              loading="lazy"
            />
          ) : (
            <div className="videos-card-thumb-fallback" aria-hidden="true">
              <span>Kapak yok</span>
            </div>
          )}
          <span className="videos-card-badge">
            {getAgeRatingLabel(video.ageRating)}
          </span>
        </div>

        <video
          ref={videoRef}
          className={`videos-card-preview${
            isPreviewing ? " is-visible" : ""
          }`}
          src={previewSrc}
          muted
          playsInline
          loop
          preload="metadata"
        />

        <div className="videos-card-glow" aria-hidden="true" />
        <div className="videos-card-hover-hint" aria-hidden="true">
          {isHovering && !isPreviewing ? "Ön izleme hazırlanıyor..." : ""}
        </div>
      </div>
      <div className="videos-card-body">
        <div className="videos-card-title">
          {spotlight ? <span className="videos-card-pill">Spotlight</span> : null}
          <h2>{video.title}</h2>
        </div>
        <p>{video.description || "Bu video için açıklama eklenmemiş."}</p>
        <div className="videos-card-meta">
          <span>{video.ageRatingLabel}</span>
          {groupName ? <span>{groupName}</span> : null}
          {video.updatedAt ? (
            <span>
              Güncellendi: {new Date(video.updatedAt).toLocaleDateString("tr-TR")}
            </span>
          ) : (
            <span>Yayınlanma: {video.base?.published || "-"}</span>
          )}
        </div>
      </div>
    </Link>
  );
}