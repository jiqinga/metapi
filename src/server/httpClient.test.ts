import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { getGlobalDispatcher, RetryAgent } from 'undici';
import {
  installGlobalOutboundDispatcher,
  outboundFetch,
  withRequestDeadline,
} from './httpClient.js';

function listen(server: Server): Promise<number> {
  server.listen(0);
  return once(server, 'listening').then(() => (server.address() as { port: number }).port);
}

describe('httpClient', () => {
  const servers: Server[] = [];

  beforeAll(() => {
    installGlobalOutboundDispatcher();
  });

  afterAll(() => {
    for (const s of servers) s.close();
  });

  it('installs a RetryAgent as the global dispatcher', () => {
    expect(getGlobalDispatcher()).toBeInstanceOf(RetryAgent);
  });

  it('outboundFetch resolves a normal JSON response', async () => {
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });
    servers.push(server);
    const port = await listen(server);

    const res = await outboundFetch(`http://127.0.0.1:${port}/`);
    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('withRequestDeadline aborts a hanging request instead of leaking it', async () => {
    // Server that accepts the request but never responds.
    const server = createServer(() => { /* intentionally no response */ });
    servers.push(server);
    const port = await listen(server);

    const start = Date.now();
    await expect(
      withRequestDeadline(200, () => outboundFetch(`http://127.0.0.1:${port}/`)),
    ).rejects.toThrow();
    // Aborted near the deadline, not hung until some 5-minute default.
    expect(Date.now() - start).toBeLessThan(3_000);
  });

  it('retries an idempotent GET when the pooled socket is reset (root-cause fix)', async () => {
    // Reproduces the stale-keep-alive failure: first connection is destroyed
    // before responding (UND_ERR_SOCKET / ECONNRESET); the RetryAgent must
    // transparently retry on a fresh connection and succeed.
    let connections = 0;
    const server = createServer((_req, res) => {
      res.end(JSON.stringify({ ok: true }));
    });
    server.on('connection', (socket) => {
      connections += 1;
      if (connections === 1) socket.destroy();
    });
    servers.push(server);
    const port = await listen(server);

    const res = await outboundFetch(`http://127.0.0.1:${port}/`);
    expect(res.ok).toBe(true);
    expect(connections).toBeGreaterThanOrEqual(2);
  });
});
