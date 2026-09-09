import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { connect as connectSocket, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type DbModule = typeof import('../db/index.js');

// Minimal HTTP forward proxy. undici's ProxyAgent tunnels every request
// (http targets included) via CONNECT, so the proxy must accept the
// 'connect' event and splice raw sockets through to the destination.
function createForwardProxy() {
  const seenRequests: string[] = [];
  const server = createServer();
  server.on('connect', (req: IncomingMessage, clientSocket: Socket, head: Buffer) => {
    seenRequests.push(`CONNECT ${req.url}`);
    const [host, port] = (req.url || '').split(':');
    const upstream = connectSocket(Number(port || 80), host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstream.destroy());
  });
  return { server, seenRequests };
}

// Target that answers 404 for everything so no platform adapter matches and
// every probe (title hint + adapter.detect) must traverse the whole chain.
function createTargetServer() {
  const server = createServer((_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
  return server;
}

function listenPort(server: Server): number {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine server address');
  }
  return address.port;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

describe('siteDetector proxy handling', () => {
  let db: DbModule['db'];
  let schema: DbModule['schema'];
  let dataDir = '';
  let targetServer: Server;
  let targetPort = 0;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-site-detector-'));
    process.env.DATA_DIR = dataDir;
    await import('../db/migrate.js');
    const dbModule = await import('../db/index.js');
    db = dbModule.db;
    schema = dbModule.schema;
    targetServer = createTargetServer();
    targetServer.listen(0, '127.0.0.1');
    await once(targetServer, 'listening');
    targetPort = listenPort(targetServer);
  });

  beforeEach(async () => {
    await db.delete(schema.accounts).run();
    await db.delete(schema.settings).run();
    await db.delete(schema.sites).run();
    const { invalidateSiteProxyCache } = await import('./siteProxy.js');
    invalidateSiteProxyCache();
  });

  afterAll(async () => {
    await closeServer(targetServer);
    delete process.env.DATA_DIR;
  });

  it('routes detect probes through the caller-supplied proxy even when the site is not persisted yet', async () => {
    const proxy = createForwardProxy();
    proxy.server.listen(0, '127.0.0.1');
    await once(proxy.server, 'listening');
    const proxyPort = listenPort(proxy.server);

    try {
      const { detectSite } = await import('./siteDetector.js');
      const result = await detectSite(`http://127.0.0.1:${targetPort}/`, {
        proxyUrl: `http://127.0.0.1:${proxyPort}`,
      });

      expect(result).toBeNull();
      expect(proxy.seenRequests.length).toBeGreaterThan(0);
    } finally {
      await closeServer(proxy.server);
    }
  });

  it('routes detect probes through the system proxy when useSystemProxy is requested', async () => {
    const proxy = createForwardProxy();
    proxy.server.listen(0, '127.0.0.1');
    await once(proxy.server, 'listening');
    const proxyPort = listenPort(proxy.server);

    // config.systemProxyUrl is the runtime source of truth (env-seeded and
    // kept in sync by the settings API); the settings row is its persistence.
    const config = (await import('../config.js')).config;
    const previousSystemProxyUrl = config.systemProxyUrl;
    config.systemProxyUrl = `http://127.0.0.1:${proxyPort}`;
    await db.insert(schema.settings).values({
      key: 'system_proxy_url',
      value: JSON.stringify(`http://127.0.0.1:${proxyPort}`),
    }).run();

    try {
      const { detectSite } = await import('./siteDetector.js');
      const result = await detectSite(`http://127.0.0.1:${targetPort}/`, {
        useSystemProxy: true,
      });

      expect(result).toBeNull();
      expect(proxy.seenRequests.length).toBeGreaterThan(0);
    } finally {
      config.systemProxyUrl = previousSystemProxyUrl;
      await closeServer(proxy.server);
    }
  });

  it('connects directly when no proxy is configured', async () => {
    const proxy = createForwardProxy();
    proxy.server.listen(0, '127.0.0.1');
    await once(proxy.server, 'listening');

    try {
      const { detectSite } = await import('./siteDetector.js');
      const result = await detectSite(`http://127.0.0.1:${targetPort}/`);

      expect(result).toBeNull();
      expect(proxy.seenRequests).toHaveLength(0);
    } finally {
      await closeServer(proxy.server);
    }
  });
});
