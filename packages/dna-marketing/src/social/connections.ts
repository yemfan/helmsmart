// Publishing runtime — the seam that lets one orchestrator serve every app.
//
// The pure builders (meta-graph.ts / threads-graph.ts) decide WHAT to send; the
// rest of this package deliberately performs no I/O. This file adds the small
// RUNTIME layer that actually sends it, kept dependency-free (global fetch only,
// no SDK, no env, no table names) so it stays as portable as the builders.
//
// Identity/tokens/tables remain app-owned: an app implements ConnectionStore
// over its own schema (CloseBoss `social_accounts`/agent_id, HelmSmart
// `org_oauth_tokens`/organization_id, MarketingBoss `social_connections`/user_id)
// and hands it in. See docs/marketing/unification-proposal.md §4.

import type { SocialPlatform } from "./platforms";

/** One connected account's live credentials + the ids a publisher needs. */
export interface SocialConnection {
  platform: SocialPlatform;
  accessToken: string;
  /** Channel/page/board id, when the platform keys on one. */
  providerAccountId?: string | null;
  /**
   * Platform-specific ids the publisher reads, e.g.
   *   facebook  → { fbPageId }
   *   instagram → { igUserId, fbPageId }   (IG posts with the Page token)
   *   threads   → { threadsUserId }
   * The app's ConnectionStore maps its columns onto these keys.
   */
  metadata?: Record<string, string | null | undefined>;
  refreshToken?: string | null;
  /** epoch ms; the store refreshes when near expiry. */
  expiresAt?: number | null;
}

/**
 * The app owns the token table, encryption, identity, and refresh. It hands the
 * publisher a store already scoped to ONE principal (agent / org / user).
 */
export interface ConnectionStore {
  get(platform: SocialPlatform): Promise<SocialConnection | null>;
  list(): Promise<SocialConnection[]>;
  /** A guaranteed-fresh access token; refreshes + persists if expired. */
  freshAccessToken(platform: SocialPlatform): Promise<string>;
}

export interface MediaAsset {
  kind: "image" | "video";
  /** Publicly fetchable at publish time (Storage/CDN/signed-unexpired). */
  url: string;
  mimeType?: string;
}

export interface PostContent {
  caption: string;
  media: MediaAsset[];
  /** YouTube. */
  title?: string;
  privacy?: "public" | "unlisted" | "private";
  /** Facebook feed link-preview card. */
  link?: string;
  /** Passthrough options a specific platform's publisher understands. */
  platformOptions?: Partial<Record<SocialPlatform, Record<string, string>>>;
}

export interface PublishResult {
  platform: SocialPlatform;
  ok: boolean;
  externalId?: string;
  url?: string | null;
  error?: string;
  /** True when a later retry could succeed (throttle/transient), false for auth. */
  retryable?: boolean;
}

export interface PublishEvent {
  platform: SocialPlatform;
  phase: "validating" | "uploading" | "publishing" | "done" | "error";
  detail?: string;
}

/** Context handed to each platform publisher. */
export interface PublishContext {
  content: PostContent;
  /** The connection with a freshened access token already applied. */
  connection: SocialConnection;
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  onEvent?: (e: PublishEvent) => void;
}

/**
 * A per-platform publisher: turns PostContent + a connection into API calls.
 * Built-in ones (facebook/instagram/threads) wrap the pure builders; apps can
 * plug additional ones (youtube/linkedin/pinterest) via PublishInput.publishers.
 */
export interface PlatformPublisher {
  platform: SocialPlatform;
  publish(ctx: PublishContext): Promise<PublishResult>;
}

export interface PublishInput {
  platforms: SocialPlatform[];
  content: PostContent;
  connections: ConnectionStore;
  /** Extra/override publishers by platform (merged over the built-ins). */
  publishers?: Partial<Record<SocialPlatform, PlatformPublisher>>;
  /** Defaults to global fetch; injectable for tests/proxies. */
  fetchImpl?: typeof fetch;
  onEvent?: (e: PublishEvent) => void;
}
