import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useGroups } from "../hooks/useGroups";
import { useVideoCatalog } from "../hooks/useVideoCatalog";
import "./GroupDetail.css";

export default function GroupDetail() {
  const { slug } = useParams();
  const {
    groups,
    status,
    error,
    reload,
  } = useGroups();
  const { catalog, isLoading: catalogLoading } = useVideoCatalog();

  const isGroupsLoading = status === "idle" || status === "loading";
  const group = groups[slug];

  const groupVideos = useMemo(() => {
    if (!slug) return [];
    return catalog.filter((video) => video.groupId === slug);
  }, [catalog, slug]);

  if (isGroupsLoading) {
    return (
      <div className="group-detail group-detail--status" role="status">
        <div className="group-detail-status">
          <span className="group-detail-spinner" aria-hidden="true" />
          <p>Grup bilgileri yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="group-detail group-detail--status">
        <div className="group-detail-status group-detail-status--error">
          <p>Grup bilgileri alınamadı.</p>
          <button type="button" onClick={() => reload().catch(() => {})}>
            Tekrar dene
          </button>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="group-detail group-detail--status">
        <div className="group-detail-status">
          <p>Grup bulunamadı.</p>
          <Link to="/groups" className="group-detail-back">
            Gruplara dön
          </Link>
        </div>
      </div>
    );
  }

  const bannerSrc = group.banner || "/lyra_banner.png";
  const logoSrc = group.logo || "/lyra_logo.png";

  return (
    <div className="group-detail">
      <div
        className="group-banner"
        style={{ backgroundImage: `url(${bannerSrc})` }}
      >
        <div className="overlay">
          <img src={logoSrc} alt={group.name} className="group-detail-logo" />
          <div className="group-detail-info">
            <h1>{group.name}</h1>
            <p>{group.description || "Bu grup için açıklama eklenmemiş."}</p>
          </div>
        </div>
      </div>

      <section className="group-contents">
        <h2>İçerikler</h2>
        {catalogLoading ? (
          <div className="group-detail-status" role="status">
            <span className="group-detail-spinner" aria-hidden="true" />
            <p>Videolar yükleniyor...</p>
          </div>
        ) : groupVideos.length === 0 ? (
          <div className="group-detail-status">
            <p>Bu gruba henüz video atanmamış.</p>
            <Link to="/admin/videos" className="group-detail-back">
              Video ekle
            </Link>
          </div>
        ) : (
          <div className="content-grid">
            {groupVideos.map((video) => {
              const poster =
                video.thumbnail?.src ||
                video.poster ||
                video.base?.poster ||
                "/videos/sample_poster.jpg";
              return (
                <Link
                  key={video.id}
                  to={`/watch/${encodeURIComponent(video.id)}`}
                  className="content-card"
                >
                  <img src={poster} alt={video.title} />
                  <h3>{video.title}</h3>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
