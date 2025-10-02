import { Link } from "react-router-dom";
import { useVideoCatalog } from "../hooks/useVideoCatalog";
import { getAgeRatingLabel } from "../utils/videoCatalog";
import "./Videos.css";

export default function Videos() {
  const { catalog, isLoading } = useVideoCatalog();

  return (
    <div className="videos-page">
      <header className="videos-header">
        <div>
          <h1>Video Arşivi</h1>
          <p>
            Stüdyomuzda hazırlanan tüm videoları burada keşfedebilir, detaylarına
            ulaşabilir ve izlemeye başlayabilirsiniz.
          </p>
        </div>
        <div className="videos-count" aria-live="polite">
          {isLoading ? "Yükleniyor..." : `${catalog.length} video`}
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
        <div className="videos-grid" role="list">
          {catalog.map((video) => (
            <Link
              key={video.id}
              to={`/videos/${encodeURIComponent(video.id)}`}
              className="videos-card"
              role="listitem"
            >
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
              <div className="videos-card-body">
                <h2>{video.title}</h2>
                <p>{video.description || "Bu video için açıklama eklenmemiş."}</p>
                {video.updatedAt ? (
                  <span className="videos-card-meta">
                    Güncellendi: {new Date(video.updatedAt).toLocaleDateString("tr-TR")}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}