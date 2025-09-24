// src/pages/GroupDetail.jsx
import { useParams, Link } from "react-router-dom";
import "./GroupDetail.css";

const groups = {
  "lyra-records": {
    name: "Lyra Records",
    logo: "/lyra_logo.png",
    banner: "/lyra_banner.png",
    description: "Kendi dublaj projelerimizi üretiyoruz.",
    contents: [
      { id: "portal2", title: "Portal 2 Türkçe Dublaj", thumb: "/lyra_banner.png" },
      { id: "dyinglight", title: "Dying Light Türkçe Dublaj", thumb: "/lavinia_banner.png" }
    ]
  },
  "lavinia-dublaj": {
    name: "Lavinia Dublaj",
    logo: "/lavinia_logo.png",
    banner: "/lavinia_banner.png",
    description: "Sesin şiirle buluştuğu an.",
    contents: [
      { id: "kuskasabasi", title: "Şiir Dublaj Projesi", thumb: "/lavinia_banner.png" }
    ]
  }
};

export default function GroupDetail() {
  const { slug } = useParams();
  const group = groups[slug];

  if (!group) {
    return <h1 style={{ color: "white", padding: "40px" }}>Grup bulunamadı.</h1>;
  }

  return (
    <div className="group-detail">
      {/* Banner */}
      <div
        className="group-banner"
        style={{ backgroundImage: `url(${group.banner})` }}
      >
        <div className="overlay">
          <img src={group.logo} alt={group.name} className="group-detail-logo" />
          <div className="group-detail-info">
            <h1>{group.name}</h1>
            <p>{group.description}</p>
          </div>
        </div>
      </div>

      {/* İçerikler */}
      <section className="group-contents">
        <h2>İçerikler</h2>
        <div className="content-grid">
          {group.contents.map((content) => (
            <Link key={content.id} to={`/content/${content.id}`} className="content-card">
              <img src={content.thumb} alt={content.title} />
              <h3>{content.title}</h3>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
