/**
 * Shared types for the Open House workflow.
 */

export type OpenHouseStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export type VisitorTimeline =
  | "now"
  | "3_6_months"
  | "6_12_months"
  | "later"
  | "just_looking";

export type VisitorBuyerStatus = "looking" | "just_browsing" | "neighbor" | "other";

export type OpenHouseRow = {
  id: string;
  agent_id: string;
  transaction_id: string | null;

  property_address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  mls_number: string | null;
  mls_url: string | null;
  list_price: number | null;

  start_at: string;
  end_at: string;

  signin_slug: string;

  host_notes: string | null;
  status: OpenHouseStatus;

  /** The wrap-up: who the day's report goes to, what it said, when it went. */
  listing_id?: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  requesting_agent_name?: string | null;
  requesting_agent_email?: string | null;
  summary?: unknown;
  summary_ready_at?: string | null;
  host_comment?: string | null;
  summary_sent_at?: string | null;
  summary_sent_to?: string[] | null;

  recurrence_group_id: string | null;

  created_at: string;
  updated_at: string;
};

export type OpenHouseVisitorRow = {
  id: string;
  open_house_id: string;
  agent_id: string;
  contact_id: string | null;

  name: string | null;
  email: string | null;
  phone: string | null;

  is_buyer_agented: boolean;
  buyer_agent_name: string | null;
  buyer_agent_brokerage: string | null;

  timeline: VisitorTimeline | null;
  buyer_status: VisitorBuyerStatus | null;

  marketing_consent: boolean;

  thank_you_sent_at: string | null;
  check_in_sent_at: string | null;

  notes: string | null;
  created_at: string;
};

/**
 * Denormalized list-view item — open house + visitor counts.
 */
export type OpenHouseListItem = OpenHouseRow & {
  visitor_total: number;
  visitor_with_consent: number;
  visitor_hot: number; // timeline = 'now'
};
