// src/pages/Groups.jsx
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useGroups } from "../hooks/useGroups";
import { useVideoCatalog } from "../hooks/useVideoCatalog";
import "./Groups.css";

export default function Groups() {
  const {
    list: groupList,
    status,
    error,
    reload,
  } = useGroups();
  const { catalog } = useVideoCatalog();

  const isLoading = status === "idle" || status === "loading";

  const videoCountByGroup = useMemo(() => {
    const counts = {};
    catalog.forEach((video) => {
      if (!video.groupId) return;
      counts[video.groupId] = (counts[video.groupId] || 0) + 1;
    });
    return counts;
  }, [catalog]);

  return (
    <div className="groups-page">
      <header className="groups-header">
        <div>
          <h1>Gruplar</h1>
          <p>
            Prodüksiyon ekiplerimizi keşfedin. Gruplar üzerinden içeriklerin hangi
            stüdyo tarafından hazırlandığını takip edebilirsiniz.
          </p>
        </div>
        <div className={`groups-status-chip groups-status-chip--${status}`}>
          {status === "ready"
            ? `${groupList.length} grup`
            : status === "error"
            ? "Hata"
            : "Yükleniyor"}
          <button
            type="button"
            onClick={() => reload().catch(() => {})}
            disabled={isLoading}
          >
            Yenile
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="groups-status" role="status">
          <span className="groups-spinner" aria-hidden="true" />
          <p>Grup bilgileri yükleniyor...</p>
        </div>
      ) : error ? (
        <div className="groups-status groups-status--error">
          <p>Gruplar yüklenirken hata oluştu.</p>
          <button
            type="button"
            onClick={() => reload().catch(() => {})}
            disabled={isLoading}
          >
            Tekrar dene
          </button>
        </div>
      ) : groupList.length === 0 ? (
        <div className="groups-status">
          <p>Henüz grup eklenmemiş. Admin panelinden yeni gruplar oluşturun.</p>
        </div>
      ) : (
        <div className="groups-grid">
          {groupList.map((group) => {
            const videoCount = videoCountByGroup[group.id] || 0;
            const bannerSrc = group.banner || "/lyra_banner.png";
            const logoSrc = group.logo || "/lyra_logo.png";
            return (
              <article key={group.id} className="group-card">
                <img src={bannerSrc} alt={`${group.name} banner`} className="group-banner" />
                <div className="group-info">
                  <img src={logoSrc} alt={`${group.name} logo`} className="group-logo" />
                  <h2>{group.name}</h2>
                  <p>{group.description || "Bu grup için açıklama eklenmemiş."}</p>
                  <div className="group-meta">
                    <span>{videoCount} içerik</span>
                  </div>
                  <Link to={`/groups/${group.id}`} className="group-btn">
                    Detaylar
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}