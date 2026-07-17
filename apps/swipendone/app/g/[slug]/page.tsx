import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedGuide } from "@/lib/guides";
import { BuyerGuide } from "@/components/buyer-guide";

// Always serve the latest published content so post-publish edits go live at the
// same slug (handoff acceptance criteria §8.4). Root layout reads no cookies/headers,
// so force-dynamic here is safe.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await getPublishedGuide(slug);
  if (!bundle) return { title: "Guide not found · SwipenDone" };
  const name = bundle.product.name_en;
  const brand = bundle.brand_name ? `${bundle.brand_name} · ` : "";
  return {
    title: `${brand}${name} — Instructions`,
    description: `Step-by-step assembly instructions for ${name}. Made with SwipenDone.`,
    robots: { index: true, follow: true },
  };
}

export default async function GuidePage({ params }: Params) {
  const { slug } = await params;
  const bundle = await getPublishedGuide(slug);
  if (!bundle) notFound();

  const { product, brand_name, steps, guide } = bundle;

  return (
    <>
      <BuyerGuide bundle={bundle} />

      {/* JS-disabled / SEO fallback: a plain, readable instruction list. */}
      <noscript>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 18px", fontFamily: "var(--font-body)" }}>
          {brand_name && <p style={{ letterSpacing: "0.08em", fontWeight: 700 }}>{brand_name}</p>}
          <h1 style={{ fontFamily: "var(--font-display)" }}>
            {product.name_en}
            {product.model_no ? ` · ${product.model_no}` : ""}
          </h1>
          {guide.meta_en?.tools && <p>Tools: {guide.meta_en.tools}</p>}

          {guide.parts && guide.parts.length > 0 && (
            <>
              <h2>Parts</h2>
              <ul>
                {guide.parts.map((p) => (
                  <li key={p.code}>
                    {p.code} — {p.name_en} ×{p.qty}
                  </li>
                ))}
              </ul>
            </>
          )}

          <h2>Steps</h2>
          <ol>
            {steps.map((s) => (
              <li key={s.position} style={{ marginBottom: 12 }}>
                <strong>{s.title_en}</strong>
                {s.body_en ? <p style={{ margin: "4px 0" }}>{s.body_en}</p> : null}
                {s.tip_en ? <p style={{ margin: "4px 0", color: "#5A6B62" }}>Tip: {s.tip_en}</p> : null}
              </li>
            ))}
          </ol>
          <p>Made with SwipenDone.</p>
        </div>
      </noscript>
    </>
  );
}
