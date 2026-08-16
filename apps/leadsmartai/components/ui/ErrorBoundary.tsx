"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { i18n } from "@/lib/i18n/client";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { hasError: boolean; error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-[200px] items-center justify-center p-8">
          <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <div className="text-3xl mb-3">!</div>
            <h2 className="text-lg font-semibold text-red-900 mb-2">{i18n.t("pages.misc.somethingWrong", { ns: "dashboard" })}</h2>
            <p className="text-sm text-red-700 mb-4">
              {this.state.error?.message || i18n.t("pages.misc.unexpectedError", { ns: "dashboard" })}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >{i18n.t("pages.misc.tryAgain", { ns: "dashboard" })}</button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
