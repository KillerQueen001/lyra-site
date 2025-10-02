import { useMemo } from "react";
import { Link } from "react-router-dom";
import Hero from "../Hero";
import { useVideoCatalog } from "../hooks/useVideoCatalog";
import { getAgeRatingLabel } from "../utils/videoCatalog";
import "./Home.css";

export default function Home() {
  const { catalog, isLoading } = useVideoCatalog();
  const featured = useMemo(() => catalog.slice(0, 3), [catalog]);

  return (
    <div>
      <Hero />
      <main className="home-main">
        <section className="home-section">
          <div className="home-section-header">
            <h2>Popüler Videolar</h2>
            <Link to="/videos" className="home-link">
              Tüm videoları gör
            </Link>
          </div>
          {isLoading ? (
            <div className="home-loading" role="status">
              <span className="home-spinner" aria-hidden="true" />
              <span>Video katalogu yükleniyor...</span>
            </div>
          ) : featured.length === 0 ? (
            <p className="home-empty">Henüz vitrine eklenmiş video yok.</p>
          ) : (
            <div className="home-video-grid">
              {featured.map((video) => (
                <Link
                  key={video.id}
                  to={`/watch/${encodeURIComponent(video.id)}`}
                  className="home-video-card"
                >
                  <div className="home-video-thumb">
                    {video.thumbnail.src ? (
                      <img
                        src={video.thumbnail.src}
                        alt={`${video.title} için kapak görseli`}
                        loading="lazy"
                      />
                    ) : null}
                    <span>{getAgeRatingLabel(video.ageRating)}</span>
                  </div>
                  <div className="home-video-body">
                    <h3>{video.title}</h3>
                    <p>
                      {video.description ||
                        "Bu video için henüz açıklama eklenmemiş."}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}