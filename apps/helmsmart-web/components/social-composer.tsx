"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Sparkles, Send, Calendar, Copy, Check, Trash2, ExternalLink, Clock } from "lucide-react";
import { generateSocialPost, generateSocialVariants, refineSocialPost, createSocialPost, updateSocialPost, deleteSocialPost, type SocialRefineMode } from "@/lib/actions/social";
import { canPublish } from "@/lib/social-platforms";

type Platform = "x" | "linkedin" | "facebook" | "instagram";
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
}

interface Props {
  posts: Post[];
  orgName: string;
  /** Optional "handled by" badge rendered in the platform-tabs bar (server-supplied). */
  owner?: ReactNode;
}

const PLATFORM_META: Record<Platform, { label: string; icon: string; limit: number; color: string }> = {
  x:         { label: "X (Twitter)", icon: "𝕏",  limit: 280,   color: "bg-black" },
  linkedin:  { label: "LinkedIn",    icon: "in", limit: 3000,  color: "bg-blue-700" },
  facebook:  { label: "Facebook",    icon: "f",  limit: 63206, color: "bg-blue-600" },
  instagram: { label: "Instagram",   icon: "IG", limit: 2200,  color: "bg-gradient-to-br from-purple-600 to-pink-500" },
};

const TONES: { value: Tone; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "casual",       label: "Casual" },
  { value: "witty",        label: "Witty" },
  { value: "promotional",  label: "Promotional" },
  { value: "educational",  label: "Educational" },
];

const STATUS_STYLE: Record<PostStatus, string> = {
  draft:     "bg-slate-100 text-slate-600",
  scheduled: "bg-blue-100 text-blue-700",
  published: "bg-emerald-100 text-emerald-700",
  failed:    "bg-rose-100 text-rose-700",
};

const SOCIAL_REFINE_MODES: { mode: SocialRefineMode; label: string }[] = [
  { mode: "shorter",  label: "Shorter" },
  { mode: "punchier", label: "Punchier" },
  { mode: "cta",      label: "Add CTA" },
  { mode: "hashtags", label: "Hashtags" },
  { mode: "grammar",  label: "Grammar" },
];

function timeLabel(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function SocialComposer({ posts: initialPosts, orgName, owner }: Props) {
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

  const limit = PLATFORM_META[activePlatform].limit;
  const isOverLimit = content.length > limit;

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
      });
      setContent("");
      setTopic("");
      setScheduleDate("");
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
      {/* Platform tabs */}
      <div className="flex items-center border-b border-slate-200 bg-white px-6">
        {(Object.keys(PLATFORM_META) as Platform[]).map((p) => {
          const meta = PLATFORM_META[p];
          const count = posts.filter((post) => post.platform === p && post.status !== "published").length;
          return (
            <button
              key={p}
              onClick={() => setActivePlatform(p)}
              title={canPublish(p) ? undefined : "Manual posting only — auto-publishing isn't connected"}
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
              {/* Mark the platforms we can't auto-publish to, right on the tab.
                  This used to be invisible until a scheduled post silently
                  never went out. */}
              {!canPublish(p) && (
                <span className="text-[10px] font-normal text-slate-400">manual</span>
              )}
              {count > 0 && (
                <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">{count}</span>
              )}
            </button>
          );
        })}
        {owner ? <div className="ml-auto shrink-0 pl-4">{owner}</div> : null}
      </div>

      {/* Say it plainly before anyone writes a post they can't send. Scheduling
          is still allowed — the content is useful to write and copy — but the
          promise being made is explicit. */}
      {!canPublish(activePlatform) && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-xs text-amber-900">
          <strong className="font-semibold">{PLATFORM_META[activePlatform].label} posts won&apos;t send
          automatically.</strong>{" "}
          Auto-publishing is only connected for LinkedIn today. You can still
          write, generate and save drafts here — then copy the text and post it
          yourself. Anything scheduled here will be marked failed rather than
          published.
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Compose */}
        <div className="w-[480px] flex-shrink-0 border-r border-slate-200 flex flex-col bg-white">
          <div className="flex border-b border-slate-100">
            {(["compose", "queue"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  tab === t ? "text-indigo-600 border-b-2 border-indigo-600" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {t === "compose" ? "Compose" : `Queue (${queuedPosts.length})`}
              </button>
            ))}
          </div>

          {tab === "compose" ? (
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* AI generator */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  <Sparkles className="w-3.5 h-3.5 inline mr-1 text-indigo-500" />
                  Generate with AI
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                    placeholder="What's the post about?"
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={handleGenerate}
                    disabled={isPending || generating || !topic.trim()}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {generating ? "Writing…" : "Generate"}
                  </button>
                </div>
                <button
                  onClick={handleGenerateVariants}
                  disabled={isPending || variantsLoading || !topic.trim()}
                  className="mt-1.5 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50 flex items-center gap-1 transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  {variantsLoading ? "Generating options…" : "Generate 3 options"}
                </button>
                {variants.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-[11px] text-slate-400">Pick a variant:</p>
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
                {TONES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTone(t.value)}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                      tone === t.value
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Content editor */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Post content</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
                  placeholder={`Write your ${PLATFORM_META[activePlatform].label} post…`}
                  className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none ${
                    isOverLimit ? "border-rose-300 focus:ring-rose-500" : "border-slate-200"
                  }`}
                />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-slate-400">
                    {PLATFORM_META[activePlatform].label} limit
                  </p>
                  <p className={`text-xs tabular-nums ${isOverLimit ? "text-rose-600 font-semibold" : "text-slate-400"}`}>
                    {content.length.toLocaleString()} / {limit.toLocaleString()}
                  </p>
                </div>
                {content.trim() && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-2">
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />Refine
                    </span>
                    {SOCIAL_REFINE_MODES.map((m) => (
                      <button
                        key={m.mode}
                        type="button"
                        onClick={() => handleRefine(m.mode)}
                        disabled={isPending || refineLoading}
                        className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        {refineLoading && refineMode === m.mode ? "…" : m.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Schedule */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  <Clock className="w-3.5 h-3.5 inline mr-1" />
                  Schedule (optional)
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
                  disabled={isPending || !content.trim() || isOverLimit}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  Save draft
                </button>
                <button
                  onClick={() => handleSave(scheduleDate ? "scheduled" : "draft")}
                  disabled={isPending || !content.trim() || isOverLimit}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {scheduleDate ? <><Calendar className="w-3.5 h-3.5" /> Schedule</> : <><Send className="w-3.5 h-3.5" /> Add to queue</>}
                </button>
              </div>
            </div>
          ) : (
            /* Queue tab */
            <div className="flex-1 overflow-y-auto">
              {queuedPosts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                  <Send className="w-8 h-8 text-slate-300 mb-2" />
                  <p className="text-xs text-slate-400">No posts in queue</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {queuedPosts.map((post) => (
                    <div key={post.id} className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[post.status]}`}>
                          {post.status.charAt(0).toUpperCase() + post.status.slice(1)}
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
                        Mark as published
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
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Preview</p>
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
                  <p className="text-xs text-slate-400">Just now</p>
                </div>
              </div>
              <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{content}</p>
              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100">
                {["💬", "🔁", "❤️", "📊"].map((em) => (
                  <span key={em} className="text-xs text-slate-400 cursor-default">{em} —</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-dashed border-slate-200 p-10 text-center">
              <p className="text-sm text-slate-400">Your post preview will appear here</p>
            </div>
          )}

          {/* Published posts */}
          {publishedPosts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Published</p>
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
