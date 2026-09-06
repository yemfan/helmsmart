import { NextResponse } from "next/server";
import {
  clampIntDays,
  computeActivationRate,
  computeFirstTenMinutes,
  computeCheckoutConversionRate,
  computeChurnMetrics,
  computeCurrentMrr,
  countDistinctPayingUsers,
  countMauUsage,
  countNewPayingEvents,
  daysAgoIso,
} from "@/lib/analytics/saasMetrics";
import { adminMetricsErrorResponse, requireAdminMetricsSupabase } from "@/lib/admin/adminMetricsRoutes";
import { requireRoleRoute } from "@/lib/auth/requireRole";

/**
 * GET — founder metrics snapshot (MRR, MAU, activation, conversion, churn).
 * Query: `days` (usage + funnel conversion window, default 30), `churnDays` (default 30, max 90).
 */
export async function GET(req: Request) {
  try {
    const auth = await requireRoleRoute(["admin"], { strictUnauthorized: true });
    if (auth.ok === false) return auth.response;

    const misconfigured = requireAdminMetricsSupabase();
    if (misconfigured) return misconfigured;

    const { searchParams } = new URL(req.url);
    const usageDays = clampIntDays(searchParams.get("days"), 30);
    const churnDays = clampIntDays(searchParams.get("churnDays"), 30, 90);
    const sinceUsage = daysAgoIso(usageDays);

    const [{ mrr, payingRowCount }, payingUsersDistinct, mauUsage, activation, conversion, churn, newPaying, firstTen] =
      await Promise.all([
        computeCurrentMrr(),
        countDistinctPayingUsers(),
        countMauUsage(sinceUsage),
        computeActivationRate(),
        computeCheckoutConversionRate(sinceUsage),
        computeChurnMetrics(churnDays),
        countNewPayingEvents(sinceUsage),
        // Never let the two new numbers take the whole snapshot down.
        computeFirstTenMinutes().catch((e) => {
          console.error("[metrics/overview] first-ten-minutes failed:", e);
          return null;
        }),
      ]);

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      scope: {
        usageAndConversionWindowDays: usageDays,
        churnWindowDays: churnDays,
      },
      mrr,
      payingSubscriptions: payingRowCount,
      payingUsersDistinct,
      mauUsage,
      firstTenMinutes: firstTen
        ? {
            ...firstTen,
            definition:
              "Per agent: minutes from agents.created_at to the first proposal Max showed (boss_recommendations or a run step parked for approval) and to the first one they approved. Medians over agents who reached the moment; within10m is the share of all agents who did so inside ten minutes.",
          }
        : null,
      activation: {
        onboarded: activation.onboarded,
        activatedWithin7dOfOnboarding: activation.activatedWithin7d,
        rate: activation.rate,
        definition:
          "Users with first_reply_at within 7 days after onboarding_completed_at / users with onboarding completed",
      },
      conversion: {
        checkoutStartedUsers: conversion.checkoutStartedUsers,
        convertedUsers: conversion.convertedUsers,
        rate: conversion.rate,
        definition:
          "Distinct users with subscription_active_crm in window who also had upgrade_checkout_started in the same window / distinct checkout starters in window",
      },
      churn: {
        churnedUsers: churn.churnedUsers,
        payingUsersNow: churn.payingUsersNow,
        rate: churn.churnRate,
        definition: churn.definition,
      },
      newPayingUsersInWindow: newPaying,
    });
  } catch (e) {
    return adminMetricsErrorResponse("[admin/metrics/overview]", e, "Failed to load overview metrics");
  }
}
