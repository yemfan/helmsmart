import type React from "react";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="mb-10 text-center">
          <span className="text-2xl font-bold text-slate-900 tracking-tight">
            HelmSmart<span className="text-indigo-600">.ai</span>
          </span>
        </div>

        {children}
      </div>
    </div>
  );
}
