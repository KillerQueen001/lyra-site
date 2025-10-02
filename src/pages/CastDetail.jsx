import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  describeCastContacts,
  fetchCasts,
  getCastInitials,
  getPresetCasts,
  mergeCasts,
} from "../utils/castApi";
import "./CastDetail.css";

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("tr-TR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function CastDetail() {
  const { username = "" } = useParams();
  const presetCasts = useMemo(() => getPresetCasts(), []);
  const [cast, setCast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setWarning("");
    setError("");

    (async () => {
      const fallback = presetCasts.find((item) => item.slug === username) ?? null;
      try {
        const remote = await fetchCasts();
        if (!alive) return;
        const combined = mergeCasts(remote, presetCasts);
        const found = combined.find((item) => item.slug === username) ?? fallback;
        setCast(found ?? null);
        if (!found) {
          setError("Aradığınız cast bulunamadı.");
        } else if (fallback && found === fallback && remote.length) {
          setWarning("Sunucudaki kayıt bulunamadı, varsayılan bilgi gösteriliyor.");
        }
      } catch (err) {
        console.warn("Cast detayları alınamadı:", err);
        if (!alive) return;
        setCast(fallback);
        if (fallback) {
          setWarning("Sunucuya ulaşılamadı, ön tanımlı cast bilgisi gösteriliyor.");
        } else {
          setError("Cast bilgilerine ulaşılamadı.");
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [username, presetCasts]);

  const contacts = cast ? describeCastContacts(cast.contacts) : [];
  const createdAt = cast ? formatDate(cast.createdAt) : null;
  const updatedAt = cast ? formatDate(cast.updatedAt) : null;

  return (
    <div className="cast-detail-page">
      <div className="cast-detail__inner">
        <header className="cast-detail__header">
          <Link to="/cast" className="cast-detail__back">
            ← Cast listesine dön
          </Link>
        </header>

        {warning && !error && (
          <div className="cast-detail__notice cast-detail__notice--warning">
            {warning}
          </div>
        )}

        {error && (
          <div className="cast-detail__notice cast-detail__notice--error">
            {error}
          </div>
        )}

        {loading && !cast ? (
          <div className="cast-detail__loading">Cast bilgileri yükleniyor…</div>
        ) : cast ? (
          <article className="cast-detail__card">
            <div className="cast-detail__media">
              {cast.image ? (
                <img src={cast.image} alt={`${cast.name} portresi`} />
              ) : (
                <div className="cast-detail__placeholder">
                  {getCastInitials(cast.name)}
                </div>
              )}
            </div>
            <div className="cast-detail__body">
              <h1>{cast.name}</h1>
              {cast.role && <p className="cast-detail__role">{cast.role}</p>}
              {cast.bio && <p className="cast-detail__bio">{cast.bio}</p>}

              {contacts.length > 0 && (
                <div className="cast-detail__contacts">
                  <h2>İletişim</h2>
                  <dl>
                    {contacts.map((contact) => (
                      <div key={contact.key} className="cast-detail__contact-row">
                        <dt>{contact.label}</dt>
                        <dd>
                          {contact.href ? (
                            <a
                              href={contact.href}
                              target={contact.key === "email" ? "_self" : "_blank"}
                              rel="noreferrer"
                            >
                              {contact.value}
                            </a>
                          ) : (
                            contact.value
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              <div className="cast-detail__meta">
                {cast.origin === "remote" ? (
                  <span className="cast-detail__origin">Topluluk tarafından gönderildi</span>
                ) : (
                  <span className="cast-detail__origin">Lyra kayıtlarından</span>
                )}
                {createdAt && <span>Eklenme: {createdAt}</span>}
                {updatedAt && updatedAt !== createdAt && <span>Güncelleme: {updatedAt}</span>}
              </div>
            </div>
          </article>
        ) : (
          <div className="cast-detail__empty">
            Gösterilecek cast bulunamadı.
          </div>
        )}
      </div>
    </div>
  );
}