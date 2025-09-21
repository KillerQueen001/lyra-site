import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import type { XRayItem } from "../components/XRayPanel";
import { loadXray, saveXray } from "../utils/xrayStore";
import { allCasts, type CastBrief } from "../data/globalCasts";

export default function CastSelect() {
  const { id = "demo" } = useParams();
  const nav = useNavigate();
  const [items, setItems] = useState<XRayItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [addId, setAddId] = useState<string>("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const data = await loadXray(id);
      if (!alive) return;
      setItems(data);
    })();
    return () => { alive = false; };
  }, [id]);

  const assignedIds = new Set(items.map((x) => x.id));
  const candidates: CastBrief[] = allCasts.filter((c) => !assignedIds.has(c.id));

  async function handleAdd() {
    if (!addId) return;
    const c = candidates.find((x) => x.id === addId);
    if (!c) return;
    const next: XRayItem[] = [...items, { ...c, slots: [] }];
    await saveXray(id, next);
    setItems(next);
    setAdding(false);
    setAddId("");
  }

  return (
    <div className="min-h-screen bg-[#0f0f14] text-[#eee] p-6">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm opacity-80">
            <Link to={`/watch/${id}`} className="text-[#bfb8d6] hover:text-white">← Videoya dön</Link>
          </div>
          <button
            className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500"
            onClick={async () => {
              // “Uygula” → şu an tüm değişiklikler localStorage’a zaten yazıldı.
              // Burada istersen gerçek API çağrısını yapabilirsin.
              // await fetch(`/api/xray/${id}`, { method: "POST", body: JSON.stringify(items) })
              alert("Uygulandı ✓");
            }}
          >
            Uygula
          </button>
        </div>

        <h1 className="text-2xl font-semibold mb-3">Kast Seç</h1>
        <p className="text-[#bfb8d6] mb-4">Bu videoya atanmış oyuncular:</p>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((x) => (
            <div key={x.id} className="rounded-lg border border-white/10 bg-[#1b1b24] p-3">
              <div className="flex items-center gap-2">
                <img src={x.photo} alt="" className="w-10 h-10 rounded object-cover" />
                <div>
                  <div className="font-medium">{x.name}</div>
                  <div className="text-xs text-[#bfb8d6]">{x.role}</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-[#bfb8d6]">{x.slots?.length ?? 0} parça</div>
              <button
                className="mt-2 w-full px-3 py-1.5 rounded bg-[#7c4bd9] hover:opacity-90"
                onClick={() => nav(`/cast/editor/${id}/${x.id}`)}
              >
                Düzenle
              </button>
            </div>
          ))}
        </div>

        <div className="mt-6">
          {!adding ? (
            <button
              className="px-3 py-1.5 rounded bg-[#3a334a] hover:bg-[#4a405c]"
              onClick={() => setAdding(true)}
            >
              Yeni kast ekle
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <select
                className="bg-[#0f0f14] rounded px-2 py-1 border border-white/10"
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
              >
                <option value="">Seç…</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.role}
                  </option>
                ))}
              </select>
              <button className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500" onClick={handleAdd}>Ekle</button>
              <button className="px-3 py-1.5 rounded bg-[#3a334a] hover:bg-[#4a405c]" onClick={() => setAdding(false)}>Vazgeç</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
