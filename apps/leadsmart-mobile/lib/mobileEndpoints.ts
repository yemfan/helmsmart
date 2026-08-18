/** Relative paths for LeadSmart CRM mobile routes (prefix with API base URL). */
export const MOBILE_API_PATHS = {
  inbox: "/api/mobile/inbox",
  dashboard: "/api/mobile/dashboard",
  agenda: "/api/mobile/agenda",
  dailyAgenda: "/api/mobile/daily-agenda",
  leads: "/api/mobile/leads",
  lead: (leadId: string) => `/api/mobile/leads/${encodeURIComponent(leadId)}`,
  contactsIntake: "/api/mobile/contacts/intake",
  leadSmsSend: (leadId: string) =>
    `/api/mobile/leads/${encodeURIComponent(leadId)}/sms/send`,
  leadSmsAiReply: (leadId: string) =>
    `/api/mobile/leads/${encodeURIComponent(leadId)}/sms/ai-reply`,
  leadEmailSend: (leadId: string) =>
    `/api/mobile/leads/${encodeURIComponent(leadId)}/email/send`,
  leadEmailAiReply: (leadId: string) =>
    `/api/mobile/leads/${encodeURIComponent(leadId)}/email/ai-reply`,
  pushRegister: "/api/mobile/push/register",
  tasks: "/api/mobile/tasks",
  task: (taskId: string) => `/api/mobile/tasks/${encodeURIComponent(taskId)}`,
  expenses: "/api/mobile/expenses",
  expensesDelete: "/api/mobile/expenses/delete",
  expenseReceiptUpload: "/api/mobile/expenses/receipt",
  leadPipelineStage: (leadId: string) =>
    `/api/mobile/leads/${encodeURIComponent(leadId)}/pipeline-stage`,
  calendarEvents: "/api/mobile/calendar/events",
  calendarEvent: (eventId: string) =>
    `/api/mobile/calendar/events/${encodeURIComponent(eventId)}`,
  calendarBookingLink: "/api/mobile/calendar/booking-link",
  reminders: "/api/mobile/reminders",
  notifications: "/api/mobile/notifications",
  notificationPreferences: "/api/mobile/notification-preferences",
  account: "/api/mobile/account",
  leadQueue: "/api/dashboard/lead-queue",
  leadQueueClaim: "/api/dashboard/lead-queue/claim",
  // Boss Assistant command center — these /api/dashboard/closeboss/* routes
  // are dual-auth (Bearer-aware), so the mobile app calls them directly.
  bossInstructions: "/api/dashboard/closeboss/instructions",
  bossInstructionTasks: "/api/dashboard/closeboss/instruction-tasks",
  bossRecommendations: "/api/dashboard/closeboss/recommendations",
  bossRecommendation: (id: string) =>
    `/api/dashboard/closeboss/recommendations/${encodeURIComponent(id)}`,
  bossTeam: "/api/dashboard/closeboss/team",
  bossAutopilot: "/api/dashboard/closeboss/autopilot",
  // Offer desk — dual-auth (Bearer-aware) routes, called directly from mobile.
  offerBuild: "/api/dashboard/offers/build",
  contractReview: "/api/dashboard/contracts/review",
  listingOffersCompare: "/api/dashboard/listing-offers/compare",
  cma: "/api/mobile/cma",
  coaching: "/api/mobile/coaching/me",
  briefings: "/api/mobile/briefings",
  postcards: "/api/mobile/postcards",
  postcardTemplates: "/api/mobile/postcards/templates",
  showings: "/api/mobile/showings",
  showing: (id: string) =>
    `/api/mobile/showings/${encodeURIComponent(id)}`,
  showingFeedback: (id: string) =>
    `/api/mobile/showings/${encodeURIComponent(id)}/feedback`,
  clickToCall: "/api/mobile/voice/click-to-call",
  leadsGenDraft: "/api/mobile/leads-gen/draft",
  leadsGenConnections: "/api/mobile/leads-gen/connections",
  leadsGenPublish: "/api/mobile/leads-gen/publish",
  leadsGenConnectMetaInit: "/api/mobile/leads-gen/connect/meta/init",
  leadsGenConnectMetaDisconnect: "/api/mobile/leads-gen/connect/meta/disconnect",
  leadsGenConnectLinkedInInit: "/api/mobile/leads-gen/connect/linkedin/init",
  leadsGenConnectLinkedInDisconnect:
    "/api/mobile/leads-gen/connect/linkedin/disconnect",
  leadsGenConnectTikTokInit: "/api/mobile/leads-gen/connect/tiktok/init",
  leadsGenConnectTikTokDisconnect: "/api/mobile/leads-gen/connect/tiktok/disconnect",
  leadsGenConnectYouTubeInit: "/api/mobile/leads-gen/connect/youtube/init",
  leadsGenConnectYouTubeDisconnect: "/api/mobile/leads-gen/connect/youtube/disconnect",
  leadsGenMediaUpload: "/api/mobile/leads-gen/media/upload",
  leadsGenSchedule: "/api/mobile/leads-gen/schedule",
  leadsGenScheduleList: "/api/mobile/leads-gen/schedule/list",
  leadsGenScheduleCancel: (id: string) =>
    `/api/mobile/leads-gen/schedule/${encodeURIComponent(id)}/cancel`,
  leadsGenRecurring: "/api/mobile/leads-gen/recurring",
  leadsGenRecurringList: "/api/mobile/leads-gen/recurring/list",
  leadsGenRecurringAction: (id: string) =>
    `/api/mobile/leads-gen/recurring/${encodeURIComponent(id)}`,
  leadsGenSubjects: (trigger: string) =>
    `/api/mobile/leads-gen/subjects?trigger=${encodeURIComponent(trigger)}`,
  sphereBuyers: "/api/mobile/sphere/buyers",
  sphereSellers: "/api/mobile/sphere/sellers",
  leadsGenLookupProperty: "/api/mobile/leads-gen/lookup-property",
  leadsGenPostsList: "/api/mobile/leads-gen/posts/list",
  leadsGenPostRefresh: (id: string) =>
    `/api/mobile/leads-gen/posts/${encodeURIComponent(id)}/refresh`,
  leadsGenInsightsTopPosts: "/api/mobile/leads-gen/insights/top-posts",
  leadsGenSuggestionsNextPost:
    "/api/mobile/leads-gen/suggestions/next-post",
  socialWeeklySchedule: "/api/mobile/social/weekly-schedule",
  uploadsSign: "/api/mobile/uploads/sign",
  digitalTwin: "/api/mobile/digital-twin",
} as const;
