import { AnimatePresence, motion as Motion } from "framer-motion";
import "./XRayPanel.css";

// Kontrol barını kapatmaması için alt güvenli boşluk
export const OVERLAY_BOTTOM_SAFE = 84;

/**
 * @typedef {{start: number, end: number}} TimeRange
 * @typedef {{id: string, name: string, role: string, photo: string, slots?: TimeRange[]}} XRayItem
 */

// Framer Motion transitions
const spring = { type: "spring", stiffness: 420, damping: 34, mass: 0.6 };
const fade = { type: "tween", duration: 0.22, ease: "easeInOut" };

export default function XRayPanel({
  open,
  onClose,
  onOverlayClick,
  items,
  loading = false,
  emptyText = "Bu sahnede cast bulunamadı.",
}) {
  return (
    <div className={`xray-overlay${open ? " is-open" : ""}`}>
      {/* Soldan panel */}
      <AnimatePresence initial={false}>
        {open && (
          <Motion.aside
            key="panel"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={spring}
            className="xray-panel"
          >
            {/* Header */}
            <div className="xray-header">
              <button
                type="button"
                aria-label="Paneli kapat"
                onClick={onClose}
                className="xray-close"
                title="Kapat"
              >
                {/* Ortalı chevron */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M15 18l-6-6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <div className="xray-title">Castlar</div>
              <div className="xray-see-all">Tümü ▸</div>
            </div>

            {/* Liste / durumlar */}
            <Motion.div
              // parent'i de layout'lu yapıyoruz ki child'lar arası akış daha iyi çözülsün
              layout
              className="xray-scroll"
              transition={spring}
            >

              {loading ? (
                <div className="xray-skeleton-container">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Motion.div
                      key={`skeleton-${i}`}
                      initial={{ opacity: 0, y: 8, height: 0, marginBottom: 0 }}
                      animate={{ opacity: 1, y: 0, height: "auto", marginBottom: 10 }}
                      exit={{ opacity: 0, y: -8, height: 0, marginBottom: 0 }}
                      transition={fade}
                      className="xray-skeleton-item"
                    >
                    <div className="xray-skeleton-thumb" />
                      <div>
                        <div className="xray-skeleton-line" />
                        <div className="xray-skeleton-subline" />
                      </div>
                    </Motion.div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <Motion.div
                  initial={{ opacity: 0, y: 6, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto", marginBottom: 0 }}
                  transition={fade}
                  className="xray-empty"
                >
                  {emptyText}
                </Motion.div>
              ) : (
                <AnimatePresence initial={false} mode="popLayout">
                  {items.map((p) => {
                    const initials = p.name
                      ? p.name
                          .split(" ")
                          .filter(Boolean)
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)
                      : "?";
                    return (
                      <Motion.div
                        key={p.id}
                        layout
                        initial={{ opacity: 0, y: 10, scale: 0.98, height: 0, marginBottom: 0 }}
                        animate={{ opacity: 1, y: 0, scale: 1, height: "auto", marginBottom: 10 }}
                        exit={{ opacity: 0, y: -10, scale: 0.98, height: 0, marginBottom: 0 }}
                        transition={spring}
                        className="xray-item"
                      >
                        {p.photo ? (
                          <Motion.img
                            src={p.photo}
                            alt={p.name}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={fade}
                            className="xray-item-photo"
                          />
                        ) : (
                          <div className="xray-item-photo xray-item-photo--fallback" aria-hidden>
                            {initials}
                          </div>
                        )}
                        <div>
                          <div className="xray-item-name">{p.name}</div>
                          <div className="xray-item-role">{p.role}</div>
                        </div>
                      </Motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </Motion.div>
          </Motion.aside>
        )}
      </AnimatePresence>

      {/* Sağ karartma — alt bar için boşluk bırak */}
      <AnimatePresence initial={false}>
        {open && (
          <Motion.div
            key="overlay"
            onClick={() => {
              onClose();
              onOverlayClick?.();
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            className="xray-overlay-backdrop"
          />
        )}
      </AnimatePresence>

      {/* Panel kapalıyken çekme kulpu */}
      <AnimatePresence initial={false}>
        {!open && (
          <Motion.button
            key="pull"
            type="button"
            onClick={onClose}
            title="Castlar'ı aç"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={fade}
            className="xray-pull"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
