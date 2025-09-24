let loading = null;

export function loadHls() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.Hls) return Promise.resolve(window.Hls);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-hls-loader="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Hls || null), { once: true });
      existing.addEventListener("error", (err) => reject(err), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.16/dist/hls.min.js";
    script.async = true;
    script.dataset.hlsLoader = "true";
    script.onload = () => resolve(window.Hls || null);
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  })
    .catch((err) => {
      loading = null;
      throw err;
    });

  return loading;
}