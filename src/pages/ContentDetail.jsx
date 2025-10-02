// src/pages/ContentDetail.jsx
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { contents } from "../data/contents";
import { useVideoLibraryEntries } from "../hooks/useVideoLibrary";

export default function ContentDetail() {
  const { id } = useParams();
  const content = contents[id];
  const videoLibraryEntries = useVideoLibraryEntries();
  const enrichedEpisodes = useMemo(() => {
    if (!content) return [];
    return content.episodes.map((ep) => ({
      ...ep,
      video: videoLibraryEntries[ep.videoId] || null,
    }));
  }, [content, videoLibraryEntries]);

  if (!content) {
    return <h1 style={{ color: "white", padding: "40px" }}>İçerik bulunamadı.</h1>;
  }

  return (
    <div style={{ padding: "40px", color: "white" }}>
      <h1>{content.title}</h1>
      <p>{content.description}</p>

      <h2>Bölümler</h2>
      <ul>
        {enrichedEpisodes.map((ep) => (
          <li key={ep.id}>
            <a
              href={`/watch/${ep.videoId}`}
              style={{ color: "#9b5de5" }}
            >
              {ep.title}
            </a>
                        {ep.video ? (
              <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>
                {ep.video.stream
                  ? "HLS akışı"
                  : ep.video.files?.single
                  ? "MP4 dosyası"
                  : "Kaynak tanımlanmadı"}
              </div>
            ) : (
              <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>Kaynak tanımlanmadı</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
