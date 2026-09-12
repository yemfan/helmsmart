# Mobile calendar, booking links, and reminders

## Overview

The mobile app adds a **Calendar** tab plus schedule/booking sections on **lead detail**. Data lives in CRM tables (`lead_calendar_events`, `lead_booking_links`) scoped by agent and lead. External calendar sync is modeled with `calendar_provider`, `external_event_id`, and `external_calendar_id` (Google first; Outlook can use the same columns with `calendar_provider = 'outlook'`).

## API routes (CloseBoss CRM)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/mobile/calendar/events?from=&to=` | Upcoming **scheduled** appointments for the agent (default window: now → +90 days). |
| `POST` | `/api/mobile/calendar/events` | Create appointment (`lead_id`, `title`, `starts_at`, optional `description`, `ends_at`, `timezone`, `calendar_provider`, external ids). |
| `PATCH` | `/api/mobile/calendar/events/:id` | Update / cancel (`status: cancelled` \| `completed`, or reschedule fields). |
| `POST` | `/api/mobile/calendar/booking-link` | Save a scheduling URL on a lead (`lead_id`, `booking_url`, optional `label`, `share_message`, `expires_at`). Bumps `last_activity_at` and stores `metadata_json` for timeline-style auditing. |
| `GET` | `/api/mobile/reminders` | Aggregated **action list**: `upcoming_appointments`, `overdue_tasks` (open `lead_tasks`), `follow_ups` (leads with `next_contact_at` ordered soonest). |

Lead detail `GET /api/mobile/leads/:id` also returns **`next_appointment`** (earliest future scheduled event for that lead) and **`booking_links`** (recent links, newest first).

## Database

Apply migration `20260464000000_lead_calendar_booking.sql` (creates `lead_calendar_events` and `lead_booking_links` with the same `agents.id` type resolution pattern as `lead_tasks`).

## Mobile modules

- **Tab:** `app/(tabs)/calendar.tsx` — appointments, overdue tasks, follow-ups; **New** appointment (requires lead ID).
- **Lead detail:** `app/lead/[id].tsx` — next appointment, saved booking links, **Schedule** / **Booking link** actions.
- **API client:** `lib/closeBossMobileApi.ts` — `fetchMobileCalendarEvents`, `postMobileCalendarEvent`, `patchMobileCalendarEvent`, `postMobileBookingLink`, `fetchMobileReminders`; lead detail parsing includes `next_appointment` and `booking_links`.
- **Components:** `components/calendar/*` — `AppointmentCard`, `AppointmentComposerModal`, `BookingLinkCard`, `BookingLinkComposerModal`, `ReminderCard`.

## CRM timeline / activity

- Creating an appointment or booking link updates **`leads.last_activity_at`**.
- Booking rows include **`metadata_json`** (`source: mobile`, timestamps) for dashboards or future timeline UI.

## CloseBoss web dashboard (`apps/leadsmartai`)

The CRM dashboard uses the **same tables and server helpers** with cookie/session auth:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/dashboard/calendar/events?from=&to=&leadId=` | List appointments; **`leadId`** filters to one lead (lead drawer). |
| `POST` | `/api/dashboard/calendar/events` | Body: `leadId`, `title`, `startsAt`, optional `description`, `endsAt`, `timezone`, `calendarProvider`. |
| `PATCH` | `/api/dashboard/calendar/events/:id` | Cancel / reschedule (`status`, `startsAt`, `endsAt`, …). |
| `POST` | `/api/dashboard/calendar/booking-link` | Body: `leadId`, `bookingUrl`, optional `label`, `shareMessage`, `expiresAt`. |
| `GET` | `/api/dashboard/calendar/booking-links?leadId=` | Recent links for that lead. |
| `GET` | `/api/dashboard/reminders` | Same aggregate as mobile (`upcoming_appointments`, `overdue_tasks`, `follow_ups`). |
| `PATCH` | `/api/dashboard/lead-tasks/:id` | Update **`lead_tasks`** (e.g. `status: "done"`) for overdue items on the calendar page. |

**UI:** `components/dashboard/LeadCalendarBookingPanel.tsx` in the **lead modal** on `/dashboard/leads`, and **`/dashboard/calendar`** for the full agent view. Sidebar: **Leads → Calendar**.

## Operational notes

- Appointment list only includes **`status = scheduled`**. Cancelled/completed rows remain for history but are excluded from default mobile lists.
- Reminder **overdue tasks** use the same UTC day bucketing as the Tasks tab.
- **Follow-ups** reflect `leads.next_contact_at` (existing nurture/follow-up field); not a separate reminders table.
