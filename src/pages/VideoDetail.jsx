import { Link, useParams } from "react-router-dom";
import "./VideoDetail.css";

const videos = {
  1: {
    title: "Lyra Video 1",
    src: "/sample.mp4",
    description:
      "Lyra Records stüdyosunda kaydedilen bu özel performans, grubun albüm hazırlık sürecine dair samimi bir pencere aralıyor.",
    episode: "Bölüm 1",
    duration: "24:16",
    releaseDate: "12 Şubat 2024",
    views: "12.4K",
    tags: ["Stüdyo", "Performans"],
    badge: "Yeni"
  },
  2: {
    title: "Lyra Video 2",
    src: "/sample.mp4",
    description:
      "Grubun dünya turnesi hazırlıkları ve sahne arkası görüntülerinden oluşan bu bölümde, Lyra Records ekibinin dinamizmini izleyin.",
    episode: "Bölüm 2",
    duration: "19:05",
    releaseDate: "26 Şubat 2024",
    views: "9.1K",
    tags: ["Turne", "Vlog"],
    badge: "Popüler"
  },
  3: {
    title: "Lyra Video 3",
    src: "/sample.mp4",
    description:
      "Akustik düzenlemelerin anlatıldığı bu kayıt, şarkıların sade halleriyle buluşmamızı sağlıyor ve hikâyelerini yeniden keşfetmemizi sağlıyor.",
    episode: "Bölüm 3",
    duration: "28:42",
    releaseDate: "4 Mart 2024",
    views: "7.6K",
    tags: ["Akustik", "Atölye"],
    badge: "Öne Çıkan"
  },
  4: {
    title: "Lyra Video 4",
    src: "/sample.mp4",
    description:
      "Lyra Records sanatçılarının ortak jamming seansından kesitler ve prodüksiyon sürecinden ipuçları bu videoda yer alıyor.",
    episode: "Bölüm 4",
    duration: "21:18",
    releaseDate: "18 Mart 2024",
    views: "5.3K",
    tags: ["Jam", "Prodüksiyon"],
    badge: "Sıradaki"
  }
};

export default function VideoDetail() {
  const { id } = useParams();
  const video = videos[id];

  if (!video) {
    return <h1 style={{ color: "white", padding: "48px" }}>Video bulunamadı.</h1>;
  }

  const recommendedVideos = Object.entries(videos)
    .filter(([videoId]) => videoId !== id)
    .map(([videoId, data]) => ({ id: videoId, ...data }));

  return (
    <div className="video-detail-page">
      <div className="video-breadcrumb">
        <Link to="/videos">Videolar</Link>
        <span>/</span>
        <span>{video.episode}</span>
      </div>

      <header className="video-detail-header">
        <div>
          <h1>{video.title}</h1>
          <div className="video-meta">
            <span>{video.episode}</span>
            <span>Süre: {video.duration}</span>
            <span>Yayın: {video.releaseDate}</span>
            <span>{video.views} izlenme</span>
          </div>
        </div>
        <div className="video-actions">
          <button type="button" className="video-primary-btn">
            İzlemeye Başla
          </button>
          <button type="button" className="video-secondary-btn">
            Listeye Ekle
          </button>
        </div>
      </header>

      <div className="video-detail-content">
        <main>
          <div className="video-player-wrapper">
            <video
              key={id}
              src={video.src}
              controls
              preload="metadata"
              className="video-player"
            />
          </div>

          <p className="video-description">{video.description}</p>

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
            <textarea placeholder="Bu bölüm hakkında düşüncelerini paylaş..." />
            <button type="button">Yorumu Gönder</button>
          </section>
        </main>

        <aside className="video-sidebar">
          <h3>Önerilen Videolar</h3>
          <div className="recommended-list">
            {recommendedVideos.map((item) => (
              <Link key={item.id} to={`/videos/${item.id}`} className="recommended-card">
                <div className="recommended-thumb">
                  <span>{item.badge}</span>
                </div>
                <div className="recommended-info">
                  <h4>{item.title}</h4>
                  <p>{item.description}</p>
                  <div className="recommended-meta">
                    <span>{item.episode}</span>
                    <span>{item.duration}</span>
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