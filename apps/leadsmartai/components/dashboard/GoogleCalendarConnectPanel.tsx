"use client";

import { useEffect, useState } from "react";
import { ConnectionPill } from "@/components/connections/ConnectionHealth";
import { useTranslation } from "react-i18next";

type GcalStatus = { configured: boolean; connected: boolean };

/**
 * Google Calendar connect / disconnect row.
 *
 * Lifted out of CalendarClient so Settings can show the same control —
 * two-way sync is a connection, and connections are what people go to
 * Settings looking for. Self-fetching, so either mount is standalone.
 *
 * Renders nothing when the integration isn't configured for the
 * deployment (no Google client id), which is also how the calendar page
 * has always behaved.
 */
export default function GoogleCalendarConnectPanel() {
  const { t: tr } = useTranslation("dashboard");
  const [status, setStatus] = useState<GcalStatus | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/calendar/google-status")
      .then((r) => r.json())
      .then((b) => {
        if (cancelled || !b?.ok) return;
        setStatus({ configured: b.configured, connected: b.connected });
      })
      .catch(() => {
        /* Optional integration — a failed probe just hides the row. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status?.configured) return null;

  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          {status.connected ? tr("calendar.gcal.connected") : tr("calendar.gcal.connect")}
          <ConnectionPill
            state={status.connected ? "connected" : "disconnected"}
            label={
              status.connected
                ? tr("calendar.gcal.pillConnected")
                : tr("calendar.gcal.pillDisconnected")
            }
          />
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          {status.connected ? tr("calendar.gcal.connectedHelp") : tr("calendar.gcal.connectHelp")}
        </p>
      </div>
      {status.connected ? (
        <button
          type="button"
          onClick={async () => {
            setDisconnecting(true);
            await fetch("/api/auth/google-calendar/disconnect", { method: "POST" }).catch(() => {});
            setStatus({ configured: true, connected: false });
            setDisconnecting(false);
          }}
          disabled={disconnecting}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          {disconnecting ? tr("calendar.gcal.working") : tr("calendar.gcal.disconnect")}
        </button>
      ) : (
        <a
          href="/api/auth/google-calendar"
          className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
        >
          {tr("pages.calendarPage.connect")}
        </a>
      )}
    </div>
  );
}
