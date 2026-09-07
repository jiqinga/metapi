import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

type DbModule = typeof import('../../db/index.js');

describe('sites query endpoint — search + pagination', () => {
  let app: FastifyInstance;
  let db: DbModule['db'];
  let schema: DbModule['schema'];
  let closeDbConnections: DbModule['closeDbConnections'] | undefined;
  let dataDir = '';
  let previousDataDir: string | undefined;

  beforeAll(async () => {
    previousDataDir = process.env.DATA_DIR;
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-sites-query-'));
    process.env.DATA_DIR = dataDir;

    await import('../../db/migrate.js');
    const dbModule = await import('../../db/index.js');
    const routesModule = await import('./sites.js');
    db = dbModule.db;
    schema = dbModule.schema;
    closeDbConnections = dbModule.closeDbConnections;

    app = Fastify();
    await app.register(routesModule.sitesRoutes);
  });

  beforeEach(async () => {
    await db.delete(schema.accounts).run();
    await db.delete(schema.sites).run();
  });

  afterAll(async () => {
    await app.close();
    if (typeof closeDbConnections === 'function') {
      await closeDbConnections();
    }
    if (previousDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = previousDataDir;
    }
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function insertSites(names: Array<{ name: string; url?: string; platform?: string }>) {
    for (const entry of names) {
      await db.insert(schema.sites).values({
        name: entry.name,
        url: entry.url || `https://${entry.name.toLowerCase().replace(/\s+/g, '-')}.example.com`,
        platform: entry.platform || 'new-api',
      }).run();
    }
  }

  it('returns paginated sites with total count and page metadata', async () => {
    await insertSites([
      { name: 'Alpha' },
      { name: 'Beta' },
      { name: 'Gamma' },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/sites/query?limit=2&offset=0',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(3);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(2);
    // ordered by id ascending
    expect(body.items[0].name).toBe('Alpha');
    expect(body.items[1].name).toBe('Beta');
  });

  it('returns second page when offset is provided', async () => {
    await insertSites([
      { name: 'Alpha' },
      { name: 'Beta' },
      { name: 'Gamma' },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/sites/query?limit=2&offset=2',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(3);
    expect(body.page).toBe(2);
    expect(body.items[0].name).toBe('Gamma');
  });

  it('filters sites by search keyword on name (case-insensitive)', async () => {
    await insertSites([
      { name: 'OpenAI Proxy' },
      { name: 'Claude Proxy' },
      { name: 'Gemini Gateway' },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/sites/query?search=proxy&limit=50&offset=0',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.items.some((s: any) => s.name === 'OpenAI Proxy')).toBe(true);
    expect(body.items.some((s: any) => s.name === 'Claude Proxy')).toBe(true);
  });

  it('filters sites by search keyword on platform', async () => {
    await insertSites([
      { name: 'Site A', platform: 'new-api' },
      { name: 'Site B', platform: 'sub2api' },
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/sites/query?search=sub2api&limit=50&offset=0',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].name).toBe('Site B');
  });

  it('returns empty items when search does not match', async () => {
    await insertSites([{ name: 'Alpha' }]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/sites/query?search=nonexistent&limit=50&offset=0',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  it('enriches query results with apiEndpoints and totalBalance', async () => {
    const site = await db.insert(schema.sites).values({
      name: 'Enriched Site',
      url: 'https://enriched.example.com',
      platform: 'new-api',
    }).returning().get();

    await db.insert(schema.accounts).values({
      siteId: site.id,
      username: 'rich-user',
      accessToken: 'token',
      balance: 42.5,
      status: 'active',
    }).run();

    const response = await app.inject({
      method: 'GET',
      url: '/api/sites/query?search=enriched&limit=50&offset=0',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].name).toBe('Enriched Site');
    expect(body.items[0].totalBalance).toBe(42.5);
    expect(Array.isArray(body.items[0].apiEndpoints)).toBe(true);
  });
});
