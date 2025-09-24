import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import CastTimelineEditor from "../components/CastTimelineEditor";
import { xrayDemo } from "../data/xrayDemo";
import { getVideoEntry } from "../data/videoLibrary";
import { applyOverrides, saveCastSlots } from "../utils/castLocal";
import { loadHls } from "../utils/loadHls";
import { isHlsSource, resolveSingleVideo, resolveVideoSrc } from "../utils/videoSource";

/** kalite seçimi: 1080 → 720 → 480 (var olana düşer) */
const PREFS = ["1080", "720", "480"];

export default function CastEditor() {
  const { id = "demo", castId = "" } = useParams();
  const nav = useNavigate();

  const videoEntry = useMemo(() => getVideoEntry(id), [id]);
  const videoRef = useRef(null);  
  const hlsRef = useRef(null);

  // xrayDemo + local overrides birleşik liste
  const [list, setList] = useState(() => applyOverrides(id, xrayDemo));

  // cast/others
  const me = useMemo(() => list.find((x) => x.id === castId) || null, [list, castId]);
  const others = useMemo(() => list.filter((x) => x.id !== castId), [list, castId]);

  // video kalite fallback
  const [prefIdx, setPrefIdx] = useState(0);
  const [src, setSrc] = useState(() => resolveVideoSrc(id, PREFS[0]));
  const isHls = useMemo(
    () => isHlsSource(src) || (videoEntry?.stream ? isHlsSource(videoEntry.stream) : false),
    [src, videoEntry]
  );
  const [playerMessage, setPlayerMessage] = useState("");
  useEffect(() => {
    setPrefIdx(0);
  }, [id]);

  useEffect(() => {
    setSrc(resolveVideoSrc(id, PREFS[prefIdx]));
  }, [id, prefIdx]);

  // sayfa ilk açılış + her odaklanmada override’ları tazele
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return undefined;

    const detach = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    if (isHls) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        if (video.dataset.loadedSrc !== src) {
          video.src = src;
          video.dataset.loadedSrc = src;
          video.load();
        }
        setPlayerMessage("");
        return () => detach();
      }

      let cancelled = false;

      loadHls()
        .then((HlsLib) => {
          if (cancelled) return;
          const HlsCtor = HlsLib?.default ?? HlsLib;
          if (!HlsCtor || !HlsCtor.isSupported?.()) {
            setPlayerMessage("Tarayıcı HLS akışını desteklemiyor.");
            return;
          }
          detach();
          const instance = new HlsCtor();
          hlsRef.current = instance;
          instance.loadSource(src);
          instance.attachMedia(video);
          video.dataset.loadedSrc = src;
          setPlayerMessage("");
        })
        .catch(() => {
          if (cancelled) return;
          setPlayerMessage("HLS kütüphanesi yüklenemedi.");
        });

      return () => {
        cancelled = true;
        detach();
      };
    }

    detach();
    setPlayerMessage("");
    if (video.dataset.loadedSrc !== src) {
      video.src = src;
      video.dataset.loadedSrc = src;
      video.load();
    }

    return () => {
      detach();
    };
  }, [src, isHls]);


  useEffect(() => {
    function refresh() {
      setList(applyOverrides(id, xrayDemo));
    }
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [id]);

  // video kaynağında hata olursa bir alt kaliteye in
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const fallbackSrc = resolveSingleVideo(id);
    const onError = () => {
      setPrefIdx((idx) => {
        if (idx < PREFS.length - 1) {
          return idx + 1;
        }
        if (fallbackSrc && fallbackSrc !== src) {
          setSrc(fallbackSrc);
        }
        return idx;
      });
    };
    v.addEventListener("error", onError);
    return () => v.removeEventListener("error", onError);
  }, [id, src]);

  useEffect(() => () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);


  return (
    <div style={{ minHeight: "100vh", background: "#0f0f14", color: "#eee", padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* üst bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <Link to={`/cast/select/${id}`} style={{ color: "#bfb8d6" }}>
            ← Kast seç
          </Link>
          <div style={{ fontSize: 14, opacity: 0.75 }}>
            {me ? `${me.name} — ${me.role}` : "…"}
          </div>
        </div>

        {/* video + editor */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ width: 640, maxWidth: "100%" }}>
            <video
              ref={videoRef}
              controls
              preload="metadata"
              style={{
                width: "100%",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,.12)",
                background: "#000",
                display: "block",
              }}
              poster={videoEntry?.poster}
            />
            <div style={{
              marginTop: 8,
              fontSize: 12,
              color: "#bfb8d6",
            }}>
              Kaynak: <strong>{isHls ? "HLS akışı" : "MP4 dosyası"}</strong>
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 12,
                color: "#bfb8d6",
                wordBreak: "break-all",
              }}
            >
              Aktif kaynak: <code>{src}</code>
            </div>
            {playerMessage && (
              <div style={{
                marginTop: 4,
                fontSize: 13,
                color: "#f8d57e",
              }}>
                {playerMessage}
              </div>
            )}
          </div>
          <div style={{ flex: 1 }}>
            {me && (
              <CastTimelineEditor
                videoRef={videoRef}
                initialSlots={me.slots ?? []}
                ghosts={others.map((o, i) => ({
                  id: o.id,
                  name: o.name,
                  color: paletteColor(i),
                  slots: o.slots ?? [],
                }))}
                onSave={(edited) => {
                  // compact: sadece start/end
                  const compact = edited.map(({ start, end }) => ({ start, end }));
                  // videoId[castId] formatında kaydet
                  saveCastSlots(id, castId, compact);
                  // ekranda anında güncellemek istersen (geri dönmeden):
                  setList((prev) =>
                    prev.map((x) => (x.id === castId ? { ...x, slots: compact } : x))
                  );
                  // Kast Seç sayfasına dön
                  nav(`/cast/select/${id}`);
                }}
              />
            )}
          </div>
        </div>

        {/* alt aksiyonlar */}
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button
            onClick={() => nav(`/cast/select/${id}`)}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,.12)",
              background: "#1b1b24",
              color: "#eee",
              cursor: "pointer",
            }}
          >
            Yeni kast seç
          </button>
        </div>
      </div>
    </div>
  );
}

function paletteColor(i) {
  const pal = ["#b598ff", "#5ad1b3", "#ffd166", "#8ecae6", "#ff8fa3", "#c3f584"];
  return pal[i % pal.length];
}
