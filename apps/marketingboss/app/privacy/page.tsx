import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — MarketingBoss AI",
  description: "How MarketingBoss AI collects, uses, and protects your information.",
};

const UPDATED = "August 1, 2026";
const CONTACT = "support@marketingbossai.com";

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-5 py-10 sm:py-14">
      <header className="flex flex-col gap-1">
        <Link href="/" className="text-xs text-white/45 transition hover:text-white">
          ← MarketingBoss AI
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-white/45">Last updated: {UPDATED}</p>
      </header>

      <div className="flex flex-col gap-6 text-[15px] leading-relaxed text-white/75">
        <Section title="Overview">
          MarketingBoss AI (“MarketingBoss,” “we,” “us”) provides tools to create multimedia content and publish it to
          social media. This policy explains what we collect, how we use it, and the choices you have.
        </Section>

        <Section title="Information we collect">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              <b className="text-white/85">Account information</b> — your email address and authentication details.
            </li>
            <li>
              <b className="text-white/85">Content you create</b> — the prompts, uploads, generated images and video,
              and post copy you produce, which we store so you can access and publish them.
            </li>
            <li>
              <b className="text-white/85">Connected accounts</b> — when you connect a social account (Facebook,
              Instagram, Threads, LinkedIn, Pinterest, YouTube, TikTok), we store the access tokens needed to publish on
              your behalf, and basic profile details such as the account name.
            </li>
            <li>
              <b className="text-white/85">Payment information</b> — purchases are processed by Stripe. We receive a
              record of your purchase; we do not store your full card number.
            </li>
            <li>
              <b className="text-white/85">Usage data</b> — logs and technical information generated as you use the
              service, used to operate, secure, and improve it.
            </li>
          </ul>
        </Section>

        <Section title="How we use your information">
          We use your information to provide the service — to generate content, publish it to the accounts you connect
          at your direction, meter and process credits, provide support, and keep the service secure and functioning.
        </Section>

        <Section title="How we share information">
          We share information only as needed to run the service: with infrastructure and processing providers (such as
          Supabase for hosting and database, and fal.ai for AI generation), with our payment processor (Stripe), and
          with the social platforms you connect — where content is published solely at your direction. We may also
          disclose information if required by law. We do not sell your personal information.
        </Section>

        <Section title="Connected social accounts">
          Access tokens for your connected accounts are stored securely and used only to publish content you direct us
          to publish, and to read basic engagement metrics for posts you published where the platform allows it. You can
          disconnect any account at any time from the Connections page, which removes its stored tokens.
        </Section>

        <Section title="Cookies">
          We use essential cookies to keep you signed in and operate the service. We do not use them for third-party
          advertising.
        </Section>

        <Section title="Data retention">
          We retain your information for as long as your account is active or as needed to provide the service. You can
          delete your generated content, disconnect accounts, or request account deletion, after which we delete or
          de-identify your information except where retention is required by law.
        </Section>

        <Section title="Security">
          We take reasonable measures to protect your information, including restricting access to secrets such as OAuth
          tokens to server-side processes. No method of transmission or storage is completely secure, and we cannot
          guarantee absolute security.
        </Section>

        <Section title="Your choices and rights">
          You may access and update your account information, delete content, disconnect accounts, and request deletion
          of your account. Depending on where you live, you may have additional rights over your personal information;
          contact us to exercise them.
        </Section>

        <Section title="Children">
          The service is not directed to children and is intended for users who meet the minimum age required by their
          jurisdiction and by the platforms they connect. We do not knowingly collect information from children.
        </Section>

        <Section title="Changes to this policy">
          We may update this policy from time to time. Material changes will be reflected by updating the date above.
        </Section>

        <Section title="Contact">
          Questions or requests? Contact us at{" "}
          <a href={`mailto:${CONTACT}`} className="text-boss-gold underline underline-offset-2">
            {CONTACT}
          </a>
          .
        </Section>
      </div>

      <footer className="mt-4 border-t border-white/10 pt-4 text-xs text-white/35">
        See also our{" "}
        <Link href="/terms" className="text-white/60 underline underline-offset-2 hover:text-white">
          Terms of Service
        </Link>
        .
      </footer>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div>{children}</div>
    </section>
  );
}
