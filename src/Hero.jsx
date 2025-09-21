import { useState } from "react";

const projects = [
  {
    group: "Lyra Records",
    groupLogo: "/lyra_logo.png",
    groupNamePng: "/lyra_text.png",
    title: "Lyra'nın Seçkisi",
    description: "Kendi dublaj projelerimizi keşfedin.",
    video: "/videos/lyra_demo.mp4",
  },
  {
    group: "Lavinia Dublaj",
    groupLogo: "/lavinia_logo.png",
    groupNamePng: "/lavinia_text.png",
    title: "Lavinia Özel",
    description: "Sesin şiirle buluştuğu an.",
    video: "/videos/lavinia_demo.mp4",
  },
];

export default function Hero() {
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [fade, setFade] = useState(true);

  const current = projects[index];

  const handleChangeProject = (newIndex) => {
    setFade(false); // fade-out
    setTimeout(() => {
      setIndex(newIndex);
      setFade(true); // fade-in
    }, 500);
  };

  const handleVideoEnd = () => {
    handleChangeProject((index + 1) % projects.length);
  };

  return (
    <section className="hero">
      {/* Video */}
      <video
        key={current.video}
        className={`hero-video ${fade ? "fade-in" : "fade-out"}`}
        autoPlay
        loop={false}
        muted={muted}
        controls={false}
        onEnded={handleVideoEnd}
      >
        <source src={current.video} type="video/mp4" />
      </video>

      <div className="overlay" />

      {/* Ses Butonu */}
      <button className="mute-btn" onClick={() => setMuted((prev) => !prev)}>
        {muted ? "🔇" : "🔊"}
      </button>

      {/* Oklar */}
      <div className="hero-arrows">
        <div
          className="arrow left"
          onClick={() =>
            handleChangeProject((index - 1 + projects.length) % projects.length)
          }
        />
        <div
          className="arrow right"
          onClick={() => handleChangeProject((index + 1) % projects.length)}
        />
      </div>

      {/* Info Bar */}
      <div
        className={`hero-info-bar ${fade ? "fade-in" : "fade-out"}`}
      >
        <div className="hero-left">
          <img
            src={current.groupLogo}
            alt={current.group}
            className="group-logo"
          />
          <img
            src={current.groupNamePng}
            alt={current.group}
            className="group-name"
          />
        </div>

        <div className="hero-middle">
          <h1>{current.title}</h1>
          <p>{current.description}</p>
        </div>

        <div className="hero-right">
          <button>İzle</button>
          <button>Detaylar</button>
        </div>
      </div>
    </section>
  );
}
