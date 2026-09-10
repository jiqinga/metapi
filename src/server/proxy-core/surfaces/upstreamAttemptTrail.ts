export type SurfaceUpstreamAttemptTrailEntry = {
  endpoint: string;
  path: string;
  status: number;
  message: string;
};

const MAX_UPSTREAM_ATTEMPT_TRAIL_ENTRIES = 12;
const MAX_UPSTREAM_ATTEMPT_TRAIL_MESSAGE_LENGTH = 240;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Endpoint fallback swallows intermediate upstream attempts, so the terminal
 * error a client sees is the last candidate's failure. Trusted tester requests
 * get the full attempt chain attached so the playground can show what actually
 * happened across candidates and channel retries.
 */
export function attachUpstreamAttemptTrailForTester(
  payload: unknown,
  options: { isTesterRequest: boolean; attempts: readonly SurfaceUpstreamAttemptTrailEntry[] },
): unknown {
  if (!options.isTesterRequest || options.attempts.length === 0) return payload;
  if (!isRecord(payload)) return payload;
  return {
    ...payload,
    upstreamAttempts: options.attempts
      .slice(0, MAX_UPSTREAM_ATTEMPT_TRAIL_ENTRIES)
      .map((attempt) => ({
        endpoint: attempt.endpoint,
        path: attempt.path,
        status: attempt.status,
        message: attempt.message.slice(0, MAX_UPSTREAM_ATTEMPT_TRAIL_MESSAGE_LENGTH),
      })),
  };
}
