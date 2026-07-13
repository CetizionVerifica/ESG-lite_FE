import { useCallback, useEffect, useRef, useState } from "react";
import { getCompanies } from "../../services/companyService";
import { getBrand, saveBrand, uploadBrandLogo, Brand } from "../../services/brandService";

interface Company {
  company_id: number;
  name: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

const EMPTY: Brand = {
  companyId: 0,
  name: "",
  primary: "#1f2a44",
  accent: "#3b82f6",
  coverFrom: "#0d1526",
  coverTo: "#1f2a44",
  logoUrl: null,
  logoPublicId: null,
};

// One color control: swatch picker + hex text, kept in sync.
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const valid = HEX.test(value);
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={valid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 rounded border cursor-pointer bg-transparent"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-32 border px-3 py-2 rounded font-mono text-sm focus:outline-none focus:ring ${
            valid ? "" : "border-red-500"
          }`}
          placeholder="#1f2a44"
        />
      </div>
    </div>
  );
}

const BrandSettings = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<number>(0);
  const [brand, setBrand] = useState<Brand>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [logoBust, setLogoBust] = useState(0); // cache-buster for the fixed R2 URL
  const fileRef = useRef<HTMLInputElement>(null);

  const year = new Date().getFullYear();

  useEffect(() => {
    (async () => {
      try {
        const data = await getCompanies();
        setCompanies(data.companies || data);
      } catch {
        setMsg({ type: "err", text: "Failed to load companies" });
      }
    })();
  }, []);

  const loadBrand = useCallback(async (id: number) => {
    setLoading(true);
    setMsg(null);
    try {
      const b = await getBrand(id);
      setBrand({ ...EMPTY, ...b, companyId: id });
      setLogoBust(Date.now());
    } catch {
      setMsg({ type: "err", text: "Failed to load brand" });
    } finally {
      setLoading(false);
    }
  }, []);

  const onSelectCompany = (id: number) => {
    setCompanyId(id);
    if (id) loadBrand(id);
    else setBrand(EMPTY);
  };

  const set = (k: keyof Brand, v: string) => setBrand((b) => ({ ...b, [k]: v }));

  const colorsValid = ["primary", "accent", "coverFrom", "coverTo"].every((k) =>
    HEX.test((brand as any)[k])
  );

  const handleSave = async () => {
    if (!companyId) return;
    if (!colorsValid) {
      setMsg({ type: "err", text: "All colors must be 6-digit hex (e.g. #1f2a44)" });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await saveBrand(companyId, {
        name: brand.name,
        primary: brand.primary,
        accent: brand.accent,
        coverFrom: brand.coverFrom,
        coverTo: brand.coverTo,
      });
      setMsg({ type: "ok", text: "Theme saved" });
    } catch (e: any) {
      setMsg({ type: "err", text: e?.response?.data?.message || "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const handleLogo = async (file: File) => {
    if (!companyId) return;
    setUploading(true);
    setMsg(null);
    try {
      const res = await uploadBrandLogo(companyId, file);
      setBrand((b) => ({ ...b, logoUrl: res.brand?.logoUrl ?? b.logoUrl }));
      setLogoBust(Date.now());
      setMsg({ type: "ok", text: "Logo uploaded" });
    } catch (e: any) {
      setMsg({ type: "err", text: e?.response?.data?.message || "Logo upload failed" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const previewReport = () => {
    const base = import.meta.env.VITE_API_URL;
    const token = localStorage.getItem("token") ?? "";
    window.open(
      `${base}/reports/ghg/${companyId}?year=${year}&token=${encodeURIComponent(token)}`,
      "_blank"
    );
  };

  const logoSrc = brand.logoUrl ? `${brand.logoUrl}?v=${logoBust}` : null;

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold mb-1">Brand Settings</h1>
      <p className="text-sm text-gray-500 mb-6">
        Set the theme colors and logo used in each client's branded reports.
      </p>

      {/* Company selector */}
      <div className="mb-6 max-w-md">
        <label className="block text-sm font-medium mb-1">Company</label>
        <select
          value={companyId}
          onChange={(e) => onSelectCompany(Number(e.target.value))}
          className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
        >
          <option value={0}>— Select a company —</option>
          {companies.map((c) => (
            <option key={c.company_id} value={c.company_id}>
              {c.name} (#{c.company_id})
            </option>
          ))}
        </select>
      </div>

      {msg && (
        <div
          className={`mb-4 px-4 py-2 rounded text-sm ${
            msg.type === "ok" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
          }`}
        >
          {msg.text}
        </div>
      )}

      {companyId > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Editor */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <label className="block text-sm font-medium mb-1">Display Name</label>
              <input
                type="text"
                value={brand.name}
                onChange={(e) => set("name", e.target.value)}
                className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
                placeholder="Company name shown on the report"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <ColorField label="Primary" value={brand.primary} onChange={(v) => set("primary", v)} />
              <ColorField label="Accent" value={brand.accent} onChange={(v) => set("accent", v)} />
              <ColorField label="Cover gradient — from" value={brand.coverFrom} onChange={(v) => set("coverFrom", v)} />
              <ColorField label="Cover gradient — to" value={brand.coverTo} onChange={(v) => set("coverTo", v)} />
            </div>

            {/* Logo */}
            <div>
              <label className="block text-sm font-medium mb-2">Logo</label>
              <div className="flex items-center gap-4">
                <div className="h-16 w-40 border rounded flex items-center justify-center bg-gray-50 overflow-hidden">
                  {logoSrc ? (
                    <img src={logoSrc} alt="logo" className="max-h-14 max-w-[9rem] object-contain" />
                  ) : (
                    <span className="text-xs text-gray-400">No logo</span>
                  )}
                </div>
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={(e) => e.target.files?.[0] && handleLogo(e.target.files[0])}
                    className="text-sm"
                  />
                  {uploading && <p className="text-xs text-gray-500 mt-1">Uploading…</p>}
                  <p className="text-xs text-gray-400 mt-1">PNG, JPG, SVG or WebP · stored on R2</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving || loading}
                className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Theme"}
              </button>
              <button
                onClick={previewReport}
                className="px-5 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
              >
                Preview Report
              </button>
            </div>
          </div>

          {/* Live preview */}
          <div>
            <p className="text-sm font-medium mb-2">Live preview</p>
            <div className="rounded-lg border overflow-hidden">
              <div
                className="h-40 p-4 flex flex-col justify-between"
                style={{
                  background: `linear-gradient(160deg, ${brand.coverFrom}, ${brand.coverTo})`,
                }}
              >
                {logoSrc ? (
                  <img src={logoSrc} alt="logo" className="max-h-8 max-w-[8rem] object-contain self-start bg-white/90 rounded px-1" />
                ) : (
                  <div className="text-white/70 text-xs">logo</div>
                )}
                <div className="text-white font-semibold leading-tight">
                  {brand.name || "Company"}<br />
                  <span className="text-sm font-normal opacity-90">GHG Report CY{year}</span>
                </div>
              </div>
              <div className="p-4 space-y-2 bg-white">
                <div className="h-3 rounded" style={{ background: brand.primary, width: "70%" }} />
                <div className="h-3 rounded" style={{ background: brand.accent, width: "50%" }} />
                <div className="flex gap-2 pt-1">
                  <span className="text-xs px-2 py-1 rounded text-white" style={{ background: brand.primary }}>
                    Primary
                  </span>
                  <span className="text-xs px-2 py-1 rounded text-white" style={{ background: brand.accent }}>
                    Accent
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrandSettings;
