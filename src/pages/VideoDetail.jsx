// src/pages/VideoDetail.jsx
import { useParams } from "react-router-dom";

export default function VideoDetail() {
  const { id } = useParams();

  // dummy veri (ileride backend'den çekilecek)
  const videos = {
    1: { title: "Lyra Video 1", src: "/sample.mp4", description: "Lyra Records özel videosu." },
    2: { title: "Lyra Video 2", src: "/sample.mp4", description: "Lyra Records ikinci videosu." }
  };

  const video = videos[id];

  if (!video) {
    return <h1 style={{ color: "white", padding: "40px" }}>Video bulunamadı.</h1>;
  }

  return (
    <div style={{ padding: "40px", color: "white" }}>
      <h1>{video.title}</h1>
      <video
        src={video.src}
        controls
        autoPlay
        style={{ width: "100%", maxWidth: "900px", borderRadius: "12px", marginTop: "20px" }}
      />
      <p style={{ marginTop: "20px", fontSize: "1.1rem", color: "#ccc" }}>{video.description}</p>
    </div>
  );
}
