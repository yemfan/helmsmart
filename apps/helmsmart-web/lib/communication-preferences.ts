/**
 * The writable shape of a row in `communication_preferences`.
 *
 * Named exactly as the columns are, so the mapping in
 * `lib/actions/communication-logs.ts` is a 1:1 read and a rename that reaches
 * only one side of the wire is a compile error.
 *
 * Every field is REQUIRED on purpose. When the panel sent an optional-everything
 * object and the action destructured different (camelCase) keys off it, both
 * sides typechecked, the upsert wrote `undefined` for every column, and the
 * panel reported "Saved successfully" over a row that never changed — on the
 * consent flags that gate outbound SMS, email and calls. Optionality was what
 * made the mismatch invisible: with required fields, a missing or misspelled
 * key fails to compile even when the argument is a variable rather than an
 * object literal (excess-property checking does not reach variables).
 *
 * This module carries no "use server" directive: a server-actions module may
 * only export async functions, so the shared type has to live outside it.
 */
export interface ClientCommunicationPreferences {
  /** Do not text this client. */
  opted_out_sms: boolean;
  /** Do not email this client. */
  opted_out_email: boolean;
  /** Do not call this client. */
  opted_out_calls: boolean;
  /** "any" | "sms" | "email" | "call" */
  preferred_contact_method: string;
  /** "" | "morning" | "afternoon" | "evening" | "weekdays" | "weekends" */
  best_time_to_contact: string;
  /** Free text, e.g. "prefers email after 5pm". */
  notes: string;
}

/** What the panel starts from when a client has no preferences row yet. */
export const DEFAULT_CLIENT_COMMUNICATION_PREFERENCES: ClientCommunicationPreferences =
  {
    opted_out_sms: false,
    opted_out_email: false,
    opted_out_calls: false,
    preferred_contact_method: "any",
    best_time_to_contact: "",
    notes: "",
  };
