import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
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
  const [casts, setCasts] = useState(presetCasts);
  const [loading, setLoading] = useState(true);
  const [serverStatus, setServerStatus] = useState("loading");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const remote = await fetchCasts();
        if (!alive) return;
        setCasts(mergeCasts(remote, presetCasts));
        setServerStatus("online");
      } catch (error) {
        console.warn("Cast listesi alınamadı:", error);
        if (!alive) return;
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

  return (
    <div className="cast-page">
      <div className="cast-page__inner">
        <section className="cast-hero">
          <div className="cast-hero__content">
            <h1>Cast Kataloğu</h1>
            <p>
              Lyra Records prodüksiyonlarında birlikte çalıştığımız cast ekibini
              keşfedin. Her karttan detay sayfasına giderek iletişim
              bağlantılarına ulaşabilirsiniz.
            </p>
          </div>
          <div className={`cast-hero__status cast-hero__status--${serverStatus}`}>
            {serverStatus === "online"
              ? "Cast verileri güncel"
              : serverStatus === "offline"
              ? "Sunucuya ulaşılamadı"
              : "Cast verileri yükleniyor"}
          </div>
        </section>

        <section className="cast-list">
          <div className="cast-list__header">
            <h2>Katalog</h2>
            <p>
              {loading
                ? "Cast kartları hazırlanıyor…"
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
        <section className="cast-cta">
          <h2>Cast ekibine katılmak mı istiyorsunuz?</h2>
          <p>
            Portföyünüzü eklemek veya bilgilerinizi güncellemek için admin
            panelinden cast yönetimi ekranına başvurabilirsiniz.
          </p>
          <Link to="/admin/casts" className="cast-cta__link">
            Admin Cast Yönetimine git
          </Link>
        </section>
      </div>
    </div>
  );
}