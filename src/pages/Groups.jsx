// src/pages/Groups.jsx
import { Link } from "react-router-dom";
import "./Groups.css"; // stil ayrı dosyada olacak

const groups = [
  {
    name: "Lyra Records",
    logo: "/lyra_logo.png",
    banner: "/lyra_banner.png",
    description: "Kendi dublaj projelerimizi üretiyoruz."
  },
  {
    name: "Lavinia Dublaj",
    logo: "/lavinia_logo.png",
    banner: "/lavinia_banner.png",
    description: "Sesin şiirle buluştuğu an."
  }
];

export default function Groups() {
  return (
    <div className="groups-page">
      <h1>Gruplar</h1>
      <div className="groups-grid">
        {groups.map((group, i) => (
          <div key={i} className="group-card">
            <img src={group.banner} alt={group.name} className="group-banner" />
            <div className="group-info">
              <img src={group.logo} alt={group.name} className="group-logo" />
              <h2>{group.name}</h2>
              <p>{group.description}</p>
              <Link to={`/groups/${group.name.toLowerCase().replace(" ", "-")}`} className="group-btn">
                Detaylar
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
