import { useRef, useState } from "react";
import "./VideoEditor.css";

const AGE_RATINGS = [
  { value: "all", label: "Genel İzleyici" },
  { value: "7", label: "+7" },
  { value: "13", label: "+13" },
  { value: "16", label: "+16" },
  { value: "18", label: "+18" },
];

export default function VideoEditor() {
  const videoRef = useRef(null);
  const thumbnailInputRef = useRef(null);
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

  const handleSave = () => {
    const timestamp = new Date();
    setLastSavedAt(timestamp);
    setStatusMessage(
      `Kaydedildi: ${timestamp.toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    );
    setTimeout(() => {
      setStatusMessage("");
    }, 4000);
  };

  const handleReset = () => {
    setTitle("Yeni Video");
    setDescription("Videonuz için açıklamayı buraya yazın.");
    setAgeRating("all");
    setThumbnailPreview("");
    setThumbnailName("");
    setThumbnailError("");
    setStatusMessage("");
    setLastSavedAt(null);
    if (thumbnailInputRef.current) {
      thumbnailInputRef.current.value = "";
    }
  };

  return (
    <div className="video-editor-page">
      <div className="video-editor-shell">
        <header className="video-editor-header">
          <h1>Video Düzenleyici</h1>
          <p>
            Başlığı, açıklamayı, kapak görselini ve yaş kısıtlamasını düzenleyin.
            Yapılan değişiklikleri kaydedin veya sıfırlayın.
          </p>
        </header>

        <div className="video-editor-grid">
          <section className="editor-main">
            <div className="video-stage">
              <div className="video-frame">
                <video ref={videoRef} controls preload="metadata">
                  <source src="/videos/sample.mp4" type="video/mp4" />
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
                <button type="button" onClick={handleSave}>
                  Kaydet
                </button>
                <button type="button" className="metadata-secondary" onClick={handleReset}>
                  Sıfırla
                </button>
              </div>
              <div className="metadata-status">
                {statusMessage && <span>{statusMessage}</span>}
                {lastSavedAt && !statusMessage && (
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