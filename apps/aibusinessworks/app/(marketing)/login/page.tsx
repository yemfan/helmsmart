import type { Metadata } from "next";
import { Suspense } from "react";
import { Container, Section } from "@/components/ui/primitives";
import { LoginForm } from "@/components/site/login-form";
import { Mark } from "@/components/site/brand";

export const metadata: Metadata = {
  title: "Partner Login",
  description: "Log in to your AI Business Works Partner dashboard.",
  alternates: { canonical: "/login" },
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return (
    <Section tone="alt">
      <Container width="narrow">
        <div className="mx-auto max-w-md">
          <div className="text-center">
            <div className="inline-flex">
              <Mark size={44} />
            </div>
            <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Partner login
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Your dashboard, customers, commissions, links and the Academy.
            </p>
          </div>

          <div className="mt-8">
            <Suspense
              fallback={
                <div className="h-80 rounded-2xl border border-hairline bg-white shadow-card" />
              }
            >
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </Container>
    </Section>
  );
}
