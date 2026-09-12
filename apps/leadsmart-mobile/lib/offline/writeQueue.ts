/**
 * Persisted FIFO write queue. Pure TypeScript, no React hooks.
 *
 * Queued writes are stored in AsyncStorage and replayed in order
 * when the device reconnects. The module self-subscribes to the
 * `onReconnect` event so replay is automatic.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { subscribeReconnect } from "./onReconnect";

const QUEUE_KEY = "@ls_write_queue";
const MAX_QUEUE_SIZE = 50;

export type WriteEndpoint = "sms-send" | "task-complete" | "pipeline-stage";

export type QueuedWrite = {
  id: string;
  createdAt: string;
  endpoint: WriteEndpoint;
  args: unknown[];
  retries: number;
  maxRetries: number;
};

// ── helpers ──────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function readQueue(): Promise<QueuedWrite[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (raw === null) return [];
    return JSON.parse(raw) as QueuedWrite[];
  } catch {
    return [];
  }
}

async function persistQueue(queue: QueuedWrite[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Best-effort persistence.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── public API ───────────────────────────────────────────────────

export async function enqueueWrite(
  endpoint: WriteEndpoint,
  args: unknown[],
  maxRetries = 5
): Promise<void> {
  const queue = await readQueue();
  queue.push({
    id: generateId(),
    createdAt: new Date().toISOString(),
    endpoint,
    args,
    retries: 0,
    maxRetries,
  });

  // Trim to MAX_QUEUE_SIZE, dropping oldest entries.
  const trimmed = queue.length > MAX_QUEUE_SIZE
    ? queue.slice(queue.length - MAX_QUEUE_SIZE)
    : queue;

  await persistQueue(trimmed);
}

export async function dequeueWrite(id: string): Promise<void> {
  const queue = await readQueue();
  await persistQueue(queue.filter((item) => item.id !== id));
}

export async function getWriteQueue(): Promise<QueuedWrite[]> {
  return readQueue();
}

export async function getQueueSize(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

export async function clearWriteQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUEUE_KEY);
  } catch {
    // Best-effort cleanup.
  }
}

/**
 * Replay queued writes in FIFO order. Uses dynamic imports for the
 * API functions to avoid a circular dependency at module load time.
 */
export async function replayQueue(): Promise<{ replayed: number; failed: number }> {
  const {
    postMobileSmsSend,
    patchMobileTask,
    patchLeadPipelineStage,
  } = await import("../closeBossMobileApi");

  let replayed = 0;
  let failed = 0;

  const queue = await readQueue();

  for (const item of queue) {
    let result: { ok: boolean } | { ok: false; status: number; message: string };

    try {
      switch (item.endpoint) {
        case "sms-send":
          result = await postMobileSmsSend(
            item.args[0] as string,
            item.args[1] as string
          );
          break;
        case "task-complete":
          result = await patchMobileTask(item.args[0] as string, {
            status: "done",
          });
          break;
        case "pipeline-stage":
          result = await patchLeadPipelineStage(item.args[0] as string, {
            stage_slug: item.args[1] as string,
          });
          break;
        default:
          // Unknown endpoint — dead-letter it.
          await dequeueWrite(item.id);
          failed++;
          continue;
      }
    } catch {
      // Network-level fetch failure — treat as status 0.
      result = { ok: false, status: 0, message: "Network error" };
    }

    if (result.ok !== false) {
      // Success.
      await dequeueWrite(item.id);
      replayed++;
      continue;
    }

    const failure = result as { ok: false; status: number; message: string };

    if (failure.status === 409) {
      // Conflict — last-write-wins, discard.
      await dequeueWrite(item.id);
      replayed++;
      continue;
    }

    if (failure.status === 0) {
      // Still offline — stop replay, return current counts.
      return { replayed, failed };
    }

    // Other 4xx/5xx — increment retries.
    item.retries++;
    if (item.retries >= item.maxRetries) {
      // Dead letter — drop the item.
      await dequeueWrite(item.id);
      failed++;
    } else {
      // Persist the incremented retry count.
      const current = await readQueue();
      const idx = current.findIndex((q) => q.id === item.id);
      if (idx !== -1) {
        current[idx] = item;
        await persistQueue(current);
      }

      // Exponential backoff before retrying.
      await sleep(Math.pow(3, item.retries) * 1000);
    }
  }

  return { replayed, failed };
}

// ── auto-replay on reconnect ─────────────────────────────────────

subscribeReconnect(() => {
  void replayQueue();
});
