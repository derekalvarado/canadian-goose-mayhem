export const MAX_SIGNAL_MESSAGES_PER_SOCKET = 8;

function isPrivateDevelopmentOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.origin !== origin || url.protocol !== "http:") return false;
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]"
      || /^192\.168\./u.test(url.hostname)
      || /^10\./u.test(url.hostname)
      || /^172\.(?:1[6-9]|2\d|3[01])\./u.test(url.hostname);
  } catch { return false; }
}

/** Browser-origin policy. This is defense in depth; room capabilities remain the authentication. */
export function allowedSignalingOrigin(origin: string | null, configuredOrigins: string): string | undefined {
  if (!origin) return undefined;
  const configured = configuredOrigins.split(",").map((value) => value.trim()).filter(Boolean);
  return configured.includes(origin) || isPrivateDevelopmentOrigin(origin) ? origin : undefined;
}

/** Returns the next bounded count, or undefined when a socket has exhausted its signaling budget. */
export function nextSignalingMessageCount(current: unknown): number | undefined {
  if (typeof current !== "number" || !Number.isSafeInteger(current) || current < 0) return undefined;
  const next = current + 1;
  return next <= MAX_SIGNAL_MESSAGES_PER_SOCKET ? next : undefined;
}
