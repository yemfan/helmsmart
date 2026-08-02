import Link from "next/link";

export const metadata = {
  title: "Terms of Service — MarketingBoss AI",
  description: "The terms that govern your use of MarketingBoss AI.",
};

const UPDATED = "August 1, 2026";
const CONTACT = "support@marketingbossai.com";

export default function TermsPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-5 py-10 sm:py-14">
      <header className="flex flex-col gap-1">
        <Link href="/" className="text-xs text-white/45 transition hover:text-white">
          ← MarketingBoss AI
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
        <p className="text-sm text-white/45">Last updated: {UPDATED}</p>
      </header>

      <div className="flex flex-col gap-6 text-[15px] leading-relaxed text-white/75">
        <Section title="1. Agreement to these terms">
          MarketingBoss AI (“MarketingBoss,” “we,” “us”) provides tools to create multimedia content and publish it to
          social media. By creating an account or using the service, you agree to these Terms of Service. If you do not
          agree, do not use the service.
        </Section>

        <Section title="2. The service">
          MarketingBoss lets you generate images and video using third-party AI models, write and tailor post copy, and
          publish that content to social media accounts you connect (such as Facebook, Instagram, Threads, LinkedIn,
          Pinterest, YouTube, and TikTok). We publish content only at your direction, and only to the accounts you
          connect and authorize.
        </Section>

        <Section title="3. Your account">
          You are responsible for the information you provide, for keeping your login credentials secure, and for all
          activity under your account. Provide accurate information and notify us promptly of any unauthorized use.
        </Section>

        <Section title="4. Credits and payment">
          Generation is metered in credits on a pay-as-you-go basis. Purchasing credits is handled by our payment
          processor (Stripe); we do not store your full card details. Credits are consumed when you generate content and
          are non-refundable except where required by law. Prices and credit costs may change; changes apply to future
          purchases.
        </Section>

        <Section title="5. Acceptable use">
          You agree not to use the service to create or publish content that is unlawful, infringing, deceptive,
          harassing, hateful, or otherwise harmful, or that violates the rights of others. You must have the rights to
          any input you provide (including reference images and links), and you must comply with the terms and policies
          of every platform you publish to, including TikTok, Meta, LinkedIn, Pinterest, and YouTube.
        </Section>

        <Section title="6. Your content">
          You retain ownership of the content you create and the material you provide. You grant us the limited rights
          needed to operate the service — to process, store, and, at your direction, publish your content to your
          connected accounts. You are solely responsible for the content you generate and publish.
        </Section>

        <Section title="7. AI-generated content">
          AI output can be inaccurate, unoriginal, or unsuitable for a given purpose, and similar output may be produced
          for others. You are responsible for reviewing generated content before publishing and for ensuring it meets
          your needs and complies with applicable laws and platform rules.
        </Section>

        <Section title="8. Third-party services">
          The service relies on third parties, including AI model providers (e.g., fal.ai), payment processing (Stripe),
          hosting and database (Supabase), and the social platforms you connect. Your use of those services is subject
          to their terms, and we are not responsible for their acts, omissions, availability, or content.
        </Section>

        <Section title="9. Termination">
          You may stop using the service and delete your account at any time. We may suspend or terminate access if you
          violate these terms or use the service in a way that could cause harm or legal exposure.
        </Section>

        <Section title="10. Disclaimers">
          The service is provided “as is” and “as available,” without warranties of any kind, whether express or
          implied, including fitness for a particular purpose, non-infringement, or uninterrupted or error-free
          operation.
        </Section>

        <Section title="11. Limitation of liability">
          To the maximum extent permitted by law, MarketingBoss will not be liable for any indirect, incidental,
          special, consequential, or punitive damages, or for lost profits, data, or goodwill, arising from your use of
          the service.
        </Section>

        <Section title="12. Changes to these terms">
          We may update these terms from time to time. Material changes will be reflected by updating the date above.
          Continued use of the service after changes take effect constitutes acceptance.
        </Section>

        <Section title="13. Contact">
          Questions about these terms? Contact us at{" "}
          <a href={`mailto:${CONTACT}`} className="text-boss-gold underline underline-offset-2">
            {CONTACT}
          </a>
          .
        </Section>
      </div>

      <footer className="mt-4 border-t border-white/10 pt-4 text-xs text-white/35">
        See also our{" "}
        <Link href="/privacy" className="text-white/60 underline underline-offset-2 hover:text-white">
          Privacy Policy
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
      <p>{children}</p>
    </section>
  );
}
