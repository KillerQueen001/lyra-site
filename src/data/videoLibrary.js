export const videoLibrary = {
  sample: {
    title: "Örnek Video",
    description: "Yerel olarak saklanan örnek MP4 dosyası.",
    poster: "/videos/sample_poster.jpg",
    files: {
      single: "/videos/sample.mp4",
      "480": "/videos/sample_480.mp4",
      "720": "/videos/sample_720.mp4",
      "1080": "/videos/sample_1080.mp4",
    },
  },
  "portal2-bolum-1": {
    title: "Portal 2 Türkçe Dublaj — Bölüm 1",
    description: "Portal 2 projesinin birinci bölümü.",
    stream: "https://vz-14c17071-bad.b-cdn.net/c3c772ab-adf0-44cd-a170-1d2451de3b08/playlist.m3u8",
    poster: "/posters/portal2-episode1.jpg",
  },
  "portal2-bolum-2": {
    title: "Portal 2 Türkçe Dublaj — Bölüm 2",
    description: "Portal 2 projesinin ikinci bölümü.",
    stream: "https://vz-14c17071-bad.b-cdn.net/c3c772ab-adf0-44cd-a170-1d2451de3b08/playlist.m3u8",
    poster: "/posters/portal2-episode2.jpg",
  },
  "kus-kasabası": {
    title: "Kuş Kasabası Türkçe Dublaj — Bölüm 1",
    description: "Kuş Kasabası projesinin birinci bölümü.",
    stream: "https://vz-77a59fea-616.b-cdn.net/6d4563b3-484b-4821-aa2a-1208504190e9/playlist.m3u8",
    poster: "/posters/portal2-episode2.jpg",
  },
  "dyinglight-bolum-1": {
    title: "Dying Light Türkçe Dublaj — Bölüm 1",
    description: "Dying Light projesine ait örnek bölüm.",
    files: {
      single: "/videos/sample.mp4",
    },
    poster: "/posters/dyinglight-episode1.jpg",
  },
};

export function getVideoEntry(id) {
  if (!id) return null;
  return videoLibrary[id] || null;
}