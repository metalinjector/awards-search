import { incrementMetric } from "./metrics";

export class QueueFullError extends Error {
  constructor() {
    super("Сервис занят. Повторите запрос немного позже.");
    this.name = "QueueFullError";
  }
}

interface PendingTask<T> {
  operation: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

class TaskQueue {
  private active = 0;
  private readonly pending: PendingTask<unknown>[] = [];

  constructor(
    private readonly concurrency: number,
    private readonly maxPending: number,
  ) {}

  run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active < this.concurrency) return this.start(operation);
    if (this.pending.length >= this.maxPending) {
      incrementMetric("external_queue_rejected_total");
      return Promise.reject(new QueueFullError());
    }
    incrementMetric("external_queue_queued_total");
    return new Promise<T>((resolve, reject) => {
      this.pending.push({ operation, resolve, reject } as PendingTask<unknown>);
    });
  }

  snapshot() {
    return { active: this.active, pending: this.pending.length };
  }

  private async start<T>(operation: () => Promise<T>): Promise<T> {
    this.active += 1;
    incrementMetric("external_queue_started_total");
    try {
      return await operation();
    } finally {
      this.active -= 1;
      this.drain();
    }
  }

  private drain(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const next = this.pending.shift();
      if (!next) return;
      void this.start(next.operation).then(next.resolve, next.reject);
    }
  }
}

const globalForQueue = globalThis as typeof globalThis & {
  __awardsExternalQueue?: TaskQueue;
  __awardsSingleFlights?: Map<string, Promise<unknown>>;
  __awardsLeases?: Map<string, number>;
};

const queue =
  globalForQueue.__awardsExternalQueue ??
  (globalForQueue.__awardsExternalQueue = new TaskQueue(3, 150));
const flights =
  globalForQueue.__awardsSingleFlights ??
  (globalForQueue.__awardsSingleFlights = new Map());
const leases =
  globalForQueue.__awardsLeases ??
  (globalForQueue.__awardsLeases = new Map());

export function runExternalTask<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const existing = flights.get(key);
  if (existing) {
    incrementMetric("external_singleflight_joined_total");
    return existing as Promise<T>;
  }
  const promise = queue.run(operation).finally(() => flights.delete(key));
  flights.set(key, promise);
  return promise;
}

export function externalQueueSnapshot() {
  return {
    ...queue.snapshot(),
    singleFlights: flights.size,
    leases: Object.fromEntries(leases),
  };
}

export function acquireLease(name: string, limit: number): (() => void) | null {
  const active = leases.get(name) ?? 0;
  if (active >= limit) return null;
  leases.set(name, active + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = Math.max(0, (leases.get(name) ?? 1) - 1);
    if (remaining === 0) leases.delete(name);
    else leases.set(name, remaining);
  };
}
