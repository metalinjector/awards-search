export type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

function safeFields(fields: LogFields): LogFields {
  const result: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (/token|secret|password|authorization|api.?key/i.test(key)) {
      result[key] = "[redacted]";
    } else if (value instanceof Error) {
      result[key] = { name: value.name, message: value.message };
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function logEvent(
  level: LogLevel,
  event: string,
  fields: LogFields = {},
): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...safeFields(fields),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
