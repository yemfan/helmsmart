import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/**
 * `DATABASE_URL` with the pool capped at one connection per instance.
 *
 * This database allows 60 connections in total, and Supabase's own services
 * already reserve a slice: Auth is configured for up to 10, and PostgREST
 * holds a warm pool of its own. Everything else the app does goes over HTTP to
 * PostgREST and costs no Postgres connection at all — Prisma is the single
 * exception, and the only thing here that can open one directly.
 *
 * Prisma sizes its default pool from the CPU count, so each serverless
 * instance would take roughly five to nine. A few dozen warm instances would
 * exhaust the server between them, which is how the login outage behind #1071
 * happened by a different route. One connection per instance is the right
 * shape for serverless: concurrency comes from running more instances, not
 * from a deeper pool inside each one.
 *
 * Returns undefined when `DATABASE_URL` is unset — which is the case in
 * production today, so these routes answer 503 and Prisma never connects.
 */
function cappedDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    // Respect an explicit value; only supply the cap when nobody has chosen one.
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", "1");
    }
    return url.toString();
  } catch {
    // Not parseable as a URL — hand it back untouched rather than lose the
    // connection string to a formatting assumption.
    return raw;
  }
}

const datasourceUrl = cappedDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["warn", "error"],
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
  });

/**
 * Cached in every environment, not only development.
 *
 * In development it survives hot reload, which is the usual reason for the
 * pattern. In production it guards against a second client — and a second
 * pool — if this module is ever evaluated twice inside one instance.
 */
globalForPrisma.prisma = prisma;

/** True when `DATABASE_URL` is set (support routes return 503 otherwise). */
export function isPrismaConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}
