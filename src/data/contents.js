import { getVideoEntry } from "./videoLibrary";

export const contents = {
  portal2: {
    title: "Portal 2 Türkçe Dublaj",
    description: "Portal 2 için hazırlanan tam Türkçe dublaj projesi.",
    episodes: [
      { id: 1, title: "Bölüm 1", videoId: "portal2-bolum-1" },
      { id: 2, title: "Bölüm 2", videoId: "portal2-bolum-2" },
    ],
  },
  dyinglight: {
    title: "Dying Light Türkçe Dublaj",
    description: "Zombi kıyametinde seslendirme.",
    episodes: [{ id: 1, title: "Bölüm 1", videoId: "dyinglight-bolum-1" }],
  },
    kuskasabasi: {
    title: "Kuş Kasabası Türkçe Dublaj",
    description: "Kuş Kasabası için hazırlanan tam Türkçe dublaj projesi.",
    episodes: [{ id: 1, title: "Bölüm 1", videoId: "kus-kasabası" }],
  },
};

export function findEpisodeByVideoId(videoId) {
  if (!videoId) return null;
  for (const [contentId, content] of Object.entries(contents)) {
    const episode = content.episodes.find((ep) => ep.videoId === videoId);
    if (episode) {
      return {
        contentId,
        content,
        episode,
        video: getVideoEntry(videoId),
      };
    }
  }
  return null;
}
