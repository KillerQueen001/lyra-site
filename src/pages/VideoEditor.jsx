import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { videoLibrary } from "../data/videoLibrary";
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

const VIDEO_OPTIONS = Object.entries(videoLibrary).map(([id, entry]) => ({
  id,
  title: entry.title || id,
}));

function getDefaultDetails(videoId) {
  const entry = videoLibrary[videoId] || {};
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
  const thumbnailInputRef = useRef(null);
  const statusTimeoutRef = useRef(null);
  const defaultVideoId = VIDEO_OPTIONS[0]?.id || "sample";
  const [selectedVideoId, setSelectedVideoId] = useState(defaultVideoId);
  const [videoDetailsMap, setVideoDetailsMap] = useState({});
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [isSaving, setIsSaving] = useState(false)
  const [title, setTitle] = useState("Yeni Video");
  const [description, setDescription] = useState(
    "Videonuz için açıklamayı buraya yazın."
  );
  const [ageRating, setAgeRating] = useState("all");
  const [thumbnailPreview, setThumbnailPreview] = useState("");
  const [thumbnailName, setThumbnailName] = useState("");
  const [thumbnailError, setThumbnailError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState("info");

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
      const fallback = getDefaultDetails(videoId);
      const details = stored || fallback;
      setTitle(details.title || fallback.title);
      setDescription(details.description || fallback.description);
      setAgeRating(details.ageRating || fallback.ageRating);
      const thumbSrc = details.thumbnail?.src || fallback.thumbnail.src;
      const thumbName = details.thumbnail?.name || fallback.thumbnail.name;
      setThumbnailPreview(thumbSrc || "");
      setThumbnailName(thumbName || "");
      setThumbnailError("");
      setStatusMessage("");
      setStatusTone("info");
      setLastSavedAt(
        details.updatedAt ? new Date(details.updatedAt) : fallback.updatedAt
      );
      if (thumbnailInputRef.current) {
        thumbnailInputRef.current.value = "";
      }
    },
    [videoDetailsMap]
  );

  useEffect(() => {
    applyVideoDetails(selectedVideoId);
  }, [selectedVideoId, videoDetailsMap, applyVideoDetails]);

  const selectedVideoSource = useMemo(
    () => resolveSingleVideo(selectedVideoId),
    [selectedVideoId]
  );

  const selectedVideoPoster = useMemo(() => {
    if (thumbnailPreview) return thumbnailPreview;
    const entry = videoLibrary[selectedVideoId];
    return entry?.poster || "";
  }, [selectedVideoId, thumbnailPreview]);

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
  const handleThumbnailChange = (event) => {
    const file = event.target.files && event.target.files[0];
    setThumbnailError("");
    if (!file) {
      setThumbnailPreview("");
      setThumbnailName("");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setThumbnailError("Lütfen bir görsel dosyası seçin.");
      setThumbnailPreview("");
      setThumbnailName("");
      return;
    }
    setThumbnailName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setThumbnailPreview(reader.result);
      }
    };
    reader.onerror = () => {
      setThumbnailError("Thumbnail yüklenirken bir hata oluştu.");
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!selectedVideoId) return;
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = null;
    }
    setIsSaving(true);
    setStatusTone("info");
    setStatusMessage("Kaydediliyor...");
    const result = await saveVideoDetails(selectedVideoId, {
      title,
      description,
      ageRating,
      thumbnail: { src: thumbnailPreview, name: thumbnailName },
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
                {VIDEO_OPTIONS.map((option) => (
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
                    ref={thumbnailInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleThumbnailChange}
                  />
                  {thumbnailError ? (
                    <p className="metadata-hint metadata-hint--error">{thumbnailError}</p>
                  ) : (
                    <p className="metadata-hint">
                      JPG veya PNG formatında bir görsel yükleyebilirsiniz.
                    </p>
                  )}
                  {thumbnailPreview && (
                    <div className="thumbnail-preview">
                      <img src={thumbnailPreview} alt="Seçili thumbnail" />
                      {thumbnailName && (
                        <span className="thumbnail-name">{thumbnailName}</span>
                      )}
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