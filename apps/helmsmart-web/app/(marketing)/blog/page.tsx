import type { Metadata } from "next";
import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("site");
  return {
    title: t("blog.meta.title"),
    description: t("blog.meta.description"),
  };
}

type Color = "indigo" | "emerald" | "amber" | "violet";

interface BlogPost {
  /** Also the slug: title, excerpt, category, date and read time live in
   *  `site.blog.posts.<slug>` and are shared with the article page. */
  slug: string;
  color: Color;
}

// The pain and its solution live in `site.blog.pains.items.<key>`; the emoji
// is artwork, not copy.
const pains = [
  { key: "missedCalls", icon: "📞" },
  { key: "answeringService", icon: "💸" },
  { key: "admin", icon: "⏰" },
  { key: "invoices", icon: "📄" },
  { key: "scheduling", icon: "📅" },
  { key: "leads", icon: "🎯" },
];

const posts: BlogPost[] = [
  { slug: "smb-pains-and-solutions", color: "indigo" },
  { slug: "ai-receptionist-guide", color: "indigo" },
  { slug: "cost-of-admin-work", color: "emerald" },
  { slug: "get-paid-faster", color: "amber" },
  { slug: "ai-receptionist-setup", color: "violet" },
];

const colorMap: Record<
  Color,
  { badge: string; bar: string; categoryText: string }
> = {
  indigo: {
    badge: "bg-indigo-50 text-indigo-700",
    bar: "bg-indigo-500",
    categoryText: "text-indigo-600",
  },
  emerald: {
    badge: "bg-emerald-50 text-emerald-700",
    bar: "bg-emerald-500",
    categoryText: "text-emerald-600",
  },
  amber: {
    badge: "bg-amber-50 text-amber-700",
    bar: "bg-amber-500",
    categoryText: "text-amber-600",
  },
  violet: {
    badge: "bg-violet-50 text-violet-700",
    bar: "bg-violet-500",
    categoryText: "text-violet-600",
  },
};

function BlogCard({
  post,
  t,
}: {
  post: BlogPost;
  t: (key: string) => string;
}) {
  const colors = colorMap[post.color];

  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex flex-col rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
    >
      {/* color accent bar */}
      <div className={`h-1.5 w-full ${colors.bar}`} />

      <div className="flex flex-col flex-1 p-6 gap-4">
        {/* category + meta */}
        <div className="flex items-center justify-between">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors.badge}`}
          >
            {t(`blog.posts.${post.slug}.category`)}
          </span>
          <span className="text-xs text-gray-400">
            {t(`blog.posts.${post.slug}.readTime`)}
          </span>
        </div>

        {/* title */}
        <h2 className="text-gray-900 font-semibold text-lg leading-snug group-hover:text-gray-700 transition-colors">
          {t(`blog.posts.${post.slug}.title`)}
        </h2>

        {/* excerpt */}
        <p className="text-gray-500 text-sm leading-relaxed flex-1">
          {t(`blog.posts.${post.slug}.excerpt`)}
        </p>

        {/* footer */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-50">
          <span className="text-xs text-gray-400">
            {t(`blog.posts.${post.slug}.date`)}
          </span>
          <span className={`text-sm font-medium ${colors.categoryText}`}>
            {t("blog.readMore")}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default async function BlogPage() {
  const t = await getServerT("site");

  return (
    <div className="bg-white">
      {/* hero */}
      <section className="mx-auto max-w-4xl px-4 pt-20 pb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          {t("blog.hero.title")}
        </h1>
        <p className="mt-4 text-lg text-gray-500">
          {t("blog.hero.subtitle")}
        </p>
      </section>

      {/* Pains & Solutions */}
      <section className="bg-slate-50 border-y border-slate-100 py-16">
        <div className="mx-auto max-w-5xl px-4">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              {t("blog.pains.title")}
            </h2>
            <p className="mt-3 text-gray-500 text-base max-w-xl mx-auto">
              {t("blog.pains.subtitle")}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {pains.map((item) => (
              <div key={item.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <span className="text-3xl mb-4 block">{item.icon}</span>
                <h3 className="font-semibold text-gray-900 mb-2">
                  {t(`blog.pains.items.${item.key}.pain`)}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {t(`blog.pains.items.${item.key}.solution`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* post grid */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {posts.map((post) => (
            <BlogCard key={post.slug} post={post} t={t} />
          ))}
        </div>
      </section>

      {/* subscribe CTA */}
      <section className="border-t border-gray-100 bg-gray-50 py-16">
        <div className="mx-auto max-w-xl px-4 text-center">
          <p className="text-gray-600 text-base mb-6">
            {t("blog.subscribe.body")}
          </p>
          <form className="flex flex-col sm:flex-row items-center gap-3 justify-center">
            <label htmlFor="blog-email" className="sr-only">
              {t("blog.subscribe.emailLabel")}
            </label>
            <input
              id="blog-email"
              type="email"
              placeholder={t("blog.subscribe.placeholder")}
              className="w-full sm:w-64 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <button
              type="submit"
              className="w-full sm:w-auto rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-colors"
            >
              {t("blog.subscribe.button")}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
