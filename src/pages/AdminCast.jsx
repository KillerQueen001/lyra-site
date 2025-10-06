import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  createCast,
  describeCastContacts,
  fetchCasts,
  getCastInitials,
  getPresetCasts,
  mergeCasts,
} from "../utils/castApi";
import "./AdminCast.css";
import "./Cast.css";

const EMPTY_FORM = {
  name: "",
  role: "",
  bio: "",
  instagram: "",
  email: "",
  other: "",
  image: "",
};

function buildInstagramHandle(value) {
  if (!value) return "";
  return value.startsWith("@") ? value : `@${value}`;
}

export default function AdminCast() {
  const presetCasts = useMemo(() => getPresetCasts(), []);
  const [casts, setCasts] = useState(presetCasts);
  const [remoteCasts, setRemoteCasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [serverStatus, setServerStatus] = useState("loading");
  const [formState, setFormState] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const remote = await fetchCasts();
        if (!alive) return;
        setRemoteCasts(remote);
        setCasts(mergeCasts(remote, presetCasts));
        setServerStatus("online");
      } catch (error) {
        console.warn("Cast listesi alınamadı:", error);
        if (!alive) return;
        setRemoteCasts([]);
        setCasts(presetCasts);
        setServerStatus("offline");
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [presetCasts]);

  useEffect(() => {
    setPreviewError(false);
  }, [formState.image]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const resetForm = () => {
    setFormState(EMPTY_FORM);
    setSubmitError("");
    setSubmitSuccess("");
  };

  const imageUrl = formState.image.trim();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    setSubmitSuccess("");

    const name = formState.name.trim();

    if (!name) {
      setSubmitError("Lütfen cast için bir isim yazın.");
      return;
    }

    if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
      setSubmitError("Lütfen görsel için geçerli bir URL girin.");
      return;
    }

    if (serverStatus !== "online") {
      setSubmitError("Cast kaydetmek için sunucuya bağlanılamıyor.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name,
        role: formState.role.trim(),
        bio: formState.bio.trim(),
        image: imageUrl || undefined,
        contacts: {
          instagram: formState.instagram.trim(),
          email: formState.email.trim(),
          other: formState.other.trim(),
        },
      };
      const newCast = await createCast(payload);
      setRemoteCasts((prevRemote) => {
        const updatedRemote = [newCast, ...prevRemote];
        setCasts(mergeCasts(updatedRemote, presetCasts));
        return updatedRemote;
      });
      setSubmitSuccess("Cast kaydı oluşturuldu. Katalog güncellendi.");
      resetForm();
    } catch (error) {
      console.error("Cast kaydedilemedi:", error);
      setSubmitError(
        error.message || "Cast kaydedilirken beklenmeyen bir hata oluştu."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const communityCount = remoteCasts.length;
  const lyraCount = Math.max(0, casts.length - communityCount);

  return (
    <div className="admin-cast-page">
      <div className="admin-cast__inner">
        <header className="admin-cast__hero">
          <div>
            <h1>Cast Yönetimi</h1>
            <p>
              Yeni cast kayıtlarını oluşturun, mevcutlarını kontrol edin ve
              timeline kütüphanesini güncel tutun. Gönderilen tüm castler admin
              onayından geçtikten sonra yayına alınır.
            </p>
          </div>
          <div className={`admin-cast__status admin-cast__status--${serverStatus}`}>
            {serverStatus === "online"
              ? "Sunucu aktif"
              : serverStatus === "offline"
              ? "Sunucuya ulaşılamadı"
              : "Sunucu kontrol ediliyor…"}
          </div>
        </header>

        <section className="admin-cast__form">
          <div className="admin-cast__form-head">
            <div>
              <h2>Yeni Cast Kaydı</h2>
              <p>
                İsim, rol, kısa tanıtım ve iletişim bilgilerini girin. Fotoğraf
                eklenmesi katalogdaki kartta gösterilir.
              </p>
            </div>
            <Link to="/cast" className="admin-cast__catalog-link">
              Cast kataloğunu görüntüle
            </Link>
          </div>

          {submitError && (
            <div className="admin-cast__alert admin-cast__alert--error">
              {submitError}
            </div>
          )}
          {submitSuccess && (
            <div className="admin-cast__alert admin-cast__alert--success">
              {submitSuccess}
            </div>
          )}

          <form className="admin-cast__grid" onSubmit={handleSubmit}>
            <label>
              <span>İsim *</span>
              <input
                name="name"
                value={formState.name}
                onChange={handleInputChange}
                placeholder="Örn. Elif Akay"
                required
              />
            </label>
            <label>
              <span>Rol / Uzmanlık</span>
              <input
                name="role"
                value={formState.role}
                onChange={handleInputChange}
                placeholder="Örn. Başrol oyuncusu, dublaj"
              />
            </label>
            <label className="admin-cast__full">
              <span>Kısa Tanıtım</span>
              <textarea
                name="bio"
                value={formState.bio}
                onChange={handleInputChange}
                placeholder="Deneyimlerinizi ve öne çıkan projelerinizi yazın."
              />
            </label>
            <label>
              <span>Instagram</span>
              <input
                name="instagram"
                value={formState.instagram}
                onChange={handleInputChange}
                placeholder="@kullaniciadi"
              />
            </label>
            <label>
              <span>E-posta</span>
              <input
                type="email"
                name="email"
                value={formState.email}
                onChange={handleInputChange}
                placeholder="ornek@mail.com"
              />
            </label>
            <label>
              <span>Diğer iletişim</span>
              <input
                name="other"
                value={formState.other}
                onChange={handleInputChange}
                placeholder="Web sitesi, telefon veya bağlantı"
              />
            </label>
            <label className="admin-cast__upload">
              <span>Fotoğraf URL'si</span>
              <input
                name="image"
                value={formState.image}
                onChange={handleInputChange}
                placeholder="https://.../foto.jpg"
              />
              {imageUrl && !previewError ? (
                <div className="admin-cast__preview">
                  <img
                    src={imageUrl}
                    alt="Cast görseli önizleme"
                    onError={() => setPreviewError(true)}
                  />
                </div>
              ) : (
                <p
                  className={`admin-cast__hint${previewError ? " admin-cast__hint--error" : ""}`}
                >
                  {previewError
                    ? "Görsel yüklenemedi. URL'yi kontrol edin."
                    : "Bunny.net üzerindeki görselin tam URL'sini girin."}
                </p>
              )}
            </label>
            <div className="admin-cast__actions">
              <button type="submit" disabled={submitting || serverStatus !== "online"}>
                {submitting ? "Gönderiliyor…" : "Cast oluştur"}
              </button>
              <button
                type="button"
                className="admin-cast__secondary"
                onClick={resetForm}
                disabled={submitting}
              >
                Temizle
              </button>
            </div>
          </form>
        </section>

        <section className="admin-cast__catalog">
          <div className="admin-cast__catalog-header">
            <div>
              <h2>Katalog Önizlemesi</h2>
              <p>
                {loading
                  ? "Cast kartları yükleniyor…"
                  : `${casts.length} cast listeleniyor • ${communityCount} topluluk, ${lyraCount} Lyra kaydı`}
              </p>
            </div>
            {serverStatus === "offline" && (
              <span className="admin-cast__warning">
                Sunucu bağlantısı olmadığında sadece varsayılan kayıtlar gösterilir.
              </span>
            )}
          </div>

          <div className="cast-list__grid">
            {casts.map((cast) => {
              const contacts = describeCastContacts(cast.contacts);
              const instagramHandle = cast.contacts.instagram
                ? buildInstagramHandle(cast.contacts.instagram)
                : null;
              return (
                <article key={cast.slug} className="cast-card">
                  <div className="cast-card__link">
                    <div className="cast-card__media">
                      {cast.image ? (
                        <img src={cast.image} alt="Cast portresi" />
                      ) : (
                        <div className="cast-card__placeholder">
                          {getCastInitials(cast.name)}
                        </div>
                      )}
                    </div>
                    <div className="cast-card__body">
                      <div className="cast-card__top">
                        <h3>{cast.name}</h3>
                        <span className="cast-card__badge">
                          {cast.origin === "remote" ? "Topluluk" : "Lyra"}
                        </span>
                      </div>
                      {cast.role && <p className="cast-card__role">{cast.role}</p>}
                      {cast.bio && <p className="cast-card__bio">{cast.bio}</p>}
                    </div>
                  </div>
                  {contacts.length > 0 && (
                    <ul className="cast-card__contacts">
                      {contacts.map((contact) => (
                        <li key={contact.key}>
                          <span>{contact.label}</span>
                          {contact.href ? (
                            <a
                              href={contact.href}
                              target={contact.key === "email" ? "_self" : "_blank"}
                              rel="noreferrer"
                            >
                              {contact.key === "instagram" && instagramHandle
                                ? instagramHandle
                                : contact.value}
                            </a>
                          ) : (
                            <span>{contact.value}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}