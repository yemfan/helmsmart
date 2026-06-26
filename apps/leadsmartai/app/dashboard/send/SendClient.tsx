"use client";

import { useMemo, useState } from "react";
import AddressAutocomplete from "@/components/AddressAutocomplete";

export function SendClient({ agent }: { agent: string }) {
  const [clientName, setClientName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [addressLat, setAddressLat] = useState<number | null>(null);
  const [addressLng, setAddressLng] = useState<number | null>(null);
  const [includeEmailSource, setIncludeEmailSource] = useState(true);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const baseOrigin = useMemo(() => {
    if (typeof window === "undefined") return "https://realtybossai.com";
    return window.location.origin;
  }, []);

  function handleGenerate() {
    setError(null);
    setCopied(false);
    if (!propertyAddress.trim()) {
      setError("Please enter a property address.");
      return;
    }

    setLoading(true);

    const params = new URLSearchParams();
    // For now, use static agent name per spec.
    params.set("agent", "michael");
    params.set("address", propertyAddress.trim());
    if (includeEmailSource) params.set("source", "email");
    if (clientName.trim()) params.set("name", clientName.trim());

    const url = `${baseOrigin}/?${params.toString()}`;
    setGeneratedLink(url);
    setLoading(false);
  }

  async function handleCopy() {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
    } catch (e) {
      console.error(e);
      setError("Could not copy link to clipboard. Please copy it manually.");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-text">Send Smart Link</h1>
        <p className="text-sm text-brand-text/80">
          Generate a personalized home value link you can paste into emails, texts, or social posts.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-brand-text">
              Client name (optional)
            </label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Sarah Homeowner"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-brand-text">
              Property address
            </label>
            <AddressAutocomplete
              value={propertyAddress}
              onChange={setPropertyAddress}
              onSelect={(v) => {
                setPropertyAddress(v.formattedAddress);
                setAddressLat(v.lat);
                setAddressLng(v.lng);
              }}
              placeholder="123 Main St, City, State"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
              disabled={loading}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2 text-xs text-brand-text">
            <input
              type="checkbox"
              checked={includeEmailSource}
              onChange={(e) => setIncludeEmailSource(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-brand-primary focus:ring-brand-primary"
            />
            <span>Tag this link with source=email</span>
          </label>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!propertyAddress.trim() || loading}
            className="inline-flex items-center justify-center bg-brand-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#005ca8]"
          >
            {loading ? "Generating..." : "Generate Link"}
          </button>
        </div>

        {error && (
          <p className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {generatedLink && (
          <div className="space-y-2 mt-2">
            <label className="block text-xs font-semibold text-brand-text">
              Generated link
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                readOnly
                value={generatedLink}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono bg-brand-surface text-brand-text"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center justify-center bg-brand-text text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-black"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
              <button
                type="button"
                onClick={() => generatedLink && window.open(generatedLink, "_blank")}
                className="inline-flex items-center justify-center bg-white text-brand-text border border-gray-300 text-xs font-semibold px-4 py-2 rounded-lg hover:bg-brand-surface"
              >
                Open Link
              </button>
            </div>
            {copied && (
              <p className="text-[11px] text-brand-success">
                Link copied to clipboard. Paste it into your email or message to the client.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

