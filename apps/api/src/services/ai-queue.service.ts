/**
 * AI Queue Service — Token-bucket + FIFO queue for Gemini API calls
 * Enforces a global RPM limit (default: 10) to avoid 429 from Google.
 */

const DEFAULT_RPM_LIMIT = 10;
const MAX_QUEUE_WAIT_MS = 120_000; // 2 minutes max wait

type QueueEntry<T> = {
  id: number;
  factory: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  enqueuedAt: number;
};

let entryIdCounter = 0;

// Sliding window of timestamps (ms) when AI calls were made
const callTimestamps: number[] = [];

// FIFO queue of pending requests
const pendingQueue: QueueEntry<any>[] = [];

// Whether the drain loop is currently running
let draining = false;

function getRpmLimit(): number {
  const envVal = process.env.AI_RPM_LIMIT;
  if (envVal) {
    const parsed = Number.parseInt(envVal, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_RPM_LIMIT;
}

/**
 * Prune timestamps older than 60 seconds from the sliding window.
 */
function pruneWindow(): void {
  const cutoff = Date.now() - 60_000;
  while (callTimestamps.length > 0 && callTimestamps[0] <= cutoff) {
    callTimestamps.shift();
  }
}

/**
 * Calculate how many milliseconds until we can make the next call.
 * Returns 0 if a slot is immediately available.
 */
function msUntilNextSlot(): number {
  pruneWindow();
  const limit = getRpmLimit();
  if (callTimestamps.length < limit) {
    return 0;
  }
  // The oldest call in the window — we need to wait until it falls out
  const oldestTs = callTimestamps[0];
  const waitMs = oldestTs + 60_000 - Date.now();
  return Math.max(0, waitMs);
}

/**
 * Record that an AI call is being made right now.
 */
function recordCall(): void {
  callTimestamps.push(Date.now());
}

/**
 * Drain loop: process pending queue entries one at a time,
 * respecting the RPM sliding window.
 */
async function drain(): Promise<void> {
  if (draining) return;
  draining = true;

  try {
    while (pendingQueue.length > 0) {
      const entry = pendingQueue[0];

      // Check for timeout
      if (Date.now() - entry.enqueuedAt > MAX_QUEUE_WAIT_MS) {
        pendingQueue.shift();
        entry.reject(new Error(`AI queue timeout: waited ${MAX_QUEUE_WAIT_MS / 1000}s`));
        continue;
      }

      const waitMs = msUntilNextSlot();
      if (waitMs > 0) {
        console.log(`[AI_QUEUE] Waiting ${waitMs}ms for RPM slot (queue depth: ${pendingQueue.length})`);
        await new Promise((r) => setTimeout(r, Math.min(waitMs, 1000)));
        // Re-check after waiting (loop continues)
        continue;
      }

      // We have a slot — execute
      pendingQueue.shift();
      recordCall();
      const position = 0; // This entry is now executing
      console.log(
        `[AI_QUEUE] Executing entry #${entry.id} (remaining in queue: ${pendingQueue.length})`
      );

      try {
        const result = await entry.factory();
        entry.resolve(result);
      } catch (err) {
        entry.reject(err);
      }
    }
  } finally {
    draining = false;
  }
}

/**
 * Enqueue an AI call. The factory function will be called when an RPM slot is available.
 * Returns a promise that resolves with the factory's result.
 */
export function enqueueAiCall<T>(factory: () => Promise<T>): Promise<T> {
  const id = ++entryIdCounter;
  const position = pendingQueue.length + 1;
  const estimatedWaitSec = estimateWaitSeconds(position);

  console.log(
    `[AI_QUEUE] Enqueued #${id} at position ${position} (est. wait: ${estimatedWaitSec}s, queue depth: ${pendingQueue.length})`
  );

  return new Promise<T>((resolve, reject) => {
    pendingQueue.push({
      id,
      factory,
      resolve,
      reject,
      enqueuedAt: Date.now(),
    });

    // Kick the drain loop (no-op if already running)
    drain().catch((err) => {
      console.error('[AI_QUEUE] Drain loop error:', err);
    });
  });
}

/**
 * Estimate wait time for a given position in the queue.
 */
function estimateWaitSeconds(position: number): number {
  if (position <= 0) return 0;

  pruneWindow();
  const limit = getRpmLimit();
  const currentUsage = callTimestamps.length;
  const availableSlots = Math.max(0, limit - currentUsage);

  if (position <= availableSlots) {
    return 0;
  }

  // Each batch of `limit` requests takes ~60 seconds
  const waitingRequests = position - availableSlots;
  const batchesNeeded = Math.ceil(waitingRequests / limit);
  return batchesNeeded * (60 / limit);
}

/**
 * Get the current queue status (for the /queue-status endpoint).
 */
export function getQueueStatus(): {
  queueLength: number;
  estimatedWaitSec: number;
  rpmLimit: number;
  rpmUsed: number;
} {
  pruneWindow();
  const limit = getRpmLimit();
  const used = callTimestamps.length;
  const queueLength = pendingQueue.length;
  const estimatedWaitSec = estimateWaitSeconds(queueLength);

  return {
    queueLength,
    estimatedWaitSec,
    rpmLimit: limit,
    rpmUsed: used,
  };
}
