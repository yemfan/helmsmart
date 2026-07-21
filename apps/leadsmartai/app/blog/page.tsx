import type { Metadata } from "next";
import Link from "next/link";
import { BLOG_POSTS, categoryLabel, sortedPosts, type BlogPost } from "@/lib/blog/posts";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Real estate technology, lead conversion playbooks, and investing fundamentals from the CloseBoss team — written for solo agents and small teams who win on speed.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "CloseBoss Blog",
    description:
      "Real estate technology, lead conversion playbooks, and investing fundamentals — written for solo agents and small teams.",
    url: "/blog",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CloseBoss Blog",
    description:
      "Real estate technology, lead conversion playbooks, and investing fundamentals.",
  },
};

const SITE_URL = "https://closebossai.com";

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function BlogIndexPage() {
  const posts = sortedPosts();
  const featured = posts.find((p) => p.featured) ?? posts[0];
  const rest = posts.filter((p) => p.slug !== featured?.slug);

  const blogJsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "CloseBoss Blog",
    url: `${SITE_URL}/blog`,
    description:
      "Real estate technology, lead conversion playbooks, and investing fundamentals.",
    blogPost: BLOG_POSTS.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      description: p.description,
      url: `${SITE_URL}${p.href}`,
      datePublished: p.publishedAt,
      author: { "@type": "Person", name: p.author },
    })),
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogJsonLd) }}
      />

      <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
            CloseBoss Blog
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-5xl dark:text-white">
            Win on speed. Sell on substance.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 md:text-lg dark:text-slate-300">
            Field-tested takes on real estate technology, AI follow-up,
            and the metrics that actually move deals — written for solo
            agents and small teams.
          </p>
        </header>

        {featured ? <FeaturedCard post={featured} /> : null}

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 md:text-2xl dark:text-white">
            Latest posts
          </h2>
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((post) => (
              <li key={post.slug}>
                <PostCard post={post} />
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-16 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-800 dark:bg-slate-900/40 md:p-8">
          <h2 className="text-lg font-semibold text-slate-900 md:text-xl dark:text-white">
            Want every new post in your inbox?
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            We send a short note when a new piece goes live — usually
            once or twice a month, no filler. Or skip ahead and try
            CloseBoss free for 14 days.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/start-free"
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Start free trial
            </Link>
            <Link
              href="/agent/compare"
              className="inline-flex items-center justify-center rounded-md border border-blue-200 bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-900/50 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-900/70"
            >
              Compare with your CRM
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function FeaturedCard({ post }: { post: BlogPost }) {
  return (
    <section className="mt-10">
      <Link
        href={post.href}
        className="group block overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg dark:border-slate-800 dark:from-slate-900 dark:via-slate-950 dark:to-slate-950 dark:hover:border-blue-900/60"
      >
        <div className="grid gap-8 p-6 md:grid-cols-[1.2fr_1fr] md:gap-12 md:p-10">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
              <span className="inline-flex items-center rounded-full bg-blue-600 px-2.5 py-1 text-white">
                Featured
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                {categoryLabel(post.category)}
              </span>
              <span aria-hidden className="text-slate-300 dark:text-slate-700">
                •
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                {post.readTime} read
              </span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 group-hover:text-blue-700 md:text-3xl dark:text-white dark:group-hover:text-blue-300">
              {post.title}
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-600 dark:text-slate-300">
              {post.description}
            </p>
            <p className="mt-5 text-xs text-slate-500 dark:text-slate-400">
              {formatDate(post.publishedAt)} · {post.author}
            </p>
            <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 dark:text-blue-300">
              Read the post
              <svg
                aria-hidden
                className="h-4 w-4 transition group-hover:translate-x-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </span>
          </div>
          <div className="relative hidden overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 md:block dark:border-slate-800 dark:bg-slate-900">
            <div className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-300">
                Quick take
              </p>
              <p className="text-base font-semibold leading-snug text-slate-800 dark:text-slate-200">
                &ldquo;47% of leads go with the first agent who responds.
                Not the best agent. The fastest one.&rdquo;
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                — From the post
              </p>
            </div>
          </div>
        </div>
      </Link>
    </section>
  );
}

function PostCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={post.href}
      className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-900/60"
    >
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <span>{categoryLabel(post.category)}</span>
        <span aria-hidden>•</span>
        <span>{post.readTime}</span>
      </div>
      <h3 className="mt-2 text-base font-semibold text-slate-900 group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300">
        {post.title}
      </h3>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
        {post.description}
      </p>
      <p className="mt-auto pt-4 text-xs text-slate-500 dark:text-slate-400">
        {formatDate(post.publishedAt)}
      </p>
    </Link>
  );
}
