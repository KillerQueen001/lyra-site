import { useMemo, useRef, useState } from "react";
import { useGroups } from "../hooks/useGroups";
import { useVideoLibrary } from "../hooks/useVideoLibrary";
import { createGroup, isPngUrl } from "../utils/groupsApi";
import { slugify } from "../utils/slugify";
import {uploadAsset} from "../utils/uploadApi";
import "./AdminGroups.css";

const EMPTY_FORM = {
  name: "",
  groupId: "",
  description: "",
  banner: "",
  logo: "",
};

function formatStatus(status) {
  switch (status) {
    case "ready":
      return "Gruplar yüklendi";
    case "error":
      return "Gruplar yüklenemedi";
    case "loading":
    case "idle":
    default:
      return "Gruplar yükleniyor…";
  }
}

export default function AdminGroups() {
  const {
    groups: groupMap,
    list: groupList,
    status,
    error,
    reload,
  } = useGroups();
  const { library } = useVideoLibrary();
  const [form, setForm] = useState(EMPTY_FORM);
  const [isIdDirty, setIsIdDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [assetUploads, setAssetUploads] = useState({
    banner: { status: "idle", message: "" },
    logo: { status: "idle", message: "" },
  });
  const bannerInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const isLoading = status === "idle" || status === "loading";
  const isUploadingAsset =
    assetUploads.banner.status === "uploading" ||
    assetUploads.logo.status === "uploading";
  const videoCounts = useMemo(() => {
    const counts = {};
    Object.entries(library || {}).forEach(([, entry]) => {
      const groupId = typeof entry?.groupId === "string" ? entry.groupId : "";
      if (!groupId) return;
      counts[groupId] = (counts[groupId] || 0) + 1;
    });
    return counts;
  }, [library]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setSubmitError("");
    setSubmitSuccess("");
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "name" && !isIdDirty) {
        next.groupId = slugify(value);
      }
      return next;
    });
  };

  const handleGroupIdChange = (event) => {
    setIsIdDirty(true);
    setSubmitError("");
    setSubmitSuccess("");
    setForm((prev) => ({
      ...prev,
      groupId: slugify(event.target.value),
    }));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setIsIdDirty(false);
    setSubmitError("");
    setSubmitSuccess("");
    setAssetUploads({
      banner: { status: "idle", message: "" },
      logo: { status: "idle", message: "" },
    });
  };

  const updateAssetStatus = (field, status, message = "") => {
    setAssetUploads((prev) => ({
      ...prev,
      [field]: { status, message },
    }));
  };

  const getGroupSlug = () => {
    const source = form.groupId.trim() || form.name.trim();
    const slug = slugify(source);
    if (slug) return slug;
    return `group-${Date.now().toString(36)}`;
  };

  const handleAssetUpload = async (field, fileInput) => {
    const file = fileInput?.files?.[0];
    if (!file) return;
    fileInput.value = "";
    const fileName = file?.name || `${field}.png`;
    const lowerName = fileName.toLowerCase();
    if (!lowerName.endsWith(".png") && file.type !== "image/png" && file.type !== "image/x-png") {
      updateAssetStatus(field, "error", "Lütfen PNG formatında bir dosya seçin.");
      return;
    }
    updateAssetStatus(field, "uploading", "Yükleniyor…");
    try {
      const slug = getGroupSlug();
      const result = await uploadAsset(file, {
        folder: `groups/${slug}`,
        fileName: `${field}-${Date.now().toString(36)}`,
        extension: "png",
        contentType: "image/png",
      });
      setForm((prev) => ({
        ...prev,
        [field]: result.url || prev[field],
      }));
      updateAssetStatus(field, "success", "Bunny CDN'e yüklendi.");
      setSubmitError("");
    } catch (error) {
      updateAssetStatus(field, "error", error.message || "Dosya yüklenemedi.");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    setSubmitSuccess("");

    const name = form.name.trim();
    let groupId = form.groupId.trim();
    const description = form.description.trim();
    const banner = form.banner.trim();
    const logo = form.logo.trim();

    if (!name) {
      setSubmitError("Lütfen grup adı girin.");
      return;
    }

    if (!groupId) {
      groupId = slugify(name);
      setIsIdDirty(true);
    }

    if (!groupId) {
      setSubmitError("Lütfen grup için bir ID belirleyin.");
      return;
    }

    if (groupMap[groupId]) {
      setSubmitError("Bu grup ID'si zaten kayıtlı.");
      return;
    }

    if (!banner) {
      setSubmitError("Grup banner adresi zorunludur.");
      return;
    }

    if (!isPngUrl(banner)) {
      setSubmitError("Banner adresi PNG formatında olmalıdır.");
      return;
    }

    if (!logo) {
      setSubmitError("Grup logosu zorunludur.");
      return;
    }

    if (!isPngUrl(logo)) {
      setSubmitError("Logo adresi PNG formatında olmalıdır.");
      return;
    }
    if (isUploadingAsset) {
      setSubmitError("Lütfen dosya yüklemeleri tamamlanana kadar bekleyin.");
      return;
    }

    setSubmitting(true);
    try {
      await createGroup({
        id: groupId,
        name,
        description,
        banner,
        logo,
      });
      await reload();
      setSubmitSuccess("Grup başarıyla oluşturuldu.");
      resetForm();
    } catch (err) {
      setSubmitError(err.message || "Grup kaydı oluşturulamadı.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-groups-page">
      <div className="admin-groups__inner">
        <header className="admin-groups__header">
          <div>
            <h1>Grup Yönetimi</h1>
            <p>
              Yeni prodüksiyon grupları oluşturun, banner ve logo bilgilerini
              yönetin. Gruplar video kütüphanesindeki içeriklerle eşleştirilebilir.
            </p>
          </div>
          <div className={`admin-groups__status admin-groups__status--${status}`}>
            <span>{formatStatus(status)}</span>
            <button
              type="button"
              onClick={() => reload().catch(() => {})}
              disabled={isLoading || submitting || isUploadingAsset}
            >
              Yenile
            </button>
          </div>
        </header>

        {error ? (
          <div className="admin-groups__alert admin-groups__alert--error">
            {error.message || "Gruplar yüklenirken hata oluştu."}
            <button
              type="button"
              onClick={() => reload().catch(() => {})}
              disabled={isLoading || submitting || isUploadingAsset}
            >
              Tekrar dene
            </button>
          </div>
        ) : null}

        <section className="admin-groups__form">
          <div className="admin-groups__form-head">
            <div>
              <h2>Yeni Grup Oluştur</h2>
              <p>PNG formatında banner ve logo adreslerini paylaşmayı unutmayın.</p>
            </div>
            <div className="admin-groups__form-meta">
              <span>{groupList.length} kayıt</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="admin-groups__form-body">
            <div className="admin-groups__form-grid">
              <label>
                <span>Grup Adı</span>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleInputChange}
                  placeholder="Örn. Lyra Records"
                />
              </label>
              <label>
                <span>Grup ID</span>
                <input
                  name="groupId"
                  value={form.groupId}
                  onChange={handleGroupIdChange}
                  placeholder="lyra-records"
                />
                <small>ID yalnızca küçük harf ve tire içerebilir.</small>
              </label>
              <label className="admin-groups__span-2">
                <span>Açıklama</span>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleInputChange}
                  placeholder="Grup hakkında kısa bilgi"
                  rows={3}
                />
              </label>
              <label>
                <span>Banner (PNG)</span>
                <input
                  name="banner"
                  value={form.banner}
                  onChange={handleInputChange}
                  placeholder="https://.../banner.png"
                />
                <small className="admin-groups__upload">
                  <button
                    type="button"
                    onClick={() => bannerInputRef.current?.click()}
                    disabled={isUploadingAsset || submitting}
                  >
                    Bunny'e yükle
                  </button>
                  <input
                    ref={bannerInputRef}
                    type="file"
                    accept="image/png"
                    className="admin-groups__upload-input"
                    onChange={(event) => handleAssetUpload("banner", event.target)}
                  />
                  <span
                    className={`admin-groups__upload-status admin-groups__upload-status--${assetUploads.banner.status}`}
                  >
                    {assetUploads.banner.message ||
                      "PNG dosyanızı Bunny Storage'a yükleyebilirsiniz."}
                  </span>
                </small>
              </label>
              <label>
                <span>Logo (PNG)</span>
                <input
                  name="logo"
                  value={form.logo}
                  onChange={handleInputChange}
                  placeholder="https://.../logo.png"
                />
                <small className="admin-groups__upload">
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={isUploadingAsset || submitting}
                  >
                    Bunny'e yükle
                  </button>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png"
                    className="admin-groups__upload-input"
                    onChange={(event) => handleAssetUpload("logo", event.target)}
                  />
                  <span
                    className={`admin-groups__upload-status admin-groups__upload-status--${assetUploads.logo.status}`}
                  >
                    {assetUploads.logo.message ||
                      "Logo için PNG dosyası yüklemek üzere butona tıklayın."}
                  </span>
                </small>
              </label>
            </div>

            {submitError ? (
              <div className="admin-groups__alert admin-groups__alert--error">
                {submitError}
              </div>
            ) : null}
            {submitSuccess ? (
              <div className="admin-groups__alert admin-groups__alert--success">
                {submitSuccess}
              </div>
            ) : null}

            <div className="admin-groups__actions">
              <button type="submit" disabled={submitting || isUploadingAsset}>
                {submitting ? "Kaydediliyor..." : "Grup Ekle"}
              </button>
              <button
                type="button"
                className="admin-groups__secondary"
                onClick={resetForm}
                disabled={submitting || isUploadingAsset}
              >
                Temizle
              </button>
            </div>
          </form>
        </section>

        <section className="admin-groups__list">
          <h2>Mevcut Gruplar</h2>
          {groupList.length === 0 ? (
            <p className="admin-groups__empty">
              Henüz grup eklenmemiş. Formu kullanarak ilk kaydı oluşturabilirsiniz.
            </p>
          ) : (
            <div className="admin-groups__grid">
              {groupList.map((group) => (
                <article className="admin-groups__card" key={group.id}>
                  <div className="admin-groups__card-banner">
                    <img src={group.banner} alt={`${group.name} banner`} />
                  </div>
                  <div className="admin-groups__card-body">
                    <div className="admin-groups__card-head">
                      <img src={group.logo} alt={`${group.name} logo`} />
                      <div>
                        <h3>{group.name}</h3>
                        <span>{group.id}</span>
                      </div>
                    </div>
                    <p>{group.description || "Açıklama eklenmemiş."}</p>
                    <div className="admin-groups__card-meta">
                      <span>{videoCounts[group.id] || 0} video</span>
                      {group.updatedAt ? (
                        <span>
                          Güncellendi: {new Date(group.updatedAt).toLocaleDateString("tr-TR")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}