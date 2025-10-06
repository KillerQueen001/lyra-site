import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { videoLibrary } from "../data/videoLibrary";
import { useVideoLibraryEntries } from "../hooks/useVideoLibrary";
import { fetchAllVideoDetails, saveVideoDetails } from "../utils/videoDetailsApi";
import { loadHls } from "../utils/loadHls";
import { isHlsSource, resolveSingleVideo } from "../utils/videoSource";
import "./VideoEditor.css";

const AGE_RATINGS = [
  { value: "all", label: "Genel İzleyici" },
  { value: "7", label: "+7" },
  { value: "13", label: "+13" },
  { value: "16", label: "+16" },
  { value: "18", label: "+18" },
];

function getDefaultDetails(videoId, library = videoLibrary) {
  const source = library && typeof library === "object" ? library : videoLibrary;
  const entry = source[videoId] || {};
  const title = entry.title || "Yeni Video";
  const description =
    entry.description || "Videonuz için açıklamayı buraya yazın.";
  const poster = entry.poster || "";
  return {
    title,
    description,
    ageRating: "all",
    thumbnail: {
      src: poster,
      name: poster ? poster.split("/").pop() || "" : "",
    },
    updatedAt: null,
  };
}

export default function VideoEditor() {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const statusTimeoutRef = useRef(null);
  const videoLibraryEntries = useVideoLibraryEntries();
  const videoOptions = useMemo(() => {
    const options = Object.entries(videoLibraryEntries || {}).map(([id, entry]) => ({
      id,
      title: entry?.title || id,
    }));
    options.sort((a, b) =>
      a.title.localeCompare(b.title, "tr", { sensitivity: "base" })
    );
    return options;
  }, [videoLibraryEntries]);
  const [selectedVideoId, setSelectedVideoId] = useState(
    videoOptions[0]?.id || "sample"
  );
  const [videoDetailsMap, setVideoDetailsMap] = useState({});
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [isSaving, setIsSaving] = useState(false)
  const [title, setTitle] = useState("Yeni Video");
  const [description, setDescription] = useState(
    "Videonuz için açıklamayı buraya yazın."
  );
  const [ageRating, setAgeRating] = useState("all");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [thumbnailError, setThumbnailError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState("info");
  const normalizedThumbnailUrl = thumbnailUrl.trim();

  useEffect(() => {
    let cancelled = false;
    setIsLoadingDetails(true);
    (async () => {
      const entries = await fetchAllVideoDetails();
      if (cancelled) return;
      setVideoDetailsMap(entries);
      setIsLoadingDetails(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyVideoDetails = useCallback(
    (videoId) => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = null;
      }
      const stored = videoDetailsMap[videoId];
      const fallback = getDefaultDetails(videoId, videoLibraryEntries);
      const details = stored || fallback;
      setTitle(details.title || fallback.title);
      setDescription(details.description || fallback.description);
      setAgeRating(details.ageRating || fallback.ageRating);
      const thumbSrc = details.thumbnail?.src || fallback.thumbnail.src;
      setThumbnailUrl(thumbSrc || "");
      setThumbnailError("");
      setStatusMessage("");
      setStatusTone("info");
      setLastSavedAt(
        details.updatedAt ? new Date(details.updatedAt) : fallback.updatedAt
      );
    },
    [videoDetailsMap, videoLibraryEntries]
  );

  useEffect(() => {
    applyVideoDetails(selectedVideoId);
  }, [selectedVideoId, videoDetailsMap, applyVideoDetails]);

  const selectedVideoSource = useMemo(
    () => resolveSingleVideo(selectedVideoId),
    [selectedVideoId, videoLibraryEntries]
  );

  const selectedVideoPoster = useMemo(() => {
    if (normalizedThumbnailUrl) return normalizedThumbnailUrl;
    const entry = videoLibraryEntries?.[selectedVideoId];
    if (entry?.thumbnail?.src) return entry.thumbnail.src;
    if (entry?.poster) return entry.poster;
    return entry?.base?.poster || "";
  }, [selectedVideoId, normalizedThumbnailUrl, videoLibraryEntries]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return undefined;

    let cancelled = false;

    const teardown = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    teardown();
    videoElement.pause();
    videoElement.removeAttribute("src");
    videoElement.load();

    if (!selectedVideoSource) {
      return () => {
        cancelled = true;
        teardown();
      };
    }

    if (isHlsSource(selectedVideoSource)) {
      if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
        videoElement.src = selectedVideoSource;
        videoElement.load();
      } else {
        loadHls()
          .then((Hls) => {
            if (cancelled) return;
            if (!Hls || !Hls.isSupported()) {
              videoElement.src = selectedVideoSource;
              videoElement.load();
              return;
            }
            const hls = new Hls();
            hlsRef.current = hls;
            hls.loadSource(selectedVideoSource);
            hls.attachMedia(videoElement);
          })
          .catch(() => {
            if (cancelled) return;
            videoElement.src = selectedVideoSource;
            videoElement.load();
          });
      }
    } else {
      videoElement.src = selectedVideoSource;
      videoElement.load();
    }
 
    return () => {
      cancelled = true;
      teardown();
    };
  }, [selectedVideoSource]);
  const handleThumbnailUrlChange = (event) => {
    setThumbnailUrl(event.target.value);
    setThumbnailError("");
  };

  const handleSave = async () => {
    if (!selectedVideoId) return;
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = null;
    }
    const trimmedThumbnail = normalizedThumbnailUrl;
    if (trimmedThumbnail && !/^https?:\/\//i.test(trimmedThumbnail)) {
      setThumbnailError("Lütfen geçerli bir URL girin.");
      setStatusTone("error");
      setStatusMessage("Thumbnail adresi geçersiz.");
      return;
    }
    setIsSaving(true);
    setStatusTone("info");
    setStatusMessage("Kaydediliyor...");
    const derivedName = trimmedThumbnail
      ? trimmedThumbnail.split("/").pop()?.split("?")[0] || ""
      : "";
    const result = await saveVideoDetails(selectedVideoId, {
      title,
      description,
      ageRating,
      thumbnail: { src: trimmedThumbnail, name: derivedName },
    });
    if (result.ok && result.data) {
      setVideoDetailsMap((prev) => ({
        ...prev,
        [selectedVideoId]: result.data,
      }));
      const timestamp = result.data.updatedAt
        ? new Date(result.data.updatedAt)
        : new Date();
      setLastSavedAt(timestamp);
      setStatusTone("success");
      setStatusMessage(
        `Kaydedildi: ${timestamp.toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
        })}`
      );
      statusTimeoutRef.current = setTimeout(() => {
        setStatusMessage("");
        statusTimeoutRef.current = null;
      }, 4000);
    } else {
      setStatusTone("error");
      setStatusMessage("Kaydedilemedi. Lütfen tekrar deneyin.");
    }
    setIsSaving(false);
  };

  const handleReset = () => {
    applyVideoDetails(selectedVideoId);
  };

  useEffect(
    () => () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!videoOptions.length) return;
    setSelectedVideoId((prev) => {
      if (prev && videoLibraryEntries?.[prev]) {
        return prev;
      }
      return videoOptions[0].id;
    });
  }, [videoOptions, videoLibraryEntries]);
  
  return (
    <div className="video-editor-page">
      <div className="video-editor-shell">
        <header className="video-editor-header">
          <div className="video-editor-header-copy">
            <h1>Video Düzenleyici</h1>
            <p>
              Başlığı, açıklamayı, kapak görselini ve yaş kısıtlamasını düzenleyin.
              Yapılan değişiklikleri kaydedin veya sıfırlayın.
            </p>
          </div>
          <div className="video-editor-header-controls">
            <label className="video-editor-select">
              <span>Video Seç</span>
              <select
                value={selectedVideoId}
                onChange={(event) => setSelectedVideoId(event.target.value)}
              >
                {videoOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </select>
            </label>
            {isLoadingDetails ? (
              <span className="video-editor-header-status">
                Kaydedilen bilgiler yükleniyor...
              </span>
            ) : (
              <span className="video-editor-header-status video-editor-header-status--ready">
                Kaydedilen bilgiler hazır.
              </span>
            )}
          </div>
        </header>

        <div className="video-editor-grid">
          <section className="editor-main">
            <div className="video-stage">
              <div className="video-frame">
                <video
                  ref={videoRef}
                  controls
                  preload="metadata"
                  poster={selectedVideoPoster || undefined}
                >
                  Tarayıcınız video etiketini desteklemiyor.
                </video>
              </div>
              <div className="stage-fields">
                <label>
                  <span>Başlık</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Video başlığını yazın"
                  />
                </label>
                <label>
                  <span>Açıklama</span>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Videonun içeriğini açıklayın"
                  />
                </label>
              </div>
            </div>

            <div className="metadata-panel">
              <div className="metadata-header">
                <h2>Video Ayarları</h2>
                <p>
                  Thumbnail ekleyin ve yaş kısıtlamasını belirleyin. Kaydetmeden önce
                  bilgilerinizi kontrol edin.
                </p>
              </div>
              <div className="metadata-grid">
                <label className="metadata-thumbnail">
                  <span>Thumbnail</span>
                  <input
                    value={thumbnailUrl}
                    onChange={handleThumbnailUrlChange}
                    placeholder="https://.../kapak.jpg"
                  />
                  {thumbnailError ? (
                    <p className="metadata-hint metadata-hint--error">{thumbnailError}</p>
                  ) : (
                    <p className="metadata-hint">
                      Bunny.net üzerindeki thumbnail adresini girin.
                    </p>
                  )}
                  {normalizedThumbnailUrl && !thumbnailError && (
                    <div className="thumbnail-preview">
                      <img
                        src={normalizedThumbnailUrl}
                        alt="Thumbnail önizleme"
                        onError={() => setThumbnailError("Görsel yüklenemedi. URL'yi kontrol edin.")}
                      />
                    </div>
                  )}
                </label>
                <label>
                  <span>Yaş kısıtlaması</span>
                  <select
                    value={ageRating}
                    onChange={(event) => setAgeRating(event.target.value)}
                  >
                    {AGE_RATINGS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="metadata-actions">
                <button type="button" onClick={handleSave} disabled={isSaving}>
                  Kaydet
                </button>
                <button type="button" className="metadata-secondary" onClick={handleReset}>
                  Sıfırla
                </button>
              </div>
              <div className={`metadata-status metadata-status--${statusTone}`}>
                {statusMessage && (
                  <span className="metadata-status-message">{statusMessage}</span>
                )}
                {lastSavedAt && (
                  <span>
                    Son kaydetme: {lastSavedAt.toLocaleTimeString("tr-TR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                <span>Seçili yaş kısıtlaması: {AGE_RATINGS.find((x) => x.value === ageRating)?.label}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
