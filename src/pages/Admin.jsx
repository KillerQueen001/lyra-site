import { Link } from "react-router-dom";
import "./Admin.css";

const adminSections = [
  {
    id: "video-editor",
    title: "Video Düzenleme",
    description:
      "Zaman çizelgesini, cast atamalarını ve video meta verilerini güncelleyin.",
    to: "/admin/video-editor",
  },
  {
    id: "timeline",
    title: "Timeline Yönetimi",
    description:
      "Admin Timeline ekranında cast bloklarını sürükle-bırak ile düzenleyin.",
    to: "/admin/timeline",
  },
];

export default function Admin() {
  return (
    <div className="admin-menu">
      <header className="admin-menu__header">
        <h1>Admin Paneli</h1>
        <p>Yönetim araçlarını görmek için bir bölüm seçin.</p>
      </header>

      <div className="admin-menu__grid">
        {adminSections.map((section) => (
          <Link key={section.id} to={section.to} className="admin-menu__card">
            <div className="admin-menu__card-body">
              <h2>{section.title}</h2>
              <p>{section.description}</p>
            </div>
            <span className="admin-menu__cta">Bölümü Aç</span>
          </Link>
        ))}
      </div>
    </div>
  );
}