/**
 * @helm/ui — PackManifest
 *
 * The industry-agnostic shape a vertical "pack" supplies to configure the shell.
 * Core defines the *contract*; each pack (e.g. `@helm/pack-medical`) ships an
 * *instance*; the host app composes the registry and resolves the active one.
 * (Build once, configure many — Core never enumerates verticals: `id` is a string.)
 */
export interface PackManifest {
  /** Stable pack id, e.g. "helm", "medical". */
  id: string;
  /** Product name shown in the wordmark, e.g. "HelmSmart", "DoctorSmart AI". */
  productName: string;
  /** Letter shown in the logo mark, e.g. "H", "D". */
  logoLetter: string;
  /** CSS theme key — set as `data-pack` on the root; matches a `[data-pack]` token block. */
  dataPack: string;
  /** Auth model for the vertical. Regulated verticals isolate (own auth + data island). */
  auth: "isolated" | "shared";
  /** Label overrides applied to nav section titles + item labels (e.g. `{ Clients: "Patients" }`). */
  terms?: Record<string, string>;
  /** Short marketing tagline shown under the wordmark (e.g. on auth pages). */
  tagline?: string;
  /**
   * Key in the host app's `site` namespace holding the translated tagline, e.g.
   * "footer.tagline". Preferred over `tagline` where set; `tagline` stays as the
   * untranslated fallback, so a pack whose copy has no bundle yet (medical) keeps
   * rendering its own English rather than inheriting another pack's.
   *
   * A manifest is plain config with no request behind it, so it cannot resolve a
   * locale itself — it names the key and the rendering Server Component looks it up.
   */
  taglineKey?: string;
  /**
   * Vertical-specific fill-in template for the AI voice agent's "Business context" field
   * (e.g. a clinic's services, the doctor's bio, insurance, reviews). Shown as the
   * placeholder and offered as a one-click starting point; falls back to a generic
   * small-business example when a pack doesn't supply one.
   */
  voiceContextExample?: string;
  /** Example business name for the onboarding form's placeholder (e.g. a clinic name on medical). */
  businessNameExample?: string;
}
