"use client";

/**
 * The label is passed in rather than looked up here.
 *
 * This page renders its own `<html>` document — it is not inside the root
 * layout — so there is no `I18nProvider` above it and `useTranslation` would
 * resolve against an empty instance, rendering the raw key. The server half
 * already holds the owner's translator; handing the finished string down is
 * both simpler and the only thing that works.
 */
export function PrintButton({ label }: { label: string }) {
  return <button onClick={() => window.print()}>{label}</button>;
}
