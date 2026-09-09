"use client";

import { useRef, useState, useTransition, type ChangeEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@leadsmart/i18n";
import { Sparkles, Send, Calendar, Copy, Check, Trash2, ExternalLink, Clock, ImagePlus, X } from "lucide-react";
import { generateSocialPost, generateSocialVariants, refineSocialPost, createSocialPost, updateSocialPost, deleteSocialPost, type SocialRefineMode } from "@/lib/actions/social";
import { uploadSocialImage } from "@/lib/actions/social-media";
import { canPublish, providerFor } from "@/lib/social-platforms";

type Platform = "x" | "linkedin" | "facebook" | "instagram" | "threads";
type Tone = "professional" | "casual" | "witty" | "promotional" | "educational";
type PostStatus = "draft" | "scheduled" | "published" | "failed";

interface Post {
  id: string;
  platform: Platform;
  content: string;
  status: PostStatus;
  scheduled_at: string | null;
  published_at: string | null;
  published_url: string | null;
  generated_by_ai: boolean;
  ai_prompt: string | null;
  tone: Tone;
  created_at: string;
  /** Why the last publish attempt failed, shown on the queue card. */
  last_error?: string | null;
  /** Public URL of the attached image, if any (required for Instagram). */
  media_url?: string | null;
}

interface Props {
  posts: Post[];
  orgName: string;
  /** Optional "handled by" badge rendered in the platform-tabs bar (server-supplied). */
  owner?: ReactNode;
  /** OAuth providers this org has linked, e.g. ["linkedin","meta"]. */
  connectedProviders?: string[];
}

/** Facebook and Instagram share one Meta grant, so they connect together. */
function providerLabel(platform: Platform): string {
  return providerFor(platform) === "meta" ? "Facebook" : "LinkedIn";
}

const PLATFORM_META: Record<Platform, { label: string; icon: string; limit: number; color: string }> = {
  x:         { label: "X (Twitter)", icon: "𝕏",  limit: 280,   color: "bg-black" },
  linkedin:  { label: "LinkedIn",    icon: "in", limit: 3000,  color: "bg-blue-700" },
  facebook:  { label: "Facebook",    icon: "f",  limit: 63206, color: "bg-blue-600" },
  instagram: { label: "Instagram",   icon: "IG", limit: 2200,  color: "bg-gradient-to-br from-purple-600 to-pink-500" },
  threads:   { label: "Threads",     icon: "@",  limit: 500,   color: "bg-black" },
};

// Values are the stored tone vocabulary; labels come from `social.composer.tones.<value>`.
const TONES: Tone[] = ["professional", "casual", "witty", "promotional", "educational"];

const STATUS_STYLE: Record<PostStatus, string> = {
  draft:     "bg-slate-100 text-slate-600",
  scheduled: "bg-blue-100 text-blue-700",
  published: "bg-emerald-100 text-emerald-700",
  failed:    "bg-rose-100 text-rose-700",
};

// Labels come from `social.composer.refineModes.<mode>`.
const SOCIAL_REFINE_MODES: SocialRefineMode[] = ["shorter", "punchier", "cta", "hashtags", "grammar"];

export function SocialComposer({
  posts: initialPosts,
  orgName,
  owner,
  connectedProviders = [],
}: Props) {
  const { t, i18n } = useTranslation("marketing");

  const timeLabel = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(intlLocale(i18n.language), {
          month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        })
      : null;

  /** Is this platform's OAuth provider linked for this org? */
  const isConnected = (platform: Platform): boolean => {
    const provider = providerFor(platform);
    return provider ? connectedProviders.includes(provider) : false;
  };

  const [posts, setPosts] = useState(initialPosts);
  const [activePlatform, setActivePlatform] = useState<Platform>("linkedin");
  const [tone, setTone]   = useState<Tone>("professional");
  const [topic, setTopic] = useState("");
  const [content, setContent] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [copied, setCopied]   = useState<string | null>(null);
  const [tab, setTab]         = useState<"compose" | "queue">("compose");
  const [isPending, start]    = useTransition();
  const [generating, setGenerating] = useState(false);
  const [variants, setVariants] = useState<string[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [refineLoading, setRefineLoading] = useState(false);
  const [refineMode, setRefineMode] = useState<SocialRefineMode | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const limit = PLATFORM_META[activePlatform].limit;
  const isOverLimit = content.length > limit;
  // Instagram has no text-only post; block submission until an image is attached.
  const needsImage = activePlatform === "instagram" && !mediaUrl;

  function handlePickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file after a remove
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    start(async () => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await uploadSocialImage(fd);
        if ("error" in res) setUploadError(res.error);
        else setMediaUrl(res.url);
      } finally {
        setUploading(false);
      }
    });
  }

  async function handleGenerate() {
    if (!topic.trim()) return;
    setGenerating(true);
    start(async () => {
      try {
        const generated = await generateSocialPost(activePlatform, tone, topic, orgName);
        setContent(generated);
      } finally {
        setGenerating(false);
      }
    });
  }

  async function handleGenerateVariants() {
    if (!topic.trim()) return;
    setVariantsLoading(true);
    start(async () => {
      try {
        const v = await generateSocialVariants(activePlatform, tone, topic, orgName);
        setVariants(v);
      } finally {
        setVariantsLoading(false);
      }
    });
  }

  function handleRefine(mode: SocialRefineMode) {
    if (!content.trim()) return;
    setRefineMode(mode);
    setRefineLoading(true);
    start(async () => {
      try {
        const out = await refineSocialPost(activePlatform, tone, content, mode, orgName);
        if (out) setContent(out);
      } finally {
        setRefineLoading(false);
        setRefineMode(null);
      }
    });
  }

  function handleCopy(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  function handleSave(status: "draft" | "scheduled") {
    if (!content.trim()) return;
    start(async () => {
      await createSocialPost({
        platform: activePlatform,
        content,
        tone,
        scheduledAt: status === "scheduled" && scheduleDate ? new Date(scheduleDate).toISOString() : null,
        aiPrompt: topic || null,
        generatedByAi: !!topic,
        mediaUrl,
      });
      const savedMedia = mediaUrl;
      setContent("");
      setTopic("");
      setScheduleDate("");
      setMediaUrl(null);
      setUploadError(null);
      setTab("queue");
      // Optimistically add to list
      const newPost: Post = {
        id: crypto.randomUUID(),
        platform: activePlatform,
        content,
        status,
        scheduled_at: status === "scheduled" && scheduleDate ? new Date(scheduleDate).toISOString() : null,
        published_at: null,
        published_url: null,
        generated_by_ai: !!topic,
        ai_prompt: topic || null,
        tone,
        created_at: new Date().toISOString(),
        media_url: savedMedia,
      };
      setPosts((p) => [newPost, ...p]);
    });
  }

  function handleMarkPublished(postId: string, url?: string) {
    start(async () => {
      await updateSocialPost(postId, { status: "published", publishedUrl: url ?? null });
      setPosts((p) =>
        p.map((post) =>
          post.id === postId ? { ...post, status: "published", published_url: url ?? null, published_at: new Date().toISOString() } : post
        )
      );
    });
  }

  function handleDelete(postId: string) {
    start(async () => {
      await deleteSocialPost(postId);
      setPosts((p) => p.filter((post) => post.id !== postId));
    });
  }

  const platformPosts = posts.filter((p) => p.platform === activePlatform);
  const queuedPosts   = platformPosts.filter((p) => p.status !== "published");
  const publishedPosts = platformPosts.filter((p) => p.status === "published");

  return (
    <div className="flex flex-col h-full">
      {/* Platform tabs. flex-wrap so the owner slot (connect buttons) drops to a
          second row instead of overflowing off the right edge — otherwise the
          "Connect Facebook/LinkedIn/Threads" buttons get clipped and users think
          connecting is disabled. */}
      <div className="flex flex-wrap items-center gap-y-2 border-b border-slate-200 bg-white px-6">
        {(Object.keys(PLATFORM_META) as Platform[]).map((p) => {
          const meta = PLATFORM_META[p];
          const count = posts.filter((post) => post.platform === p && post.status !== "published").length;
          return (
            <button
              key={p}
              onClick={() => setActivePlatform(p)}
              title={canPublish(p) ? undefined : t("social.composer.manualOnlyTitle")}
              className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                activePlatform === p
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <span className={`w-5 h-5 rounded text-white text-[10px] font-bold flex items-center justify-center ${meta.color}`}>
                {meta.icon}
              </span>
              {meta.label}
              {/* Three states, and the difference matters: we can publish here
                  (nothing shown) · we could, once you connect · we never can.
                  Collapsing the middle one into "manual" would hide a feature
                  that's one click away. */}
              {!canPublish(p) ? (
                <span className="text-[10px] font-normal text-slate-400">{t("social.composer.manual")}</span>
              ) : !isConnected(p) ? (
                <span className="text-[10px] font-normal text-amber-600">{t("social.composer.connect")}</span>
              ) : null}
              {count > 0 && (
                <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">{count}</span>
              )}
            </button>
          );
        })}
        {owner ? <div className="ml-auto shrink-0 pl-4">{owner}</div> : null}
      </div>

      {/* Say it plainly BEFORE anyone writes a post they can't send. */}
      {!canPublish(activePlatform) ? (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-xs text-amber-900">
          <strong className="font-semibold">
            {t("social.composer.noPublisherTitle", { platform: PLATFORM_META[activePlatform].label })}
          </strong>{" "}
          {t("social.composer.noPublisherBody", { platform: PLATFORM_META[activePlatform].label })}
        </div>
      ) : !isConnected(activePlatform) ? (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-xs text-amber-900">
          <strong className="font-semibold">
            {t("social.composer.connectTitle", { provider: providerLabel(activePlatform) })}
          </strong>{" "}
          {t("social.composer.connectBody", { platform: PLATFORM_META[activePlatform].label })}
          {activePlatform === "instagram" && <> {t("social.composer.connectInstagram")}</>}
        </div>
      ) : activePlatform === "instagram" ? (
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-2 text-xs text-slate-600">
          {t("social.composer.instagramNote")}
        </div>
      ) : null}

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Compose */}
        <div className="w-[480px] flex-shrink-0 border-r border-slate-200 flex flex-col bg-white">
          <div className="flex border-b border-slate-100">
            {(["compose", "queue"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  tab === key ? "text-indigo-600 border-b-2 border-indigo-600" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {key === "compose"
                  ? t("social.composer.tabCompose")
                  : t("social.composer.tabQueue", { count: queuedPosts.length })}
              </button>
            ))}
          </div>

          {tab === "compose" ? (
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* AI generator */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  <Sparkles className="w-3.5 h-3.5 inline mr-1 text-indigo-500" />
                  {t("social.composer.generateLabel")}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                    placeholder={t("social.composer.topicPlaceholder")}
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={handleGenerate}
                    disabled={isPending || generating || !topic.trim()}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {generating ? t("common:status.writing") : t("social.composer.generate")}
                  </button>
                </div>
                <button
                  onClick={handleGenerateVariants}
                  disabled={isPending || variantsLoading || !topic.trim()}
                  className="mt-1.5 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50 flex items-center gap-1 transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  {variantsLoading ? t("social.composer.variantsLoading") : t("social.composer.variants")}
                </button>
                {variants.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-[11px] text-slate-400">{t("social.composer.pickVariant")}</p>
                    {variants.map((v, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => { setContent(v); setVariants([]); }}
                        className="w-full text-left text-sm text-slate-700 border border-slate-200 rounded-lg px-3 py-2 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors line-clamp-3"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Tone */}
              <div className="flex gap-1.5 flex-wrap">
                {TONES.map((value) => (
                  <button
                    key={value}
                    onClick={() => setTone(value)}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                      tone === value
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {t(`social.composer.tones.${value}`)}
                  </button>
                ))}
              </div>

              {/* Content editor */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">{t("social.composer.contentLabel")}</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
                  placeholder={t("social.composer.contentPlaceholder", { platform: PLATFORM_META[activePlatform].label })}
                  className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none ${
                    isOverLimit ? "border-rose-300 focus:ring-rose-500" : "border-slate-200"
                  }`}
                />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-slate-400">
                    {t("social.composer.limitLabel", { platform: PLATFORM_META[activePlatform].label })}
                  </p>
                  <p className={`text-xs tabular-nums ${isOverLimit ? "text-rose-600 font-semibold" : "text-slate-400"}`}>
                    {content.length.toLocaleString(intlLocale(i18n.language))} / {limit.toLocaleString(intlLocale(i18n.language))}
                  </p>
                </div>
                {content.trim() && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-2">
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />{t("social.composer.refine")}
                    </span>
                    {SOCIAL_REFINE_MODES.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleRefine(mode)}
                        disabled={isPending || refineLoading}
                        className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        {refineLoading && refineMode === mode ? "…" : t(`social.composer.refineModes.${mode}`)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Image */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  <ImagePlus className="w-3.5 h-3.5 inline mr-1" />
                  {t("social.composer.imageLabel")}{" "}
                  {activePlatform === "instagram"
                    ? <span className="text-rose-500">{t("social.composer.imageRequired")}</span>
                    : t("social.composer.imageOptional")}
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg"
                  onChange={handlePickImage}
                  className="hidden"
                />
                {mediaUrl ? (
                  <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaUrl} alt={t("social.composer.attachedAlt")} className="max-h-40 rounded-lg border border-slate-200" />
                    <button
                      type="button"
                      onClick={() => setMediaUrl(null)}
                      className="absolute -top-2 -right-2 bg-white border border-slate-200 rounded-full p-1 text-slate-500 hover:text-rose-600 shadow-sm"
                      aria-label={t("social.composer.removeImage")}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || isPending}
                    className="w-full py-2.5 border border-dashed border-slate-300 text-slate-500 text-sm rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <ImagePlus className="w-4 h-4" />
                    {uploading ? t("common:status.uploading") : t("social.composer.addImage")}
                  </button>
                )}
                {uploadError && <p className="text-xs text-rose-600 mt-1" role="alert">{uploadError}</p>}
              </div>

              {/* Schedule */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  <Clock className="w-3.5 h-3.5 inline mr-1" />
                  {t("social.composer.scheduleLabel")}
                </label>
                <input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => handleSave("draft")}
                  disabled={isPending || uploading || !content.trim() || isOverLimit || needsImage}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  {t("social.composer.saveDraft")}
                </button>
                <button
                  onClick={() => handleSave(scheduleDate ? "scheduled" : "draft")}
                  disabled={isPending || uploading || !content.trim() || isOverLimit || needsImage}
                  title={needsImage ? t("social.composer.needsImage") : undefined}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {scheduleDate
                    ? <><Calendar className="w-3.5 h-3.5" /> {t("social.composer.schedule")}</>
                    : <><Send className="w-3.5 h-3.5" /> {t("social.composer.addToQueue")}</>}
                </button>
              </div>
            </div>
          ) : (
            /* Queue tab */
            <div className="flex-1 overflow-y-auto">
              {queuedPosts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                  <Send className="w-8 h-8 text-slate-300 mb-2" />
                  <p className="text-xs text-slate-400">{t("social.composer.queueEmpty")}</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {queuedPosts.map((post) => (
                    <div key={post.id} className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[post.status]}`}>
                          {t(`social.composer.postStatus.${post.status}`)}
                        </span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleCopy(post.id, post.content)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors">
                            {copied === post.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => handleDelete(post.id)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-slate-700 line-clamp-4">{post.content}</p>
                      {/* Why it failed. A red "Failed" chip with no reason is
                          barely better than the silent stall it replaced. */}
                      {post.status === "failed" && post.last_error && (
                        <p className="text-xs text-rose-700 bg-rose-50 rounded px-2 py-1.5">
                          {post.last_error}
                        </p>
                      )}
                      {post.scheduled_at && post.status !== "failed" && (
                        <p className="text-xs text-blue-600 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {timeLabel(post.scheduled_at)}
                        </p>
                      )}
                      <button
                        onClick={() => handleMarkPublished(post.id)}
                        className="w-full py-1.5 text-xs font-medium border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors"
                      >
                        {t("social.composer.markPublished")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Preview + published */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-6 space-y-4">
          {/* Live preview */}
          {content ? (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("social.composer.preview")}</p>
                <span className={`w-5 h-5 rounded text-white text-[10px] font-bold flex items-center justify-center ${PLATFORM_META[activePlatform].color}`}>
                  {PLATFORM_META[activePlatform].icon}
                </span>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold">
                  {orgName[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{orgName}</p>
                  <p className="text-xs text-slate-400">{t("social.composer.justNow")}</p>
                </div>
              </div>
              <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{content}</p>
              {mediaUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={mediaUrl} alt={t("social.composer.attachedAlt")} className="mt-3 w-full rounded-lg border border-slate-100" />
              )}
              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100">
                {["💬", "🔁", "❤️", "📊"].map((em) => (
                  <span key={em} className="text-xs text-slate-400 cursor-default">{em} —</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-dashed border-slate-200 p-10 text-center">
              <p className="text-sm text-slate-400">{t("social.composer.previewEmpty")}</p>
            </div>
          )}

          {/* Published posts */}
          {publishedPosts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{t("social.composer.published")}</p>
              <div className="space-y-2">
                {publishedPosts.map((post) => (
                  <div key={post.id} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 line-clamp-2">{post.content}</p>
                        <p className="text-xs text-slate-400 mt-1">{timeLabel(post.published_at)}</p>
                      </div>
                      {post.published_url && (
                        <a href={post.published_url} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 text-slate-400 hover:text-indigo-600 flex-shrink-0">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
