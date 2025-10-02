import { useMemo, useState } from "react";
import { useVideoLibrary } from "../hooks/useVideoLibrary";
import {
  createVideoLibraryEntry,
  isValidHlsUrl,
} from "../utils/videoLibraryApi";
import { slugify } from "../utils/slugify";
import "./AdminVideoLibrary.css";

const EMPTY_FORM = {
  title: "",
  videoId: "",
  stream: "",
  description: "",
  poster: "",
};

function formatStatus(status) {
  switch (status) {
    case "ready":
      return "Sunucu aktif";
    case "error":
      return "Sunucuya ulaşılamadı";
    case "loading":
    case "idle":
    default:
      return "Sunucu kontrol ediliyor…";
  }
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("tr-TR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

export default function AdminVideoLibrary() {
  const {
    library,
    status: libraryStatus,
    error: libraryError,
    reload: reloadLibrary,
  } = useVideoLibrary();
  const [form, setForm] = useState(EMPTY_FORM);
  const [isIdDirty, setIsIdDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const entries = useMemo(() => {
    return Object.entries(library || {}).map(([id, entry]) => ({
      id,
      title: entry?.title || id,
      stream: entry?.stream || "",
      poster: entry?.poster || "",
      origin: entry?.origin || "yerel",
      updatedAt: entry?.updatedAt || entry?.createdAt || null,
    }));
  }, [library]);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      if (a.updatedAt && b.updatedAt) {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
      if (a.updatedAt) return -1;
      if (b.updatedAt) return 1;
      return a.title.localeCompare(b.title, "tr", { sensitivity: "base" });
    });
  }, [entries]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setSubmitError("");
    setSubmitSuccess("");
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "title" && !isIdDirty) {
        next.videoId = slugify(value);
      }
      return next;
    });
  };

  const handleVideoIdChange = (event) => {
    setIsIdDirty(true);
    setSubmitError("");
    setSubmitSuccess("");
    setForm((prev) => ({
      ...prev,
      videoId: slugify(event.target.value),
    }));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setIsIdDirty(false);
    setSubmitError("");
    setSubmitSuccess("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    setSubmitSuccess("");

    const title = form.title.trim();
    const description = form.description.trim();
    const poster = form.poster.trim();
    const stream = form.stream.trim();
    let videoId = form.videoId.trim();

    if (!videoId) {
      videoId = slugify(title);
      setIsIdDirty(true);
    }

    if (!videoId) {
      setSubmitError("Lütfen video için bir ID belirleyin.");
      return;
    }

    if (library?.[videoId]) {
      setSubmitError("Bu video ID'si zaten kayıtlı.");
      return;
    }

    if (!stream) {
      setSubmitError("HLS akış bağlantısı zorunludur.");
      return;
    }

    if (!isValidHlsUrl(stream)) {
      setSubmitError("Lütfen .m3u8 uzantılı geçerli bir HLS bağlantısı girin.");
      return;
    }

    setSubmitting(true);
    try {
      await createVideoLibraryEntry({
        id: videoId,
        title: title || videoId,
        description,
        stream,
        poster,
      });
      await reloadLibrary();
      setSubmitSuccess("Video kaydı oluşturuldu ve kütüphane güncellendi.");
      resetForm();
    } catch (error) {
      setSubmitError(error.message || "Video kaydı oluşturulamadı.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-video-page">
      <div className="admin-video__inner">
        <header className="admin-video__header">
          <div>
            <h1>Video Kütüphanesi</h1>
            <p>
              Streaming servisinden aldığınız HLS bağlantıları ile yeni videolar
              ekleyin. Eklenen içerikler otomatik olarak katalog ve oynatıcı
              sayfasında kullanılabilir.
            </p>
          </div>
          <div className={`admin-video__status admin-video__status--${libraryStatus}`}>
            <span>{formatStatus(libraryStatus)}</span>
            <button
              type="button"
              onClick={() => reloadLibrary().catch(() => {})}
              disabled={submitting}
            >
              Yenile
            </button>
          </div>
        </header>

        {libraryError ? (
          <div className="admin-video__alert admin-video__alert--error">
            {libraryError.message || "Video kütüphanesi yüklenirken hata oluştu."}
          </div>
        ) : null}

        <section className="admin-video__form">
          <div className="admin-video__form-head">
            <div>
              <h2>Yeni Video Kaydı</h2>
              <p>
                Video başlığı, ID&apos;si ve HLS (.m3u8) bağlantısını girin. Poster
                adresi ve açıklama isteğe bağlıdır.
              </p>
            </div>
            <div className="admin-video__form-meta">
              <span>{sortedEntries.length} kayıt</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="admin-video__form-body">
            <div className="admin-video__form-grid">
              <label>
                <span>Video Başlığı</span>
                <input
                  name="title"
                  value={form.title}
                  onChange={handleInputChange}
                  placeholder="Örn. Portal 2 Bölüm 3"
                />
              </label>
              <label>
                <span>Video ID</span>
                <input
                  name="videoId"
                  value={form.videoId}
                  onChange={handleVideoIdChange}
                  placeholder="portal2-bolum-3"
                />
                <small>ID yalnızca küçük harf ve tire içerebilir.</small>
              </label>
              <label className="admin-video__span-2">
                <span>HLS Akış Bağlantısı</span>
                <input
                  name="stream"
                  value={form.stream}
                  onChange={handleInputChange}
                  placeholder="https://.../playlist.m3u8"
                  required
                />
              </label>
              <label className="admin-video__span-2">
                <span>Poster Adresi</span>
                <input
                  name="poster"
                  value={form.poster}
                  onChange={handleInputChange}
                  placeholder="https://.../poster.jpg"
                />
              </label>
              <label className="admin-video__span-2">
                <span>Açıklama</span>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleInputChange}
                  placeholder="Videonun kısa açıklaması"
                  rows={3}
                />
              </label>
            </div>

            {submitError ? (
              <div className="admin-video__alert admin-video__alert--error">
                {submitError}
              </div>
            ) : null}
            {submitSuccess ? (
              <div className="admin-video__alert admin-video__alert--success">
                {submitSuccess}
              </div>
            ) : null}

            <div className="admin-video__actions">
              <button type="submit" disabled={submitting}>
                {submitting ? "Kaydediliyor..." : "Video Ekle"}
              </button>
              <button
                type="button"
                className="admin-video__secondary"
                onClick={resetForm}
                disabled={submitting}
              >
                Temizle
              </button>
            </div>
          </form>
        </section>

        <section className="admin-video__list">
          <h2>Mevcut Videolar</h2>
          {sortedEntries.length === 0 ? (
            <p className="admin-video__empty">
              Henüz video eklenmemiş. Formu kullanarak ilk kaydı
              oluşturabilirsiniz.
            </p>
          ) : (
            <div className="admin-video__table" role="table">
              <div className="admin-video__table-head" role="row">
                <span role="columnheader">Başlık</span>
                <span role="columnheader">ID</span>
                <span role="columnheader">Kaynak</span>
                <span role="columnheader">Güncelleme</span>
              </div>
              <div className="admin-video__table-body">
                {sortedEntries.map((entry) => (
                  <div className="admin-video__table-row" role="row" key={entry.id}>
                    <span role="cell">
                      <strong>{entry.title}</strong>
                    </span>
                    <span role="cell">
                      <code>{entry.id}</code>
                    </span>
                    <span role="cell" className="admin-video__cell-stream">
                      {entry.stream ? (
                        <a href={entry.stream} target="_blank" rel="noreferrer">
                          {entry.stream}
                        </a>
                      ) : (
                        "—"
                      )}
                    </span>
                    <span role="cell">{formatDate(entry.updatedAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}