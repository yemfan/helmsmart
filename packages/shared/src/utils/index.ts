/** Shared pure helpers (dates, formatting). Expand incrementally. */
export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export { scoreNotificationContext } from "./notification-context-score";
export {
  scoreLeadAttention,
  notificationContextToLeadSignals,
  LEAD_ATTENTION_WEIGHTS,
  DEFAULT_LEAD_ATTENTION_THRESHOLDS,
} from "./lead-attention-score";
export { priorityToDeliveryTiming, DELIVERY_TIMING_LABEL } from "./notification-delivery-rules";

export {
  emailSuppression,
  isEmailSuppressed,
  buildUnsubscribeUrl,
  buildUnsubscribeHeaders,
  appendUnsubscribeFooter,
  type EmailSuppressionRow,
  type SuppressionReason,
} from "./emailUnsubscribe";
