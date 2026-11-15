interface MetricState {
  counters: Map<string, number>;
  durations: Map<string, { count: number; totalMs: number; maxMs: number }>;
  startedAt: number;
}

const globalForMetrics = globalThis as typeof globalThis & {
  __awardsMetrics?: MetricState;
};

const state =
  globalForMetrics.__awardsMetrics ??
  (globalForMetrics.__awardsMetrics = {
    counters: new Map(),
    durations: new Map(),
    startedAt: Date.now(),
  });

export function incrementMetric(name: string, amount = 1): void {
  state.counters.set(name, (state.counters.get(name) ?? 0) + amount);
}

export function observeDuration(name: string, durationMs: number): void {
  const current = state.durations.get(name) ?? { count: 0, totalMs: 0, maxMs: 0 };
  current.count += 1;
  current.totalMs += durationMs;
  current.maxMs = Math.max(current.maxMs, durationMs);
  state.durations.set(name, current);
}

export async function observeOperation<T>(
  name: string,
  operation: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  incrementMetric(`${name}_started_total`);
  try {
    const result = await operation();
    incrementMetric(`${name}_success_total`);
    return result;
  } catch (error) {
    incrementMetric(`${name}_error_total`);
    throw error;
  } finally {
    observeDuration(name, performance.now() - started);
  }
}

export function metricsSnapshot() {
  return {
    uptimeSeconds: Math.floor((Date.now() - state.startedAt) / 1000),
    counters: Object.fromEntries([...state.counters.entries()].sort()),
    durations: Object.fromEntries(
      [...state.durations.entries()].sort().map(([name, value]) => [
        name,
        {
          count: value.count,
          averageMs: value.count ? Math.round(value.totalMs / value.count) : 0,
          maxMs: Math.round(value.maxMs),
        },
      ]),
    ),
  };
}
