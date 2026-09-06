"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import QRCode from "react-qr-code";
import { FLYER_TEMPLATES, getTemplate } from "@/lib/flyer/templates";

type PropertyData = {
  address: string;
  city: string | null;
  state: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  propertyType: string | null;
  yearBuilt: number | null;
  estimatedValue: number | null;
  propertyId: string;
};

type AgentInfo = {
  name: string;
  email: string;
  phone: string;
  avatarUrl: string;
  brandName: string;
  logoUrl: string;
};

type PropertyOption = { id: string; address: string | null; city?: string | null; state?: string | null };
type SavedFlyer = { id: string; template_key: string; property_address: string; created_at: string };

/**
 * When the agent enters the flyer builder via the "Print flyer"
 * button on an open-house detail page, the SSR resolves the open
 * house and passes its data here. We use it to:
 *   - Skip the property dropdown (the address is already known)
 *   - Override the QR payload to encode `/oh/<slug>` so visitors
 *     who scan land on the same public sign-in page they would
 *     hit via the iPad kiosk QR
 *   - Render an event banner with the date/time so the printed
 *     flyer shows when the open house is
 *
 * Null when the agent navigated here directly from the picker.
 */
export type OpenHousePrefill = {
  id: string;
  slug: string;
  propertyAddress: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  listPrice: number | null;
  mlsNumber: string | null;
  mlsUrl: string | null;
  startAt: string;
  endAt: string;
};

function labelFor(p: PropertyOption) {
  return p.address?.trim() || [p.city, p.state].filter(Boolean).join(", ") || p.id;
}

export default function FlyerBuilderClient({
  agentId,
  properties: propertyOptions,
  openHousePrefill,
}: {
  agentId: string;
  properties: PropertyOption[];
  openHousePrefill?: OpenHousePrefill | null;
}) {
  const { t: tr, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [selectedPropertyId, setSelectedPropertyId] = useState(propertyOptions[0]?.id ?? "");
  const selectedOption = propertyOptions.find((p) => p.id === selectedPropertyId) ?? propertyOptions[0];
  // Open-house prefill takes precedence over the dropdown selection.
  const address = openHousePrefill?.propertyAddress ?? (selectedOption ? labelFor(selectedOption) : "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateKey, setTemplateKey] = useState("classic");
  const [defaultTemplate, setDefaultTemplate] = useState("classic");
  const [savedFlyers, setSavedFlyers] = useState<SavedFlyer[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Property data (editable)
  const [property, setProperty] = useState<PropertyData | null>(null);
  const [description, setDescription] = useState("");
  const [listingPrice, setListingPrice] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  // Agent info
  const [agent, setAgent] = useState<AgentInfo>({ name: "", email: "", phone: "", avatarUrl: "", brandName: "", logoUrl: "" });

  // PDF generation
  const [generating, setGenerating] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Origin is only known on the client. Defer to a state-driven flag
  // so the QR doesn't render on the server with an empty value and
  // then hydrate to a different one (the encoded SVG path data
  // differs and React logs a hydration mismatch — see TVR-style
  // browser logs).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const origin = mounted && typeof window !== "undefined" ? window.location.origin : "";
  const signupUrl = useMemo(() => {
    // When this flyer is for a specific open house, the QR encodes the
    // public sign-in URL (`/oh/<slug>`) so visitors who scan it land on
    // the same page they'd hit from the iPad kiosk. Otherwise fall
    // back to the generic property-signup flow keyed by property_id.
    if (openHousePrefill?.slug) {
      return `${origin}/oh/${openHousePrefill.slug}`;
    }
    if (!property?.propertyId) return "";
    return `${origin}/open-house-signup?property_id=${encodeURIComponent(property.propertyId)}&agent_id=${encodeURIComponent(agentId)}`;
  }, [origin, openHousePrefill?.slug, property?.propertyId, agentId]);

  // Load agent info + saved flyers on mount
  useEffect(() => {
    fetch("/api/dashboard/flyer/saved").then((r) => r.json()).then((body) => {
      if (body.ok) {
        setSavedFlyers(body.flyers ?? []);
        setDefaultTemplate(body.defaultTemplate ?? "classic");
        setTemplateKey(body.defaultTemplate ?? "classic");
      }
    }).catch(() => {});

    Promise.all([
      fetch("/api/me").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/branding").then((r) => r.json()).catch(() => ({})),
    ]).then(([me, branding]) => {
      setAgent({
        name: me?.full_name || me?.email?.split("@")[0] || "",
        email: me?.email || "",
        phone: me?.phone || "",
        avatarUrl: me?.avatar_url || "",
        brandName: branding?.branding?.brandName || "",
        logoUrl: branding?.branding?.logoUrl || "",
      });
    });
  }, []);

  // When the page is opened via "Print flyer" from an open-house
  // detail page, kick off the property fetch automatically so the
  // agent doesn't have to re-pick the address. The empty-deps
  // pattern is intentional — runs once on mount with the SSR-supplied
  // prefill. eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (openHousePrefill?.propertyAddress) {
      void fetchProperty();
      if (openHousePrefill.listPrice != null) {
        setListingPrice(`$${Math.round(openHousePrefill.listPrice).toLocaleString()}`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchProperty() {
    if (!address.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/flyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        if (res.status === 404) {
          throw new Error(
            `We couldn't find property data for "${address}". The address may be incorrect, or our data provider has no record for it. Try a different address or update the property's details first.`,
          );
        }
        throw new Error(body.error ?? "Could not find property");
      }

      // Guard against the API returning a stub record with no usable data —
      // happens when the external property lookup failed but a placeholder
      // row exists in our DB. Without this, the user would be sent to the
      // editable preview with empty fields and no clear signal of failure.
      const p = body.property as PropertyData;
      const hasData =
        p?.beds != null ||
        p?.baths != null ||
        p?.sqft != null ||
        p?.yearBuilt != null ||
        p?.propertyType != null ||
        p?.estimatedValue != null;
      if (!hasData) {
        throw new Error(
          `We found "${address}" in your account, but property details (beds, baths, sqft, etc.) aren't available yet. Try refreshing the property data, or pick a different property.`,
        );
      }

      setProperty(p);
      setDescription(body.description ?? "");
      setListingPrice(p.estimatedValue ? `$${Math.round(p.estimatedValue).toLocaleString()}` : "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  function onPhotoUpload(files: FileList | null) {
    if (!files) return;
    const remaining = 4 - photos.length;
    const toAdd = Array.from(files).slice(0, remaining);
    for (const file of toAdd) {
      const reader = new FileReader();
      reader.onload = () => setPhotos((prev) => [...prev.slice(0, 3), reader.result as string]);
      reader.readAsDataURL(file);
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function saveFlyer(setAsDefault = false) {
    if (!property) return;
    setSaving(true); setSaveMsg(null);
    try {
      const res = await fetch("/api/dashboard/flyer/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateKey,
          propertyAddress: property.address,
          flyerData: { property, description, listingPrice, agent, templateKey },
          setAsDefault,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!body.ok) throw new Error(body.error ?? "Save failed");
      setSaveMsg(setAsDefault ? tr("pages.flyer.savedDefault") : tr("pages.flyer.saved"));
      // Refresh saved list
      const listRes = await fetch("/api/dashboard/flyer/saved").then((r) => r.json()).catch(() => ({}));
      if (listRes.ok) setSavedFlyers(listRes.flyers ?? []);
      if (setAsDefault) setDefaultTemplate(templateKey);
    } catch (e) { setSaveMsg(e instanceof Error ? e.message : "Error"); }
    finally { setSaving(false); }
  }

  const template = getTemplate(templateKey);

  async function downloadPdf() {
    if (!property) return;
    setGenerating(true);
    try {
      // Get QR code as image
      const qrSvg = qrRef.current?.querySelector("svg");
      let qrDataUrl = "";
      if (qrSvg) {
        const svgData = new XMLSerializer().serializeToString(qrSvg);
        const canvas = document.createElement("canvas");
        canvas.width = 600; canvas.height = 600;
        const ctx = canvas.getContext("2d");
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => { ctx?.drawImage(img, 0, 0, 600, 600); resolve(); };
          img.onerror = reject;
          img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
        });
        qrDataUrl = canvas.toDataURL("image/png");
      }

      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
      const w = doc.internal.pageSize.getWidth();
      const h = doc.internal.pageSize.getHeight();

      // Top accent
      doc.setFillColor(...template.colors.accentRgb);
      doc.rect(0, 0, w, 6, "F");

      // OPEN HOUSE title
      doc.setFontSize(36);
      doc.setTextColor(15, 23, 42);
      doc.text("OPEN HOUSE", w / 2, 22, { align: "center" });
      doc.setDrawColor(...template.colors.accentRgb);
      doc.setLineWidth(0.6);
      doc.line(w / 2 - 25, 26, w / 2 + 25, 26);

      // Address
      doc.setFontSize(16);
      doc.text(property.address, w / 2, 36, { align: "center", maxWidth: w - 30 });
      if (property.city || property.state) {
        doc.setFontSize(11);
        doc.setTextColor(100, 116, 139);
        doc.text([property.city, property.state].filter(Boolean).join(", "), w / 2, 43, { align: "center" });
      }

      // Listing price
      if (listingPrice) {
        doc.setFontSize(22);
        doc.setTextColor(...template.colors.accentRgb);
        doc.text(listingPrice, w / 2, 55, { align: "center" });
      }

      // Property details row
      let detailY = 62;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(20, detailY - 4, w - 40, 12, 2, 2, "F");
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      const details = [
        property.beds ? `${property.beds} Beds` : null,
        property.baths ? `${property.baths} Baths` : null,
        property.sqft ? `${property.sqft.toLocaleString()} Sqft` : null,
        property.yearBuilt ? `Built ${property.yearBuilt}` : null,
        property.propertyType ? property.propertyType : null,
      ].filter(Boolean).join("  |  ");
      doc.text(details, w / 2, detailY + 3, { align: "center" });

      // Photos
      let photoY = 78;
      if (photos.length > 0) {
        const photoW = photos.length === 1 ? w - 40 : (w - 46) / 2;
        const photoH = 40;
        photos.slice(0, 4).forEach((src, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const x = 20 + col * (photoW + 6);
          const y = photoY + row * (photoH + 4);
          try { doc.addImage(src, "JPEG", x, y, photoW, photoH); } catch { /* skip bad images */ }
        });
        photoY += (Math.ceil(photos.length / 2)) * 44 + 4;
      }

      // Description
      if (description) {
        doc.setFontSize(10);
        doc.setTextColor(51, 65, 85);
        const lines = doc.splitTextToSize(description, w - 44);
        doc.text(lines, w / 2, photoY + 2, { align: "center" });
        photoY += lines.length * 4.5 + 6;
      }

      // Divider
      doc.setDrawColor(229, 231, 235);
      doc.line(25, photoY, w - 25, photoY);
      photoY += 6;

      // Agent section + QR code side by side
      const agentX = 25;
      const qrX = w - 70;

      // Agent info
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text("YOUR AGENT", agentX, photoY);
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text(agent.name || "Your Agent", agentX, photoY + 7);
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      if (agent.phone) doc.text(agent.phone, agentX, photoY + 13);
      if (agent.email) doc.text(agent.email, agentX, photoY + 18);
      if (agent.brandName) {
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(agent.brandName, agentX, photoY + 24);
      }

      // QR code
      if (qrDataUrl) {
        doc.addImage(qrDataUrl, "PNG", qrX, photoY - 2, 40, 40);
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text("Scan to register", qrX + 20, photoY + 40, { align: "center" });
      }

      // Bottom bar
      doc.setFillColor(...template.colors.accentRgb);
      doc.rect(0, h - 10, w, 10, "F");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text("Powered by CloseBoss", w / 2, h - 3, { align: "center" });

      doc.save(`open-house-${property.address.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 30)}.pdf`);
    } catch (e) {
      console.error("PDF generation failed", e);
      setError(tr("pages.flyer.pdfFailed"));
    } finally {
      setGenerating(false);
    }
  }

  // === RENDER ===

  const previewSignupUrl = useMemo(() => {
    if (!selectedOption?.id) return "";
    return `${origin}/open-house-signup?property_id=${encodeURIComponent(selectedOption.id)}&agent_id=${encodeURIComponent(agentId)}`;
  }, [origin, selectedOption?.id, agentId]);

  // Step 1: Property selection
  if (!property) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{tr("pages.flyer.heading")}</h1>
          <p className="text-sm text-slate-500">{tr("pages.flyer.intro")}</p>
        </div>
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>}

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{tr("pages.flyer.property")}</label>
              <select
                value={selectedPropertyId}
                onChange={(e) => setSelectedPropertyId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                {propertyOptions.map((p) => (
                  <option key={p.id} value={p.id}>{labelFor(p)}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500 mb-1">{tr("pages.flyer.signupLink")}</label>
                <input readOnly value={previewSignupUrl} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono bg-slate-50" />
              </div>
            </div>
          </div>

          {selectedOption && (
            <div className="flex items-center gap-4">
              <div className="bg-white p-2 rounded-lg border border-slate-200 shrink-0">
                {mounted ? <QRCode value={previewSignupUrl} size={100} /> : null}
              </div>
              <div className="text-xs text-slate-500">
                <p className="font-medium text-slate-700">{labelFor(selectedOption)}</p>
                <p className="mt-1">{tr("pages.flyer.qrHint")}</p>
              </div>
            </div>
          )}

          {/* Template picker */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">{tr("pages.flyer.chooseTemplate")}</label>
            <div className="grid grid-cols-3 gap-3">
              {FLYER_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTemplateKey(t.key)}
                  className={`rounded-lg border-2 p-3 text-left transition ${templateKey === t.key ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}
                >
                  <div className="h-2 w-full rounded-sm mb-2" style={{ backgroundColor: t.colors.accent }} />
                  <p className="text-sm font-medium text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>
                  {t.key === defaultTemplate && (
                    <span className="mt-1 inline-block rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">{tr("pages.flyer.defaultBadge")}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void fetchProperty()}
            disabled={loading || !selectedPropertyId}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? tr("pages.flyer.loadingProperty") : tr("pages.flyer.generate")}
          </button>
        </div>

        {/* Saved Flyers */}
        {savedFlyers.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">{tr("pages.flyer.savedFlyers")}</h3>
            <div className="space-y-2">
              {savedFlyers.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{f.property_address}</p>
                    <p className="text-xs text-slate-500">{f.template_key} &middot; {new Date(f.created_at).toLocaleDateString(locale)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Step 2: Preview + Edit
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{tr("pages.flyer.flyerHeading")}</h1>
          <p className="text-sm text-slate-500">{tr("pages.flyer.flyerIntro")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setProperty(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">{tr("pages.flyerBuilder.startOver")}</button>
          <button onClick={() => void saveFlyer(false)} disabled={saving} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {saving ? tr("pages.flyer.saving") : tr("pages.flyer.save")}
          </button>
          <button onClick={() => void saveFlyer(true)} disabled={saving} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50">{tr("pages.flyerBuilder.saveDefault")}</button>
          <button onClick={() => void downloadPdf()} disabled={generating} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {generating ? tr("pages.flyer.generatingPdf") : tr("pages.flyer.download")}
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>}
      {saveMsg && <div className="rounded-lg border border-green-100 bg-green-50 px-4 py-2 text-sm text-green-800">{saveMsg}</div>}

      {/* Template selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">{tr("pages.flyer.templateLabel")}</span>
        {FLYER_TEMPLATES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTemplateKey(t.key)}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition ${templateKey === t.key ? "text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
            style={templateKey === t.key ? { backgroundColor: t.colors.accent } : undefined}
          >
            {t.name}
          </button>
        ))}
      </div>

      {/* Live Preview Card */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 text-center" style={{ backgroundColor: template.colors.headerBg, color: template.colors.headerText }}>
          <h2 className="text-2xl font-bold tracking-tight">{tr("pages.flyer.openHouseBanner")}</h2>
        </div>

        <div className="p-6 space-y-5">
          {/* Address + Price */}
          <div className="text-center space-y-2">
            <input
              value={property.address}
              onChange={(e) => setProperty((p) => p ? { ...p, address: e.target.value } : p)}
              className="w-full text-center text-lg font-semibold text-slate-900 border-0 border-b border-dashed border-slate-300 focus:border-blue-500 focus:outline-none pb-1"
            />
            <div className="flex items-center justify-center gap-2">
              <label className="text-xs text-slate-500">{tr("pages.flyer.listingPrice")}</label>
              <input
                value={listingPrice}
                onChange={(e) => setListingPrice(e.target.value)}
                placeholder="$000,000"
                className="text-xl font-bold border-0 border-b border-dashed border-slate-300 focus:border-blue-500 focus:outline-none text-center w-40"
                style={{ color: template.colors.priceColor }}
              />
            </div>
          </div>

          {/* Property Details (editable) */}
          <div className="grid grid-cols-5 gap-2">
            {[
              { labelKey: "pages.flyer.stat.beds", value: String(property.beds ?? ""), key: "beds" },
              { labelKey: "pages.flyer.stat.baths", value: String(property.baths ?? ""), key: "baths" },
              { labelKey: "pages.flyer.stat.sqft", value: String(property.sqft ?? ""), key: "sqft" },
              { labelKey: "pages.flyer.stat.year", value: String(property.yearBuilt ?? ""), key: "yearBuilt" },
              { labelKey: "pages.flyer.stat.type", value: property.propertyType ?? "", key: "propertyType" },
            ].map((f) => (
              <div key={f.key} className="text-center">
                <label className="block text-[10px] text-slate-500">{tr(f.labelKey)}</label>
                <input
                  value={f.value}
                  onChange={(e) => setProperty((p) => p ? { ...p, [f.key]: e.target.value } : p)}
                  className="w-full text-center text-sm font-medium border rounded-lg border-slate-200 px-1 py-1 focus:border-blue-500 focus:outline-none"
                />
              </div>
            ))}
          </div>

          {/* Photos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500">{tr("pages.dashFragments.photosCount")}{photos.length}/4)</span>
              {photos.length < 4 && (
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >{tr("pages.flyerBuilder.uploadPhoto")}</button>
              )}
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onPhotoUpload(e.target.files); e.target.value = ""; }} />
            {photos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {photos.map((src, i) => (
                  <div key={i} className="relative rounded-lg overflow-hidden border border-slate-200">
                    <img src={src} alt={`Photo ${i + 1}`} className="h-32 w-full object-cover" />
                    <button onClick={() => removePhoto(i)} className="absolute top-1 right-1 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white hover:bg-black/70">Remove</button>
                  </div>
                ))}
              </div>
            ) : (
              <div
                onClick={() => photoInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 py-8 transition hover:border-blue-400 hover:bg-blue-50/30"
              >
                <span className="text-sm text-slate-500">Click to upload property photos</span>
                <span className="text-xs text-slate-400 mt-1">JPG, PNG — up to 4 photos</span>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="text-xs font-medium text-slate-500">{tr("pages.flyer.description")}</label>
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">{tr("pages.flyer.aiGenerated")}</span>
              <span className="text-[10px] text-slate-400">{tr("pages.flyer.editFreely")}</span>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Divider */}
          <div className="border-t border-slate-200" />

          {/* Agent Info + QR Code */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{tr("pages.flyer.yourAgent")}</span>
              <div className="flex items-center gap-3">
                {agent.avatarUrl ? (
                  <img src={agent.avatarUrl} alt={tr("pages.flyer.agentAlt")} className="h-12 w-12 rounded-full object-cover border border-slate-200" />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-slate-200 flex items-center justify-center text-lg font-bold text-slate-500">
                    {(agent.name || "A").charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <input value={agent.name} onChange={(e) => setAgent((a) => ({ ...a, name: e.target.value }))} className="text-sm font-semibold text-slate-900 border-0 border-b border-dashed border-slate-200 focus:border-blue-500 focus:outline-none" placeholder={tr("pages.flyer.yourName")} />
                  <input value={agent.phone} onChange={(e) => setAgent((a) => ({ ...a, phone: e.target.value }))} className="block text-xs text-slate-600 border-0 border-b border-dashed border-slate-200 focus:border-blue-500 focus:outline-none mt-0.5" placeholder={tr("pages.flyer.phone")} />
                  <input value={agent.email} onChange={(e) => setAgent((a) => ({ ...a, email: e.target.value }))} className="block text-xs text-slate-600 border-0 border-b border-dashed border-slate-200 focus:border-blue-500 focus:outline-none mt-0.5" placeholder={tr("pages.flyer.email")} />
                </div>
              </div>
              {agent.brandName && <p className="text-xs text-slate-400">{agent.brandName}</p>}
            </div>

            <div className="text-center shrink-0">
              <div ref={qrRef} className="bg-white p-1 rounded-lg border border-slate-200">
                {mounted && signupUrl ? <QRCode value={signupUrl} size={100} /> : null}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">{tr("pages.flyer.scanToRegister")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
