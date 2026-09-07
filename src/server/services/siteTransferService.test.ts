import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';

type DbModule = typeof import('../db/index.js');
type ServiceModule = typeof import('./siteTransferService.js');

let db: DbModule['db'];
let schema: DbModule['schema'];
let exportSites: ServiceModule['exportSites'];
let importSites: ServiceModule['importSites'];
let previewSiteImport: ServiceModule['previewSiteImport'];
let dataDir = '';

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'metapi-site-transfer-service-'));
  process.env.DATA_DIR = dataDir;

  await import('../db/migrate.js');
  const dbModule = await import('../db/index.js');
  const serviceModule = await import('./siteTransferService.js');

  db = dbModule.db;
  schema = dbModule.schema;
  exportSites = serviceModule.exportSites;
  importSites = serviceModule.importSites;
  previewSiteImport = serviceModule.previewSiteImport;
});

afterAll(() => {
  delete process.env.DATA_DIR;
});

beforeEach(async () => {
  await db.delete(schema.accountTokens).run();
  await db.delete(schema.accounts).run();
  await db.delete(schema.siteDisabledModels).run();
  await db.delete(schema.siteApiEndpoints).run();
  await db.delete(schema.sites).run();
});

async function insertTestSite(overrides: Partial<{
  name: string;
  url: string;
  platform: string;
  proxyUrl: string | null;
  useSystemProxy: boolean;
  customHeaders: string;
  globalWeight: number;
  externalCheckinUrl: string;
}> = {}) {
  return db.insert(schema.sites).values({
    name: overrides.name ?? 'test-site',
    url: overrides.url ?? 'https://api.example.com',
    platform: overrides.platform ?? 'new-api',
    status: 'active',
    proxyUrl: overrides.proxyUrl ?? null,
    useSystemProxy: overrides.useSystemProxy ?? false,
    customHeaders: overrides.customHeaders ?? null,
    globalWeight: overrides.globalWeight ?? 1,
    externalCheckinUrl: overrides.externalCheckinUrl ?? null,
  }).returning().get();
}

async function insertTestEndpoint(siteId: number, url: string, sortOrder = 0, enabled = true) {
  return db.insert(schema.siteApiEndpoints).values({
    siteId,
    url,
    enabled,
    sortOrder,
  }).returning().get();
}

async function insertTestDisabledModel(siteId: number, modelName: string) {
  return db.insert(schema.siteDisabledModels).values({
    siteId,
    modelName,
  }).returning().get();
}

async function insertTestAccount(siteId: number, overrides: Partial<{
  username: string;
  accessToken: string;
  apiToken: string;
  balance: number;
  status: string;
  oauthProvider: string;
  oauthAccountKey: string;
  extraConfig: string;
}> = {}) {
  return db.insert(schema.accounts).values({
    siteId,
    username: overrides.username ?? 'test-user',
    accessToken: overrides.accessToken ?? 'token-abc123',
    apiToken: overrides.apiToken ?? null,
    balance: overrides.balance ?? 10,
    status: overrides.status ?? 'active',
    oauthProvider: overrides.oauthProvider ?? null,
    oauthAccountKey: overrides.oauthAccountKey ?? null,
    extraConfig: overrides.extraConfig ?? null,
  }).returning().get();
}

async function insertTestToken(accountId: number, overrides: Partial<{
  name: string;
  token: string;
  tokenGroup: string;
  enabled: boolean;
  isDefault: boolean;
}> = {}) {
  return db.insert(schema.accountTokens).values({
    accountId,
    name: overrides.name ?? 'test-token',
    token: overrides.token ?? 'sk-test-token',
    tokenGroup: overrides.tokenGroup ?? null,
    enabled: overrides.enabled ?? true,
    isDefault: overrides.isDefault ?? false,
  }).returning().get();
}

describe('exportSites', () => {
  it('exports an empty structure when no sites exist', async () => {
    const result = await exportSites();
    expect(result.type).toBe('sites');
    expect(result.version).toBe('1.1');
    expect(result.sites).toHaveLength(0);
    expect(result.siteApiEndpoints).toHaveLength(0);
    expect(result.siteDisabledModels).toHaveLength(0);
  });

  it('exports all sites with their endpoints and disabled models', async () => {
    const site1 = await insertTestSite({ name: 'Site A', url: 'https://a.example.com', platform: 'new-api' });
    const site2 = await insertTestSite({ name: 'Site B', url: 'https://b.example.com', platform: 'openai' });
    await insertTestEndpoint(site1.id, 'https://a.example.com/v1', 0, true);
    await insertTestEndpoint(site1.id, 'https://a-backup.example.com/v1', 1, false);
    await insertTestDisabledModel(site1.id, 'gpt-4');
    await insertTestDisabledModel(site1.id, 'claude-3');

    const result = await exportSites();

    expect(result.sites).toHaveLength(2);
    expect(result.sites[0].name).toBe('Site A');
    expect(result.sites[0].url).toBe('https://a.example.com');
    expect(result.sites[0].platform).toBe('new-api');
    expect(result.sites[1].name).toBe('Site B');

    expect(result.siteApiEndpoints).toHaveLength(2);
    expect(result.siteApiEndpoints[0].siteIndex).toBe(0);
    expect(result.siteApiEndpoints[0].url).toBe('https://a.example.com/v1');
    expect(result.siteApiEndpoints[0].enabled).toBe(true);
    expect(result.siteApiEndpoints[1].siteIndex).toBe(0);
    expect(result.siteApiEndpoints[1].url).toBe('https://a-backup.example.com/v1');
    expect(result.siteApiEndpoints[1].enabled).toBe(false);

    expect(result.siteDisabledModels).toHaveLength(2);
    expect(result.siteDisabledModels[0].siteIndex).toBe(0);
    expect(result.siteDisabledModels[0].modelName).toBe('claude-3');
    expect(result.siteDisabledModels[1].siteIndex).toBe(0);
    expect(result.siteDisabledModels[1].modelName).toBe('gpt-4');
  });

  it('exports only selected sites by ids', async () => {
    const site1 = await insertTestSite({ name: 'Keep', url: 'https://keep.example.com' });
    const site2 = await insertTestSite({ name: 'Skip', url: 'https://skip.example.com' });
    await insertTestEndpoint(site1.id, 'https://keep.example.com/v1');
    await insertTestEndpoint(site2.id, 'https://skip.example.com/v1');

    const result = await exportSites([site1.id]);

    expect(result.sites).toHaveLength(1);
    expect(result.sites[0].name).toBe('Keep');
    expect(result.siteApiEndpoints).toHaveLength(1);
    expect(result.siteApiEndpoints[0].url).toBe('https://keep.example.com/v1');
  });
});

describe('importSites', () => {
  it('creates new sites from import data', async () => {
    const data = {
      version: '1.0',
      type: 'sites',
      timestamp: Date.now(),
      sites: [
        { name: 'Imported A', url: 'https://imported-a.example.com', platform: 'new-api', globalWeight: 2 },
        { name: 'Imported B', url: 'https://imported-b.example.com', platform: 'openai' },
      ],
      siteApiEndpoints: [
        { siteIndex: 0, url: 'https://imported-a.example.com/v1', enabled: true, sortOrder: 0 },
      ],
      siteDisabledModels: [
        { siteIndex: 0, modelName: 'gpt-4' },
      ],
    };

    const result = await importSites(data);

    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    const sites = await db.select().from(schema.sites).all();
    expect(sites).toHaveLength(2);
    expect(sites[0].name).toBe('Imported A');
    expect(sites[0].globalWeight).toBe(2);
    expect(sites[1].name).toBe('Imported B');

    const endpoints = await db.select().from(schema.siteApiEndpoints).all();
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].url).toBe('https://imported-a.example.com/v1');
    expect(endpoints[0].enabled).toBe(true);

    const disabled = await db.select().from(schema.siteDisabledModels).all();
    expect(disabled).toHaveLength(1);
    expect(disabled[0].modelName).toBe('gpt-4');
  });

  it('updates existing sites matched by platform + url', async () => {
    await insertTestSite({ name: 'Original', url: 'https://update.example.com', platform: 'new-api', proxyUrl: null });

    const data = {
      version: '1.0',
      type: 'sites',
      timestamp: Date.now(),
      sites: [
        { name: 'Updated Name', url: 'https://update.example.com', platform: 'new-api', proxyUrl: 'https://proxy.local:8080' },
      ],
      siteApiEndpoints: [],
      siteDisabledModels: [],
    };

    const result = await importSites(data);

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(0);

    const sites = await db.select().from(schema.sites).all();
    expect(sites).toHaveLength(1);
    expect(sites[0].name).toBe('Updated Name');
    expect(sites[0].proxyUrl).toBe('https://proxy.local:8080');
  });

  it('replaces endpoints and disabled models on update', async () => {
    const site = await insertTestSite({ name: 'Existing', url: 'https://replace.example.com', platform: 'new-api' });
    await insertTestEndpoint(site.id, 'https://old.example.com/v1', 0, true);
    await insertTestDisabledModel(site.id, 'old-model');

    const data = {
      version: '1.0',
      type: 'sites',
      timestamp: Date.now(),
      sites: [
        { name: 'Existing', url: 'https://replace.example.com', platform: 'new-api' },
      ],
      siteApiEndpoints: [
        { siteIndex: 0, url: 'https://new.example.com/v1', enabled: true, sortOrder: 0 },
      ],
      siteDisabledModels: [
        { siteIndex: 0, modelName: 'new-model' },
      ],
    };

    await importSites(data);

    const endpoints = await db.select().from(schema.siteApiEndpoints).all();
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].url).toBe('https://new.example.com/v1');

    const disabled = await db.select().from(schema.siteDisabledModels).all();
    expect(disabled).toHaveLength(1);
    expect(disabled[0].modelName).toBe('new-model');
  });

  it('clears endpoints when import provides none for the site', async () => {
    const site = await insertTestSite({ name: 'Clear', url: 'https://clear.example.com', platform: 'new-api' });
    await insertTestEndpoint(site.id, 'https://old.example.com/v1');

    const data = {
      version: '1.0',
      type: 'sites',
      timestamp: Date.now(),
      sites: [
        { name: 'Clear', url: 'https://clear.example.com', platform: 'new-api' },
      ],
      siteApiEndpoints: [],
      siteDisabledModels: [],
    };

    await importSites(data);

    const endpoints = await db.select().from(schema.siteApiEndpoints).all();
    expect(endpoints).toHaveLength(0);
  });

  it('handles errors gracefully for individual sites', async () => {
    const data = {
      version: '1.0',
      type: 'sites',
      timestamp: Date.now(),
      sites: [
        { name: '', url: '', platform: 'new-api' },
        { name: 'Valid', url: 'https://valid.example.com', platform: 'new-api' },
      ],
      siteApiEndpoints: [],
      siteDisabledModels: [],
    };

    const result = await importSites(data);

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('缺少必填字段');
  });

  it('imports from full backup format (accounts.sites)', async () => {
    const data = {
      version: '2.1',
      timestamp: Date.now(),
      accounts: {
        sites: [
          { name: 'From Backup', url: 'https://backup.example.com', platform: 'new-api' },
        ],
        siteApiEndpoints: [
          { siteIndex: 0, url: 'https://backup.example.com/v1', enabled: true, sortOrder: 0 },
        ],
        siteDisabledModels: [
          { siteIndex: 0, modelName: 'disabled-from-backup' },
        ],
        accounts: [],
        accountTokens: [],
        tokenRoutes: [],
        routeChannels: [],
      },
    };

    const result = await importSites(data);

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);

    const sites = await db.select().from(schema.sites).all();
    expect(sites).toHaveLength(1);
    expect(sites[0].name).toBe('From Backup');

    const endpoints = await db.select().from(schema.siteApiEndpoints).all();
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].url).toBe('https://backup.example.com/v1');

    const disabled = await db.select().from(schema.siteDisabledModels).all();
    expect(disabled).toHaveLength(1);
    expect(disabled[0].modelName).toBe('disabled-from-backup');
  });

  it('throws on non-object input', async () => {
    await expect(importSites('not an object')).rejects.toThrow('JSON 对象');
    await expect(importSites([1, 2, 3])).rejects.toThrow('JSON 对象');
  });

  it('returns empty result when no sites in data', async () => {
    const result = await importSites({ version: '1.0', sites: [], siteApiEndpoints: [], siteDisabledModels: [] });
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('round-trips export then import', async () => {
    const site = await insertTestSite({
      name: 'Round Trip',
      url: 'https://roundtrip.example.com',
      platform: 'openai',
      proxyUrl: 'https://proxy.local:1080',
      useSystemProxy: true,
      customHeaders: '{"X-Custom":"value"}',
      globalWeight: 5,
      externalCheckinUrl: 'https://checkin.example.com',
    });
    await insertTestEndpoint(site.id, 'https://roundtrip.example.com/v1', 0, true);
    await insertTestEndpoint(site.id, 'https://backup.example.com/v1', 1, false);
    await insertTestDisabledModel(site.id, 'gpt-3.5');
    await insertTestDisabledModel(site.id, 'text-davinci');

    const exported = await exportSites();
    await db.delete(schema.siteDisabledModels).run();
    await db.delete(schema.siteApiEndpoints).run();
    await db.delete(schema.sites).run();

    const result = await importSites(exported);

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);

    const sites = await db.select().from(schema.sites).all();
    expect(sites).toHaveLength(1);
    expect(sites[0].name).toBe('Round Trip');
    expect(sites[0].platform).toBe('openai');
    expect(sites[0].proxyUrl).toBe('https://proxy.local:1080');
    expect(sites[0].useSystemProxy).toBe(true);
    expect(sites[0].customHeaders).toBe('{"X-Custom":"value"}');
    expect(sites[0].globalWeight).toBe(5);
    expect(sites[0].externalCheckinUrl).toBe('https://checkin.example.com');

    const endpoints = await db.select().from(schema.siteApiEndpoints).all();
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0].url).toBe('https://roundtrip.example.com/v1');
    expect(endpoints[0].enabled).toBe(true);
    expect(endpoints[1].url).toBe('https://backup.example.com/v1');
    expect(endpoints[1].enabled).toBe(false);

    const disabled = await db.select().from(schema.siteDisabledModels).all();
    expect(disabled).toHaveLength(2);
    expect(disabled.map((d: { modelName: string }) => d.modelName).sort()).toEqual(['gpt-3.5', 'text-davinci']);
  });
});

describe('exportSites with connections', () => {
  it('does not export accounts when includeConnections is false', async () => {
    const site = await insertTestSite({ name: 'With Accounts', url: 'https://conn.example.com' });
    await insertTestAccount(site.id, { accessToken: 'secret-token-1' });

    const result = await exportSites();

    expect(result.accounts).toBeUndefined();
    expect(result.accountTokens).toBeUndefined();
  });

  it('exports accounts and tokens when includeConnections is true', async () => {
    const site = await insertTestSite({ name: 'With Accounts', url: 'https://conn.example.com' });
    const account = await insertTestAccount(site.id, {
      accessToken: 'secret-token-1',
      username: 'user1',
      balance: 50,
    });
    await insertTestToken(account.id, { name: 'tok1', token: 'sk-aaa' });
    await insertTestToken(account.id, { name: 'tok2', token: 'sk-bbb' });

    const result = await exportSites(undefined, true);

    expect(result.accounts).toHaveLength(1);
    expect(result.accounts![0].siteIndex).toBe(0);
    expect(result.accounts![0].accessToken).toBe('secret-token-1');
    expect(result.accounts![0].username).toBe('user1');
    expect(result.accounts![0].balance).toBe(50);

    expect(result.accountTokens).toHaveLength(2);
    expect(result.accountTokens![0].accountIndex).toBe(0);
    expect(result.accountTokens![0].name).toBe('tok1');
    expect(result.accountTokens![0].token).toBe('sk-aaa');
    expect(result.accountTokens![1].name).toBe('tok2');
    expect(result.accountTokens![1].token).toBe('sk-bbb');
  });

  it('exports connections only for selected sites', async () => {
    const site1 = await insertTestSite({ name: 'Site 1', url: 'https://s1.example.com' });
    const site2 = await insertTestSite({ name: 'Site 2', url: 'https://s2.example.com' });
    await insertTestAccount(site1.id, { accessToken: 'tok-s1' });
    await insertTestAccount(site2.id, { accessToken: 'tok-s2' });

    const result = await exportSites([site1.id], true);

    expect(result.accounts).toHaveLength(1);
    expect(result.accounts![0].accessToken).toBe('tok-s1');
  });
});

describe('importSites with connections', () => {
  it('creates new accounts and tokens on import', async () => {
    const data = {
      version: '1.1',
      type: 'sites',
      timestamp: Date.now(),
      sites: [
        { name: 'Conn Site', url: 'https://conn-import.example.com', platform: 'new-api' },
      ],
      siteApiEndpoints: [],
      siteDisabledModels: [],
      accounts: [
        { siteIndex: 0, username: 'imported-user', accessToken: 'imported-token', balance: 20, status: 'active' },
      ],
      accountTokens: [
        { accountIndex: 0, name: 'imported-tok', token: 'sk-imported' },
      ],
    };

    const result = await importSites(data);

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(0);

    const accounts = await db.select().from(schema.accounts).all();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].username).toBe('imported-user');
    expect(accounts[0].accessToken).toBe('imported-token');
    expect(accounts[0].balance).toBe(20);

    const tokens = await db.select().from(schema.accountTokens).all();
    expect(tokens).toHaveLength(1);
    expect(tokens[0].name).toBe('imported-tok');
    expect(tokens[0].token).toBe('sk-imported');
  });

  it('updates existing account matched by siteId + accessToken', async () => {
    const site = await insertTestSite({ name: 'Existing', url: 'https://update-conn.example.com', platform: 'new-api' });
    await insertTestAccount(site.id, {
      accessToken: 'same-token',
      username: 'old-name',
      balance: 5,
    });

    const data = {
      version: '1.1',
      type: 'sites',
      timestamp: Date.now(),
      sites: [
        { name: 'Existing', url: 'https://update-conn.example.com', platform: 'new-api' },
      ],
      siteApiEndpoints: [],
      siteDisabledModels: [],
      accounts: [
        { siteIndex: 0, username: 'new-name', accessToken: 'same-token', balance: 99, status: 'active' },
      ],
      accountTokens: [],
    };

    const result = await importSites(data);

    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);

    const accounts = await db.select().from(schema.accounts).all();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].username).toBe('new-name');
    expect(accounts[0].balance).toBe(99);
  });

  it('does not duplicate tokens on re-import', async () => {
    const data = {
      version: '1.1',
      type: 'sites',
      timestamp: Date.now(),
      sites: [
        { name: 'Token Site', url: 'https://tok-import.example.com', platform: 'new-api' },
      ],
      siteApiEndpoints: [],
      siteDisabledModels: [],
      accounts: [
        { siteIndex: 0, username: 'user', accessToken: 'tok-unique', balance: 0, status: 'active' },
      ],
      accountTokens: [
        { accountIndex: 0, name: 'my-tok', token: 'sk-unique' },
      ],
    };

    await importSites(data);
    await importSites(data);

    const accounts = await db.select().from(schema.accounts).all();
    expect(accounts).toHaveLength(1);

    const tokens = await db.select().from(schema.accountTokens).all();
    expect(tokens).toHaveLength(1);
    expect(tokens[0].token).toBe('sk-unique');
  });

  it('round-trips export then import with connections', async () => {
    const site = await insertTestSite({
      name: 'Round Trip Conn',
      url: 'https://rt-conn.example.com',
      platform: 'new-api',
    });
    const account = await insertTestAccount(site.id, {
      accessToken: 'rt-token',
      username: 'rt-user',
      balance: 42,
    });
    await insertTestToken(account.id, { name: 'rt-tok', token: 'sk-rt' });

    const exported = await exportSites(undefined, true);

    // Wipe all
    await db.delete(schema.accountTokens).run();
    await db.delete(schema.accounts).run();
    await db.delete(schema.siteDisabledModels).run();
    await db.delete(schema.siteApiEndpoints).run();
    await db.delete(schema.sites).run();

    const result = await importSites(exported);

    expect(result.created).toBe(1);

    const accounts = await db.select().from(schema.accounts).all();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].accessToken).toBe('rt-token');
    expect(accounts[0].username).toBe('rt-user');
    expect(accounts[0].balance).toBe(42);

    const tokens = await db.select().from(schema.accountTokens).all();
    expect(tokens).toHaveLength(1);
    expect(tokens[0].name).toBe('rt-tok');
    expect(tokens[0].token).toBe('sk-rt');
  });

  it('imports connections from full backup format (accounts.accounts)', async () => {
    const data = {
      version: '2.1',
      timestamp: Date.now(),
      accounts: {
        sites: [
          { id: 42, name: 'Backup Site', url: 'https://backup-conn.example.com', platform: 'new-api' },
        ],
        siteApiEndpoints: [],
        siteDisabledModels: [],
        accounts: [
          { siteId: 42, username: 'backup-user', accessToken: 'backup-tok', balance: 15, status: 'active' },
        ],
        accountTokens: [],
        tokenRoutes: [],
        routeChannels: [],
      },
    };

    const result = await importSites(data);

    expect(result.created).toBe(1);

    const accounts = await db.select().from(schema.accounts).all();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].accessToken).toBe('backup-tok');
    expect(accounts[0].username).toBe('backup-user');
    expect(accounts[0].balance).toBe(15);
  });
});

describe('previewSiteImport', () => {
  it('previews new sites as created', async () => {
    const data = {
      version: '1.1',
      type: 'sites',
      timestamp: Date.now(),
      sites: [
        { name: 'New A', url: 'https://new-a.example.com', platform: 'new-api' },
        { name: 'New B', url: 'https://new-b.example.com', platform: 'openai' },
      ],
      siteApiEndpoints: [],
      siteDisabledModels: [],
      accounts: [],
      accountTokens: [],
    };

    const preview = await previewSiteImport(data);

    expect(preview.items).toHaveLength(2);
    expect(preview.items[0].action).toBe('created');
    expect(preview.items[0].name).toBe('New A');
    expect(preview.items[1].action).toBe('created');
    expect(preview.createdCount).toBe(2);
    expect(preview.updatedCount).toBe(0);
    expect(preview.errorCount).toBe(0);
    expect(preview.connectionsCount).toBe(0);
  });

  it('previews existing sites as updated with before/after counts', async () => {
    const site = await insertTestSite({ name: 'Existing', url: 'https://exists.example.com', platform: 'new-api' });
    await insertTestEndpoint(site.id, 'https://old.example.com/v1');
    await insertTestDisabledModel(site.id, 'gpt-3.5');

    const data = {
      version: '1.1',
      type: 'sites',
      timestamp: Date.now(),
      sites: [
        { name: 'Existing', url: 'https://exists.example.com', platform: 'new-api', globalWeight: 5 },
      ],
      siteApiEndpoints: [
        { siteIndex: 0, url: 'https://new.example.com/v1', enabled: true, sortOrder: 0 },
      ],
      siteDisabledModels: [
        { siteIndex: 0, modelName: 'gpt-4' },
      ],
      accounts: [],
      accountTokens: [],
    };

    const preview = await previewSiteImport(data);

    expect(preview.items).toHaveLength(1);
    expect(preview.items[0].action).toBe('updated');
    expect(preview.items[0].endpointsBefore).toBe(1);
    expect(preview.items[0].endpointsAfter).toBe(1);
    expect(preview.items[0].disabledModelsBefore).toBe(1);
    expect(preview.items[0].disabledModelsAfter).toBe(1);
    expect(preview.items[0].diffs).toBeDefined();
    const weightDiff = preview.items[0].diffs!.find((d) => d.field === 'globalWeight');
    expect(weightDiff).toBeDefined();
    expect(weightDiff!.before).toBe('1');
    expect(weightDiff!.after).toBe('5');
  });

  it('previews field-level diffs for updated sites', async () => {
    await insertTestSite({
      name: 'Old Name',
      url: 'https://diff.example.com',
      platform: 'new-api',
      proxyUrl: 'https://old-proxy.local:8080',
      globalWeight: 1,
    });

    const data = {
      version: '1.1',
      type: 'sites',
      timestamp: Date.now(),
      sites: [
        {
          name: 'New Name',
          url: 'https://diff.example.com',
          platform: 'new-api',
          proxyUrl: 'https://new-proxy.local:9090',
          globalWeight: 10,
          useSystemProxy: true,
        },
      ],
      siteApiEndpoints: [],
      siteDisabledModels: [],
      accounts: [],
      accountTokens: [],
    };

    const preview = await previewSiteImport(data);

    expect(preview.items[0].action).toBe('updated');
    expect(preview.items[0].diffs).toBeDefined();
    const diffFields = preview.items[0].diffs!.map((d) => d.field);
    expect(diffFields).toContain('name');
    expect(diffFields).toContain('proxyUrl');
    expect(diffFields).toContain('globalWeight');
    expect(diffFields).toContain('useSystemProxy');

    const nameDiff = preview.items[0].diffs!.find((d) => d.field === 'name')!;
    expect(nameDiff.before).toBe('Old Name');
    expect(nameDiff.after).toBe('New Name');
  });

  it('shows no-change when imported fields match existing', async () => {
    await insertTestSite({
      name: 'Same Name',
      url: 'https://same.example.com',
      platform: 'new-api',
      globalWeight: 1,
    });

    const data = {
      version: '1.1',
      type: 'sites',
      timestamp: Date.now(),
      sites: [
        { name: 'Same Name', url: 'https://same.example.com', platform: 'new-api', globalWeight: 1 },
      ],
      siteApiEndpoints: [],
      siteDisabledModels: [],
      accounts: [],
      accountTokens: [],
    };

    const preview = await previewSiteImport(data);

    expect(preview.items[0].action).toBe('no-change');
    expect(preview.items[0].diffs).toEqual([]);
    expect(preview.items[0].endpointsBefore).toBe(0);
    expect(preview.items[0].endpointsAfter).toBe(0);
    expect(preview.noChangeCount).toBe(1);
    expect(preview.updatedCount).toBe(0);
  });

  it('reports errors for invalid sites', async () => {
    const data = {
      version: '1.1',
      type: 'sites',
      timestamp: Date.now(),
      sites: [
        { name: '', url: '', platform: 'new-api' },
        { name: 'Valid', url: 'https://valid.example.com', platform: 'openai' },
      ],
      siteApiEndpoints: [],
      siteDisabledModels: [],
      accounts: [],
      accountTokens: [],
    };

    const preview = await previewSiteImport(data);

    expect(preview.items).toHaveLength(2);
    expect(preview.items[0].action).toBe('error');
    expect(preview.items[0].message).toContain('缺少必填字段');
    expect(preview.items[1].action).toBe('created');
    expect(preview.errorCount).toBe(1);
    expect(preview.createdCount).toBe(1);
  });

  it('counts connections and tokens in preview with before/after', async () => {
    const data = {
      version: '1.1',
      type: 'sites',
      timestamp: Date.now(),
      sites: [
        { name: 'Site', url: 'https://conn-preview.example.com', platform: 'new-api' },
      ],
      siteApiEndpoints: [],
      siteDisabledModels: [],
      accounts: [
        { siteIndex: 0, accessToken: 'tok-1' },
      ],
      accountTokens: [
        { accountIndex: 0, name: 't1', token: 'sk-1' },
        ],
    };

    const preview = await previewSiteImport(data);

    expect(preview.connectionsCount).toBe(1);
    expect(preview.tokensCount).toBe(1);
    expect(preview.items[0].connectionsBefore).toBe(0);
    expect(preview.items[0].connectionsAfter).toBe(1);
    expect(preview.items[0].tokensBefore).toBe(0);
    expect(preview.items[0].tokensAfter).toBe(1);
  });

  it('returns empty preview for no sites', async () => {
    const data = {
      version: '1.1',
      type: 'sites',
      timestamp: Date.now(),
      sites: [],
      siteApiEndpoints: [],
      siteDisabledModels: [],
      accounts: [],
      accountTokens: [],
    };

    const preview = await previewSiteImport(data);

    expect(preview.items).toHaveLength(0);
    expect(preview.createdCount).toBe(0);
    expect(preview.updatedCount).toBe(0);
  });

  it('throws on non-object input', async () => {
    await expect(previewSiteImport('bad')).rejects.toThrow('JSON 对象');
  });
});
