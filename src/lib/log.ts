/* One-line structured logs to stdout/stderr (visible in `docker compose logs app`) */

type Extra = Record<string, unknown>;

function line(level: string, scope: string, message: string, extra?: Extra): string {
  return JSON.stringify({
    t: new Date().toISOString(),
    level,
    scope,
    message,
    ...extra,
  });
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const log = {
  info(scope: string, message: string, extra?: Extra) {
    console.log(line("info", scope, message, extra));
  },
  warn(scope: string, message: string, extra?: Extra) {
    console.warn(line("warn", scope, message, extra));
  },
  error(scope: string, message: string, extra?: Extra) {
    console.error(line("error", scope, message, extra));
  },
};
