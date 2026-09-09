import type { Metadata } from "next";
import Link from "next/link";
import {
  Phone,
  PhoneOutgoing,
  Inbox,
  Receipt,
  CalendarDays,
  Users,
  Sunrise,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("site");
  return {
    title: t("features.meta.title"),
    description: t("features.meta.description"),
  };
}

interface Feature {
  id: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  placeholderColor: string;
  /** Bullet key suffixes under `site.features.items.<id>.bullets`. */
  bullets: string[];
}

// Headline, subheadline and every bullet live in `site.features.items.<id>`;
// this array holds the id, the artwork and how many bullets to render.
const features: Feature[] = [
  {
    id: "ai-receptionist",
    icon: <Phone className="h-6 w-6" />,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    placeholderColor: "bg-indigo-200",
    bullets: ["b1", "b2", "b3", "b4", "b5", "b6"],
  },
  {
    id: "outbound-calling",
    icon: <PhoneOutgoing className="h-6 w-6" />,
    color: "text-teal-600",
    bgColor: "bg-teal-50",
    placeholderColor: "bg-teal-200",
    bullets: ["b1", "b2", "b3", "b4", "b5"],
  },
  {
    id: "ai-assistant",
    icon: <Sparkles className="h-6 w-6" />,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    placeholderColor: "bg-blue-200",
    bullets: ["b1", "b2", "b3", "b4", "b5"],
  },
  {
    id: "smart-inbox",
    icon: <Inbox className="h-6 w-6" />,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    placeholderColor: "bg-emerald-200",
    bullets: ["b1", "b2", "b3", "b4", "b5"],
  },
  {
    id: "invoicing",
    icon: <Receipt className="h-6 w-6" />,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    placeholderColor: "bg-amber-200",
    bullets: ["b1", "b2", "b3", "b4"],
  },
  {
    id: "calendar",
    icon: <CalendarDays className="h-6 w-6" />,
    color: "text-violet-600",
    bgColor: "bg-violet-50",
    placeholderColor: "bg-violet-200",
    bullets: ["b1", "b2", "b3", "b4"],
  },
  {
    id: "crm",
    icon: <Users className="h-6 w-6" />,
    color: "text-rose-600",
    bgColor: "bg-rose-50",
    placeholderColor: "bg-rose-200",
    bullets: ["b1", "b2", "b3", "b4"],
  },
  {
    id: "daily-briefing",
    icon: <Sunrise className="h-6 w-6" />,
    color: "text-sky-600",
    bgColor: "bg-sky-50",
    placeholderColor: "bg-sky-200",
    bullets: ["b1", "b2", "b3", "b4"],
  },
];

export default async function FeaturesPage() {
  const t = await getServerT("site");

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="px-6 py-20 text-center max-w-3xl mx-auto">
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight">
          {t("features.hero.title")}
        </h1>
        <p className="mt-5 text-xl text-gray-500 leading-relaxed">
          {t("features.hero.subtitle")}
        </p>
      </section>

      {/* Feature Blocks */}
      <section className="max-w-6xl mx-auto px-6 pb-24 space-y-28">
        {features.map((feature, index) => {
          const isImageLeft = index % 2 === 0;
          const headline = t(`features.items.${feature.id}.headline`);

          return (
            <div
              key={feature.id}
              className={`flex flex-col gap-12 items-center ${
                isImageLeft ? "lg:flex-row" : "lg:flex-row-reverse"
              }`}
            >
              {/* Placeholder visual */}
              <div className="w-full lg:w-1/2 flex-shrink-0">
                <div
                  className={`${feature.placeholderColor} rounded-2xl aspect-[4/3] flex items-center justify-center`}
                >
                  <div
                    className={`${feature.bgColor} rounded-xl p-6 shadow-sm flex flex-col items-center gap-3`}
                  >
                    <span className={`${feature.color}`}>
                      {feature.icon}
                    </span>
                    <span className={`text-sm font-medium ${feature.color}`}>
                      {headline}
                    </span>
                  </div>
                </div>
              </div>

              {/* Text content */}
              <div className="w-full lg:w-1/2">
                <div
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${feature.bgColor} ${feature.color} mb-4`}
                >
                  {feature.icon}
                  {headline}
                </div>
                <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
                  {t(`features.items.${feature.id}.subheadline`)}
                </h2>
                <ul className="mt-6 space-y-3">
                  {feature.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-3">
                      <CheckCircle2
                        className={`h-5 w-5 mt-0.5 flex-shrink-0 ${feature.color}`}
                      />
                      <span className="text-gray-600 text-base leading-relaxed">
                        {t(`features.items.${feature.id}.bullets.${bullet}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </section>

      {/* Bottom CTA */}
      <section className="bg-gray-900 px-6 py-20 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-white">
          {t("features.cta.title")}
        </h2>
        <p className="mt-4 text-lg text-gray-400 max-w-xl mx-auto">
          {t("features.cta.subtitle")}
        </p>
        <div className="mt-8">
          <Link
            href="/signup"
            className="inline-block bg-white text-gray-900 font-semibold text-base px-8 py-3.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {t("features.cta.button")}
          </Link>
        </div>
      </section>
    </div>
  );
}
