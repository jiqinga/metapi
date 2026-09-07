import { AsyncLocalStorage } from 'node:async_hooks';
import {
  Agent,
  RetryAgent,
  setGlobalDispatcher,
  fetch as undiciFetch,
  type Dispatcher,
  type RequestInfo as UndiciRequestInfo,
  type RequestInit as UndiciRequestInit,
  type Response as UndiciResponse,
} from 'undici';
import { config } from './config.js';

/**
 * Centralised outbound HTTP treatment. Two problems this module fixes:
 *
 * 1. Intermittent timeouts where a manual `curl` from inside the container
 *    always succeeds. Root cause: Node's global fetch pools keep-alive
 *    connections; when an upstream (or an intermediary nginx/LB/CDN) closes an
 *    idle socket, undici can hand a request to that half-closed socket and the
 *    request hangs until some timeout fires. `curl` opens a fresh connection
 *    every time, so it never hits a stale pooled socket. The fix is a global
 *    RetryAgent that transparently retries idempotent requests (GET/HEAD/...)
 *    on socket-level errors (UND_ERR_SOCKET / ECONNRESET / ...). POST is never
 *    retried by RetryAgent's defaults, so proxy forwarding stays safe.
 *
 * 2. Timeouts that don't abort the underlying request (the old
 *    `Promise.race`-based helper), leaking sockets that keep running in the
 *    background. `withRequestDeadline` + `outboundFetch` attach a real
 *    AbortSignal so a timeout actually cancels the socket.
 */

// Deadline signal carried implicitly across the async call chain, so callers
// deep in an adapter (base.fetchJson) inherit a caller's timeout without
// threading a `signal` argument through every method.
const deadlineStore = new AsyncLocalStorage<AbortSignal>();

let installed = false;

function buildOutboundAgent(): Agent {
  const c = config.outboundHttp;
  return new Agent({
    keepAliveTimeout: c.keepAliveTimeoutMs,
    keepAliveMaxTimeout: c.keepAliveMaxTimeoutMs,
    connect: { timeout: c.connectTimeoutMs },
    headersTimeout: c.headersTimeoutMs,
    // 0 disables the body timeout so long-lived SSE / streaming forwards are
    // never cut mid-stream. Per-request deadlines bound non-streaming calls.
    bodyTimeout: c.bodyTimeoutMs,
  });
}

/**
 * Install the process-wide dispatcher. Call once, before any outbound fetch.
 * A RetryAgent wrapping a tuned Agent: idempotent requests self-heal from
 * stale-pooled-socket errors; non-idempotent POST forwarding is untouched.
 */
export function installGlobalOutboundDispatcher(): void {
  if (installed) return;
  installed = true;
  const dispatcher: Dispatcher = new RetryAgent(buildOutboundAgent(), {
    maxRetries: config.outboundHttp.retryMaxRetries,
    minTimeout: 200,
    maxTimeout: 1_000,
    timeoutFactor: 2,
    // Retry ONLY on connection/socket errors (default errorCodes include
    // UND_ERR_SOCKET / ECONNRESET — the stale-pooled-socket case). Disable
    // status-based retries so the proxy-forward path's behaviour on upstream
    // 5xx/429 is unchanged. Default methods stay idempotent-only (no POST).
    statusCodes: [],
  });
  setGlobalDispatcher(dispatcher);
  const c = config.outboundHttp;
  console.log(
    `[httpClient] global outbound dispatcher installed `
    + `(retry=${c.retryMaxRetries}, keepAlive=${c.keepAliveTimeoutMs}ms, `
    + `connect=${c.connectTimeoutMs}ms, deadline=${c.requestDeadlineMs}ms)`,
  );
}

/**
 * Run `fn` with an ambient abort deadline. Any `outboundFetch` executed inside
 * `fn` (directly or nested) inherits the signal and is aborted when it fires.
 */
export function withRequestDeadline<T>(timeoutMs: number, fn: () => Promise<T>): Promise<T> {
  if (!(timeoutMs > 0)) return fn();
  return deadlineStore.run(AbortSignal.timeout(timeoutMs), fn);
}

function mergeSignals(explicit?: AbortSignal | null): AbortSignal | undefined {
  const ambient = deadlineStore.getStore();
  const list = [explicit, ambient].filter((s): s is AbortSignal => !!s);
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  return AbortSignal.any(list);
}

/**
 * Drop-in replacement for `fetch` on outbound calls. Attaches the ambient
 * deadline signal (and, when none is in scope and the caller didn't set one, a
 * bounded default deadline so management calls can't hang forever). Leaves the
 * dispatcher alone — the global RetryAgent handles socket-error retries, and a
 * caller-supplied proxy dispatcher (via init.dispatcher) still wins.
 */
export async function outboundFetch(
  url: UndiciRequestInfo,
  init?: UndiciRequestInit,
  opts?: { timeoutMs?: number },
): Promise<UndiciResponse> {
  const explicit = (init?.signal ?? undefined) as AbortSignal | undefined;
  const hasDeadline = !!deadlineStore.getStore() || !!explicit;
  const timeoutMs = opts?.timeoutMs ?? (hasDeadline ? 0 : config.outboundHttp.requestDeadlineMs);
  const run = (): Promise<UndiciResponse> => {
    const signal = mergeSignals(explicit);
    return undiciFetch(url, signal ? { ...init, signal } : init);
  };
  return timeoutMs > 0 ? withRequestDeadline(timeoutMs, run) : run();
}
