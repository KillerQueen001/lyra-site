import { Link, useParams } from "react-router-dom";
import { useMemo } from "react";
import { useVideoCatalog } from "../hooks/useVideoCatalog";
import { getAgeRatingLabel, resolveVideoSourceForCatalogEntry } from "../utils/videoCatalog";
import "./VideoDetail.css";

export default function VideoDetail() {
  const { id } = useParams();
  const { catalog, catalogMap, isLoading } = useVideoCatalog();
  const video = id ? catalogMap[id] : null;

  const recommendedVideos = useMemo(() => {
    if (!catalog.length) return [];
    return catalog.filter((entry) => entry.id !== id).slice(0, 6);
  }, [catalog, id]);

  const playbackSource = useMemo(
    () => resolveVideoSourceForCatalogEntry(video),
    [video]
  );

  if (isLoading && !video) {
    return (
      <div className="video-detail-page" role="status">
        <div className="video-loading">
          <span className="video-loading-spinner" aria-hidden="true" />
          <span>Video bilgileri yükleniyor...</span>
        </div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="video-detail-page">
        <h1 style={{ color: "white", padding: "48px" }}>Video bulunamadı.</h1>
      </div>
    );
  }

  const updatedLabel = video.updatedAt
    ? new Date(video.updatedAt).toLocaleDateString("tr-TR")
    : null;

  return (
    <div className="video-detail-page">
      <div className="video-breadcrumb">
        <Link to="/videos">Videolar</Link>
        <span>/</span>
        <span>{video.title}</span>
      </div>

      <header className="video-detail-header">
        <div>
          <h1>{video.title}</h1>
          <div className="video-meta">
            <span>{getAgeRatingLabel(video.ageRating)}</span>
            {updatedLabel ? <span>Güncellendi: {updatedLabel}</span> : null}
          </div>
        </div>
        <div className="video-actions">
          <a
            href={`/watch/${encodeURIComponent(video.id)}`}
            className="video-primary-btn"
          >
            İzlemeye Başla
          </a>
          <button type="button" className="video-secondary-btn">
            Listeye Ekle
          </button>
        </div>
      </header>

      <div className="video-detail-content">
        <main>
          <div className="video-player-wrapper">
            <video
              key={video.id}
              src={playbackSource}
              poster={video.thumbnail.src || undefined}
              controls
              preload="metadata"
              className="video-player"
            />
          </div>

          <p className="video-description">
            {video.description || "Bu video için henüz açıklama eklenmemiş."}
          </p>

          <section className="video-rating" aria-label="Video beğeni ve puanlama">
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

          <section className="comment-section" aria-label="Video yorumları">
            <h3>Yorumunu bırak</h3>
            <textarea placeholder="Bu video hakkında düşüncelerini paylaş..." />
            <button type="button">Yorumu Gönder</button>
          </section>
        </main>

        <aside className="video-sidebar">
          <h3>Önerilen Videolar</h3>
          <div className="recommended-list">
            {recommendedVideos.map((item) => (
              <Link
                key={item.id}
                to={`/videos/${encodeURIComponent(item.id)}`}
                className="recommended-card"
              >
                <div className="recommended-thumb">
                  {item.thumbnail.src ? (
                    <img
                      src={item.thumbnail.src}
                      alt={`${item.title} kapak görseli`}
                      loading="lazy"
                    />
                  ) : null}
                  <span>{getAgeRatingLabel(item.ageRating)}</span>
                </div>
                <div className="recommended-info">
                  <h4>{item.title}</h4>
                  <p>{item.description || "Bu video için açıklama eklenmemiş."}</p>
                  {item.updatedAt ? (
                    <div className="recommended-meta">
                      <span>
                        {new Date(item.updatedAt).toLocaleDateString("tr-TR")}
                      </span>
                    </div>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}