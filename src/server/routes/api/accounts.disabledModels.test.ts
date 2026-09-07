import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { eq } from 'drizzle-orm';

type DbModule = typeof import('../../db/index.js');

describe('accounts disabled models API', () => {
    let app: FastifyInstance;
    let db: DbModule['db'];
    let schema: DbModule['schema'];
    let dataDir = '';

    beforeAll(async () => {
        dataDir = mkdtempSync(join(tmpdir(), 'metapi-accounts-disabled-models-'));
        process.env.DATA_DIR = dataDir;

        await import('../../db/migrate.js');
        const dbModule = await import('../../db/index.js');
        const routesModule = await import('./accounts.js');
        db = dbModule.db;
        schema = dbModule.schema;

        app = Fastify();
        await app.register(routesModule.accountsRoutes);
    });

    beforeEach(async () => {
        await db.delete(schema.accountDisabledModels).run();
        await db.delete(schema.siteDisabledModels).run();
        await db.delete(schema.modelAvailability).run();
        await db.delete(schema.accounts).run();
        await db.delete(schema.sites).run();
    });

    afterAll(async () => {
        await app.close();
        delete process.env.DATA_DIR;
    });

    async function seedAccount() {
        const site = await db.insert(schema.sites).values({
            name: 'test-site',
            url: 'https://test-site.example.com',
            platform: 'new-api',
        }).returning().get();
        const account = await db.insert(schema.accounts).values({
            siteId: site.id,
            username: 'key-a',
            accessToken: '',
            apiToken: 'sk-key-a',
            status: 'active',
        }).returning().get();
        return { site, account };
    }

    it('returns empty list for a new account', async () => {
        const { account } = await seedAccount();

        const resp = await app.inject({
            method: 'GET',
            url: `/api/accounts/${account.id}/disabled-models`,
        });

        expect(resp.statusCode).toBe(200);
        const body = resp.json();
        expect(body.accountId).toBe(account.id);
        expect(body.models).toEqual([]);
    });

    it('sets and retrieves connection-level disabled models (full replace)', async () => {
        const { account } = await seedAccount();

        const putResp = await app.inject({
            method: 'PUT',
            url: `/api/accounts/${account.id}/disabled-models`,
            payload: { models: ['gpt-4o', 'gpt-4o ', 'gpt-4o'] },
        });

        expect(putResp.statusCode).toBe(200);
        expect(putResp.json().models).toEqual(['gpt-4o']);

        const getResp = await app.inject({
            method: 'GET',
            url: `/api/accounts/${account.id}/disabled-models`,
        });
        expect(getResp.statusCode).toBe(200);
        expect(getResp.json().models).toEqual(['gpt-4o']);
    });

    it('reports per-scope disabled models from the account models endpoint', async () => {
        const { site, account } = await seedAccount();

        await db.insert(schema.siteDisabledModels).values({
            siteId: site.id,
            modelName: 'site-blocked',
        }).run();
        await db.insert(schema.accountDisabledModels).values({
            accountId: account.id,
            modelName: 'key-blocked',
        }).run();
        await db.insert(schema.modelAvailability).values([
            { accountId: account.id, modelName: 'site-blocked', available: true, latencyMs: 100 },
            { accountId: account.id, modelName: 'key-blocked', available: true, latencyMs: 110 },
            { accountId: account.id, modelName: 'usable-model', available: true, latencyMs: 120 },
        ]).run();

        const resp = await app.inject({
            method: 'GET',
            url: `/api/accounts/${account.id}/models`,
        });

        expect(resp.statusCode).toBe(200);
        const body = resp.json();
        expect(body.siteDisabledModels).toEqual(['site-blocked']);
        expect(body.accountDisabledModels).toEqual(['key-blocked']);
        const disabledByName = new Map<string, boolean>(
            body.models.map((m: { name: string; disabled: boolean }) => [m.name, m.disabled]),
        );
        expect(disabledByName.get('site-blocked')).toBe(true);
        expect(disabledByName.get('key-blocked')).toBe(true);
        expect(disabledByName.get('usable-model')).toBe(false);
    });

    it('returns 404 for a missing account', async () => {
        const resp = await app.inject({
            method: 'GET',
            url: '/api/accounts/999999/disabled-models',
        });
        expect(resp.statusCode).toBe(404);
    });
});
