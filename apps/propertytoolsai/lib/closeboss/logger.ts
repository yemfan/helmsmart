export function closebossLog(
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, any>
) {
  const payload = {
    ts: new Date().toISOString(),
    // Log-filter value, left as-is: dashboards and alerts may select on it.
    scope: "leadsmart",
    level,
    message,
    ...(meta ?? {}),
  };
  if (level === "error") console.error(JSON.stringify(payload));
  else if (level === "warn") console.warn(JSON.stringify(payload));
  else console.log(JSON.stringify(payload));
}
