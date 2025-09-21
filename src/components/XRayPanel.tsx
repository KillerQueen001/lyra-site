// frontend/src/components/XRayPanel.tsx
import { AnimatePresence, motion, type Transition } from "framer-motion";

const COLORS = {
  card: "#1b1b24",
  text: "#eee",
  textMuted: "#bfb8d6",
  border: "rgba(255,255,255,.14)",
};

// Kontrol barını kapatmaması için alt güvenli boşluk
export const OVERLAY_BOTTOM_SAFE = 84;

export type TimeRange = { start: number; end: number };

export type XRayItem = {
  id: string;
  name: string;
  role: string;
  photo: string;          // /xray/xxx.jpg veya tam URL
  slots?: TimeRange[];    // 👈 saniye aralıkları (opsiyonel)
};

// Framer Motion transitions
const spring: Transition = { type: "spring", stiffness: 420, damping: 34, mass: 0.6 };
const fade: Transition = { type: "tween", duration: 0.22, ease: "easeInOut" };

export default function XRayPanel({
  open,
  onClose,
  onOverlayClick,
  items,
  loading = false,
  emptyText = "Bu sahnede cast bulunamadı.",
}: {
  open: boolean;
  onClose: () => void;
  onOverlayClick?: () => void;
  items: XRayItem[];
  loading?: boolean;
  emptyText?: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: open ? "auto" : "none",
        zIndex: 30,
        overflow: "hidden", // 👈 overlay tarafında scroll ipucu çıkmasın
      }}
    >
      {/* component-local CSS: liste scrollbar'ını gizle */}
      <style
        // benzersiz bir sınıf adıyla hedefliyoruz
        dangerouslySetInnerHTML={{
          __html: `
            .xray-scroll {
              scrollbar-width: none;         /* Firefox */
              -ms-overflow-style: none;      /* IE/Edge legacy */
            }
            .xray-scroll::-webkit-scrollbar { /* Chrome/Safari */
              display: none;
            }
          `,
        }}
      />

      {/* Soldan panel */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.aside
            key="panel"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={spring}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: 360,
              maxWidth: "90vw",
              background:
                "linear-gradient(180deg, rgba(0,0,0,.7) 0%, rgba(0,0,0,.45) 60%, rgba(0,0,0,.3) 100%)",
              backdropFilter: "blur(6px)",
              borderRight: `1px solid ${COLORS.border}`,
              padding: 16,
              boxSizing: "border-box",
              pointerEvents: "auto",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <button
                aria-label="Paneli kapat"
                onClick={onClose}
                style={{
                  width: 28,
                  height: 28,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 999,
                  border: `1px solid ${COLORS.border}`,
                  background: "rgba(0,0,0,.25)",
                  color: COLORS.text,
                  cursor: "pointer",
                }}
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

              <div style={{ color: COLORS.text, fontWeight: 800, fontSize: 20 }}>Castlar</div>
              <div style={{ marginLeft: "auto", color: COLORS.textMuted, fontSize: 12 }}>Tümü ▸</div>
            </div>

            {/* Liste / durumlar */}
            <motion.div
              // parent'i de layout'lu yapıyoruz ki child'lar arası akış daha iyi çözülsün
              layout
              className="xray-scroll"
              style={{
                overflowY: "auto",
                maxHeight: `calc(100% - 48px)`,
                paddingRight: 6,
              }}
              transition={spring}
            >
              {loading ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <motion.div
                      key={`skeleton-${i}`}
                      initial={{ opacity: 0, y: 8, height: 0, marginBottom: 0 }}
                      animate={{ opacity: 1, y: 0, height: "auto", marginBottom: 10 }}
                      exit={{ opacity: 0, y: -8, height: 0, marginBottom: 0 }}
                      transition={fade}
                      style={{
                        overflow: "hidden", // height animasyonu için
                        display: "grid",
                        gridTemplateColumns: "64px 1fr",
                        gap: 12,
                        alignItems: "center",
                        padding: "10px 8px",
                        borderRadius: 10,
                        border: `1px solid ${COLORS.border}`,
                        background: "rgba(27,27,36,.55)",
                      }}
                    >
                      <div
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 8,
                          background: "rgba(255,255,255,.08)",
                        }}
                      />
                      <div>
                        <div
                          style={{
                            height: 16,
                            width: "60%",
                            borderRadius: 6,
                            background: "rgba(255,255,255,.08)",
                            marginBottom: 8,
                          }}
                        />
                        <div
                          style={{
                            height: 12,
                            width: "40%",
                            borderRadius: 6,
                            background: "rgba(255,255,255,.06)",
                          }}
                        />
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 6, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto", marginBottom: 0 }}
                  transition={fade}
                  style={{ color: COLORS.textMuted, padding: "8px 2px", overflow: "hidden" }}
                >
                  {emptyText}
                </motion.div>
              ) : (
                <AnimatePresence initial={false} mode="popLayout">
                  {items.map((p) => (
                    <motion.div
                      key={p.id}
                      layout
                      initial={{ opacity: 0, y: 10, scale: 0.98, height: 0, marginBottom: 0 }}
                      animate={{ opacity: 1, y: 0, scale: 1, height: "auto", marginBottom: 10 }}
                      exit={{ opacity: 0, y: -10, scale: 0.98, height: 0, marginBottom: 0 }}
                      transition={spring}
                      style={{
                        overflow: "hidden", // 👈 height animasyonu için şart
                        display: "grid",
                        gridTemplateColumns: "64px 1fr",
                        gap: 12,
                        alignItems: "center",
                        padding: "10px 8px",
                        borderRadius: 10,
                        border: `1px solid ${COLORS.border}`,
                        background: "rgba(27,27,36,.55)",
                      }}
                    >
                      <motion.img
                        src={p.photo}
                        alt={p.name}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={fade}
                        style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8 }}
                      />
                      <div>
                        <div style={{ color: COLORS.text, fontWeight: 700 }}>{p.name}</div>
                        <div style={{ color: COLORS.textMuted, fontSize: 13 }}>{p.role}</div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </motion.div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Sağ karartma — alt bar için boşluk bırak */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="overlay"
            onClick={() => {
              onClose();
              onOverlayClick?.();
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: OVERLAY_BOTTOM_SAFE,
              background: "linear-gradient(90deg, rgba(0,0,0,.5), rgba(0,0,0,0))",
              pointerEvents: "auto",
            }}
          />
        )}
      </AnimatePresence>

      {/* Panel kapalıyken çekme kulpu */}
      <AnimatePresence initial={false}>
        {!open && (
          <motion.button
            key="pull"
            onClick={onClose}
            title="Castlar'ı aç"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={fade}
            style={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              width: 32,
              height: 48,
              borderRadius: 10,
              border: `1px solid ${COLORS.border}`,
              background: "rgba(0,0,0,.35)",
              color: COLORS.text,
              cursor: "pointer",
              zIndex: 31,
              pointerEvents: "auto",
            }}
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
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
