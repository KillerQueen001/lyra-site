import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  createCast,
  describeCastContacts,
  fetchCasts,
  getCastInitials,
  getPresetCasts,
  mergeCasts,
} from "../utils/castApi";
import "./Cast.css";

function buildInstagramHandle(value) {
  if (!value) return "";
  return value.startsWith("@") ? value : `@${value}`;
}

export default function Cast() {
  const presetCasts = useMemo(() => getPresetCasts(), []);
  const [remoteCasts, setRemoteCasts] = useState([]);
  const [casts, setCasts] = useState(presetCasts);
  const [loading, setLoading] = useState(true);
  const [serverStatus, setServerStatus] = useState("loading");
  const [formState, setFormState] = useState({
    name: "",
    role: "",
    bio: "",
    instagram: "",
    email: "",
    other: "",
  });
  const [imagePreview, setImagePreview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const imageInputRef = useRef(null);

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

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleImageChange = (event) => {
    const file = event.target.files && event.target.files[0];
    setSubmitError("");
    setSubmitSuccess("");
    if (!file) {
      setImagePreview("");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setSubmitError("Lütfen bir görsel dosyası seçin.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImagePreview(reader.result);
      }
    };
    reader.onerror = () => {
      setSubmitError("Görsel okunurken bir hata oluştu.");
    };
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setFormState({
      name: "",
      role: "",
      bio: "",
      instagram: "",
      email: "",
      other: "",
    });
    setImagePreview("");
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    setSubmitSuccess("");

    if (!formState.name.trim()) {
      setSubmitError("Lütfen cast için bir isim yazın.");
      return;
    }

    if (serverStatus !== "online") {
      setSubmitError("Cast kaydetmek için sunucuya bağlanılamıyor.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: formState.name,
        role: formState.role,
        bio: formState.bio,
        image: imagePreview,
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
      setSubmitSuccess("Cast kaydınız alındı! İnceleme sonrası yayınlanacaktır.");
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

  return (
    <div className="cast-page">
      <div className="cast-page__inner">
        <section className="cast-hero">
          <div>
            <h1>Cast Listesi</h1>
            <p>
              Lyra Records ekibine katılmak için oyuncu portföyünüzü paylaşın.
              Aşağıdaki formu doldurarak yeni bir cast profili oluşturabilirsiniz.
            </p>
          </div>
        </section>

        <section className="cast-form">
          <div className="cast-form__header">
            <div>
              <h2>Yeni Cast Ekleyin</h2>
              <p>
                İsim, rol, kısa tanıtım ve iletişim bilgilerinizi ekleyin. Fotoğraf
                yüklerseniz kartınızda görünecektir.
              </p>
            </div>
            {serverStatus === "online" ? (
              <span className="cast-form__status cast-form__status--online">
                Sunucu aktif
              </span>
            ) : serverStatus === "offline" ? (
              <span className="cast-form__status cast-form__status--offline">
                Sunucuya ulaşılamıyor
              </span>
            ) : (
              <span className="cast-form__status">Sunucu kontrol ediliyor…</span>
            )}
          </div>

          {submitError && (
            <div className="cast-form__alert cast-form__alert--error">
              {submitError}
            </div>
          )}
          {submitSuccess && (
            <div className="cast-form__alert cast-form__alert--success">
              {submitSuccess}
            </div>
          )}

          <form className="cast-form__grid" onSubmit={handleSubmit}>
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
            <label className="cast-form__full">
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
            <label className="cast-form__upload">
              <span>Fotoğraf</span>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
              />
              {imagePreview ? (
                <div className="cast-form__preview">
                  <img src={imagePreview} alt="Seçili cast görseli" />
                </div>
              ) : (
                <p className="cast-form__hint">
                  Yüklediğiniz görsel kart üzerinde ön izlenir.
                </p>
              )}
            </label>
            <div className="cast-form__actions">
              <button type="submit" disabled={submitting || serverStatus !== "online"}>
                {submitting ? "Gönderiliyor…" : "Cast oluştur"}
              </button>
              <button
                type="button"
                className="cast-form__secondary"
                onClick={resetForm}
                disabled={submitting}
              >
                Temizle
              </button>
            </div>
          </form>
        </section>

        <section className="cast-list">
          <div className="cast-list__header">
            <h2>Cast Kartları</h2>
            <p>
              {loading
                ? "Cast kartları yükleniyor…"
                : `${casts.length} cast görüntüleniyor.`}
            </p>
          </div>
          <div className="cast-list__grid">
            {casts.map((cast) => {
              const contacts = describeCastContacts(cast.contacts);
              const instagramHandle = cast.contacts.instagram
                ? buildInstagramHandle(cast.contacts.instagram)
                : null;
              return (
                <article key={cast.slug} className="cast-card">
                  <Link to={`/cast/${cast.slug}`} className="cast-card__link">
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
                        {cast.origin === "remote" && (
                          <span className="cast-card__badge">Topluluk</span>
                        )}
                      </div>
                      {cast.role && <p className="cast-card__role">{cast.role}</p>}
                      {cast.bio && <p className="cast-card__bio">{cast.bio}</p>}
                    </div>
                  </Link>
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