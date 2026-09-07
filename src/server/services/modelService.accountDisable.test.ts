import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';

type DbModule = typeof import('../db/index.js');
type ModelServiceModule = typeof import('./modelService.js');

describe('rebuildTokenRoutesFromAvailability with account disabled models', () => {
    let db: DbModule['db'];
    let schema: DbModule['schema'];
    let rebuildTokenRoutesFromAvailability: ModelServiceModule['rebuildTokenRoutesFromAvailability'];
    let dataDir = '';

    beforeAll(async () => {
        dataDir = mkdtempSync(join(tmpdir(), 'metapi-account-disabled-models-'));
        process.env.DATA_DIR = dataDir;

        await import('../db/migrate.js');
        const dbModule = await import('../db/index.js');
        const modelService = await import('./modelService.js');

        db = dbModule.db;
        schema = dbModule.schema;
        rebuildTokenRoutesFromAvailability = modelService.rebuildTokenRoutesFromAvailability;
    });

    beforeEach(async () => {
        await db.delete(schema.routeChannels).run();
        await db.delete(schema.tokenRoutes).run();
        await db.delete(schema.tokenModelAvailability).run();
        await db.delete(schema.modelAvailability).run();
        await db.delete(schema.accountDisabledModels).run();
        await db.delete(schema.siteDisabledModels).run();
        await db.delete(schema.accountTokens).run();
        await db.delete(schema.accounts).run();
        await db.delete(schema.sites).run();
    });

    afterAll(() => {
        delete process.env.DATA_DIR;
    });

    async function seedSiteWithTwoApiKeys(modelName: string) {
        const site = await db.insert(schema.sites).values({
            name: 'shared-site',
            url: 'https://shared.example.com',
            platform: 'new-api',
        }).returning().get();

        const accountA = await db.insert(schema.accounts).values({
            siteId: site.id,
            username: 'key-a',
            accessToken: '',
            apiToken: 'sk-key-a',
            status: 'active',
            extraConfig: JSON.stringify({ credentialMode: 'apikey' }),
        }).returning().get();

        const accountB = await db.insert(schema.accounts).values({
            siteId: site.id,
            username: 'key-b',
            accessToken: '',
            apiToken: 'sk-key-b',
            status: 'active',
            extraConfig: JSON.stringify({ credentialMode: 'apikey' }),
        }).returning().get();

        await db.insert(schema.modelAvailability).values([
            { accountId: accountA.id, modelName, available: true, latencyMs: 300 },
            { accountId: accountB.id, modelName, available: true, latencyMs: 400 },
        ]).run();

        return { site, accountA, accountB };
    }

    it('keeps the sibling connection channel when one connection disables the model', async () => {
        const modelName = 'claude-sonnet-4-5';
        const { accountA, accountB } = await seedSiteWithTwoApiKeys(modelName);

        // Disable the model only for connection A
        await db.insert(schema.accountDisabledModels).values({
            accountId: accountA.id,
            modelName,
        }).run();

        const rebuild = await rebuildTokenRoutesFromAvailability();

        expect(rebuild.models).toBe(1);

        const route = await db.select().from(schema.tokenRoutes)
            .where(eq(schema.tokenRoutes.modelPattern, modelName))
            .get();
        expect(route).toBeDefined();

        const channels = await db.select().from(schema.routeChannels)
            .where(eq(schema.routeChannels.routeId, route!.id))
            .all();

        // Only connection B keeps serving the model on the shared site
        expect(channels).toHaveLength(1);
        expect(channels[0]?.accountId).toBe(accountB.id);
    });

    it('drops the channel entirely when every connection on the site disables the model', async () => {
        const modelName = 'gpt-4o';
        const { accountA, accountB } = await seedSiteWithTwoApiKeys(modelName);

        await db.insert(schema.accountDisabledModels).values([
            { accountId: accountA.id, modelName },
            { accountId: accountB.id, modelName },
        ]).run();

        const rebuild = await rebuildTokenRoutesFromAvailability();

        expect(rebuild.models).toBe(0);

        const routes = await db.select().from(schema.tokenRoutes)
            .where(eq(schema.tokenRoutes.modelPattern, modelName))
            .all();
        expect(routes).toHaveLength(0);
    });

    it('blocks the model when either the site list or the connection list disables it', async () => {
        const modelName = 'gemini-2.5-pro';
        const { site, accountA } = await seedSiteWithTwoApiKeys(modelName);

        // Site-wide list wins regardless of the connection-level list
        await db.insert(schema.siteDisabledModels).values({
            siteId: site.id,
            modelName,
        }).run();

        const rebuild = await rebuildTokenRoutesFromAvailability();

        expect(rebuild.models).toBe(0);

        // Connection-level entry alone is enough too
        await db.delete(schema.siteDisabledModels).run();
        await db.insert(schema.accountDisabledModels).values({
            accountId: accountA.id,
            modelName,
        }).run();
        const sibling = await db.select().from(schema.accounts).all();
        expect(sibling).toHaveLength(2);

        const rebuildAfterSiteClear = await rebuildTokenRoutesFromAvailability();
        expect(rebuildAfterSiteClear.models).toBe(1);
        const route = await db.select().from(schema.tokenRoutes)
            .where(eq(schema.tokenRoutes.modelPattern, modelName))
            .get();
        expect(route).toBeDefined();
        const channels = await db.select().from(schema.routeChannels)
            .where(eq(schema.routeChannels.routeId, route!.id))
            .all();
        expect(channels).toHaveLength(1);
    });
});
