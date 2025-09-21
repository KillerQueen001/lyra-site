// src/pages/ContentDetail.jsx
import { useParams } from "react-router-dom";

const contents = {
  portal2: {
    title: "Portal 2 Türkçe Dublaj",
    description: "Portal 2 için hazırlanan tam Türkçe dublaj projesi.",
    episodes: [
      { id: 1, title: "Bölüm 1", video: "/watch/sample" },
      { id: 2, title: "Bölüm 2", video: "/watch/sample" }
    ]
  },
  dyinglight: {
    title: "Dying Light Türkçe Dublaj",
    description: "Zombi kıyametinde seslendirme.",
    episodes: [{ id: 1, title: "Bölüm 1", video: "/sample.mp4" }]
  }
};

export default function ContentDetail() {
  const { id } = useParams();
  const content = contents[id];

  if (!content) {
    return <h1 style={{ color: "white", padding: "40px" }}>İçerik bulunamadı.</h1>;
  }

  return (
    <div style={{ padding: "40px", color: "white" }}>
      <h1>{content.title}</h1>
      <p>{content.description}</p>

      <h2>Bölümler</h2>
      <ul>
        {content.episodes.map((ep) => (
          <li key={ep.id}>
            <a href={ep.video} target="_blank" rel="noreferrer" style={{ color: "#9b5de5" }}>
              {ep.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
