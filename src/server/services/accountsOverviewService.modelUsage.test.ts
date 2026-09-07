import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatUtcSqlDateTime } from "./localTimeService.js";

type DbModule = typeof import("../db/index.js");
type ServiceModule = typeof import("./accountsOverviewService.js");
type ConfigModule = typeof import("../config.js");

describe("accountsOverviewService.loadAccountModelUsage", () => {
  let db: DbModule["db"];
  let closeDbConnections: DbModule["closeDbConnections"];
  let schema: DbModule["schema"];
  let loadAccountModelUsage: ServiceModule["loadAccountModelUsage"];
  let config: ConfigModule["config"];
  let previousWindowHours: number | undefined;
  let dataDir = "";
  let previousDataDir: string | undefined;

  beforeAll(async () => {
    previousDataDir = process.env.DATA_DIR;
    dataDir = mkdtempSync(join(tmpdir(), "metapi-model-usage-"));
    process.env.DATA_DIR = dataDir;

    await import("../db/migrate.js");
    const dbModule = await import("../db/index.js");
    const serviceModule = await import("./accountsOverviewService.js");
    const configModule = await import("../config.js");
    db = dbModule.db;
    closeDbConnections = dbModule.closeDbConnections;
    schema = dbModule.schema;
    loadAccountModelUsage = serviceModule.loadAccountModelUsage;
    config = configModule.config;
    previousWindowHours = config.accountAvailabilityWindowHours;
  });

  beforeEach(async () => {
    await db.delete(schema.proxyLogs).run();
    await db.delete(schema.accounts).run();
    await db.delete(schema.sites).run();
  });

  afterAll(async () => {
    if (previousWindowHours !== undefined) {
      config.accountAvailabilityWindowHours = previousWindowHours;
    }
    if (previousDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = previousDataDir;
    }
    await closeDbConnections();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("groups calls by resolved model name and computes availability/latency", async () => {
    const site = await db
      .insert(schema.sites)
      .values({
        name: "mu-site",
        url: "https://mu.example.com",
        platform: "new-api",
        status: "active",
      })
      .returning()
      .get();
    const account = await db
      .insert(schema.accounts)
      .values({
        siteId: site.id,
        username: "mu-user",
        accessToken: "mu-token",
        status: "active",
      })
      .returning()
      .get();

    const now = new Date();
    const recent = (minsAgo: number) =>
      formatUtcSqlDateTime(new Date(now.getTime() - minsAgo * 60_000));

    await db.insert(schema.proxyLogs).values([
      {
        accountId: account.id,
        status: "success",
        modelRequested: "gpt-5",
        modelActual: "gpt-5",
        totalTokens: 100,
        estimatedCost: 0.2,
        latencyMs: 120,
        createdAt: recent(10),
      },
      {
        accountId: account.id,
        status: "success",
        modelRequested: "gpt-5",
        modelActual: "gpt-5",
        totalTokens: 40,
        estimatedCost: 0.05,
        latencyMs: 80,
        createdAt: recent(20),
      },
      {
        accountId: account.id,
        status: "failed",
        modelRequested: "gpt-5",
        modelActual: "gpt-5",
        totalTokens: 20,
        estimatedCost: 0.01,
        latencyMs: 300,
        createdAt: recent(30),
      },
      {
        accountId: account.id,
        status: "success",
        modelRequested: "claude-3.5",
        modelActual: "claude-3.5-sonnet",
        totalTokens: 200,
        estimatedCost: 0.4,
        latencyMs: 500,
        createdAt: recent(40),
      },
    ]).run();

    const result = await loadAccountModelUsage(account.id, 24);

    expect(result.accountId).toBe(account.id);
    expect(result.windowHours).toBe(24);
    expect(typeof result.windowStartUtc).toBe("string");
    expect(result.windowStartUtc.trim().length).toBeGreaterThan(0);
    expect(result.models).toHaveLength(2);

    // sorted by totalRequests desc; gpt-5 has 3 calls, claude has 1
    const gpt = result.models[0]!;
    expect(gpt.model).toBe("gpt-5");
    expect(gpt.totalRequests).toBe(3);
    expect(gpt.successCount).toBe(2);
    expect(gpt.failedCount).toBe(1);
    // (120 + 80 + 300) / 3 latency rows = 166.67 -> rounded 167
    expect(gpt.averageLatencyMs).toBe(167);
    expect(gpt.totalTokens).toBe(160);
    expect(gpt.totalSpend).toBeCloseTo(0.26, 6);
    expect(gpt.availabilityPercent).toBe(66.7);

    const claude = result.models[1]!;
    expect(claude.model).toBe("claude-3.5-sonnet");
    expect(claude.totalRequests).toBe(1);
    expect(claude.successCount).toBe(1);
    expect(claude.failedCount).toBe(0);
    expect(claude.availabilityPercent).toBe(100);
    expect(claude.averageLatencyMs).toBe(500);
  });

  it("falls back to modelRequested and 'unknown' when modelActual is missing", async () => {
    const site = await db
      .insert(schema.sites)
      .values({
        name: "fb-site",
        url: "https://fb.example.com",
        platform: "new-api",
        status: "active",
      })
      .returning()
      .get();
    const account = await db
      .insert(schema.accounts)
      .values({
        siteId: site.id,
        username: "fb-user",
        accessToken: "fb-token",
        status: "active",
      })
      .returning()
      .get();

    const now = new Date();
    const recent = (minsAgo: number) =>
      formatUtcSqlDateTime(new Date(now.getTime() - minsAgo * 60_000));

    await db.insert(schema.proxyLogs).values([
      {
        // modelActual null -> resolves to modelRequested
        accountId: account.id,
        status: "success",
        modelRequested: "gpt-5",
        modelActual: null,
        latencyMs: 100,
        createdAt: recent(5),
      },
      {
        // both null -> 'unknown'
        accountId: account.id,
        status: "failed",
        modelRequested: null,
        modelActual: null,
        latencyMs: 0,
        createdAt: recent(15),
      },
    ]).run();

    const result = await loadAccountModelUsage(account.id, 24);
    const names = result.models.map((m) => m.model).sort();
    expect(names).toEqual(["gpt-5", "unknown"]);

    const unknown = result.models.find((m) => m.model === "unknown")!;
    expect(unknown.totalRequests).toBe(1);
    expect(unknown.failedCount).toBe(1);
    expect(unknown.averageLatencyMs).toBeNull(); // latencyMs 0 not counted
    expect(unknown.availabilityPercent).toBe(0);
  });

  it("excludes rows outside the lookback window", async () => {
    const site = await db
      .insert(schema.sites)
      .values({
        name: "win-site",
        url: "https://win.example.com",
        platform: "new-api",
        status: "active",
      })
      .returning()
      .get();
    const account = await db
      .insert(schema.accounts)
      .values({
        siteId: site.id,
        username: "win-user",
        accessToken: "win-token",
        status: "active",
      })
      .returning()
      .get();

    const now = new Date();
    const recent = (minsAgo: number) =>
      formatUtcSqlDateTime(new Date(now.getTime() - minsAgo * 60_000));

    await db.insert(schema.proxyLogs).values([
      {
        accountId: account.id,
        status: "success",
        modelRequested: "recent-model",
        modelActual: "recent-model",
        latencyMs: 50,
        createdAt: recent(10),
      },
      {
        // 2000 minutes ago (~33h) - outside default 24h window
        accountId: account.id,
        status: "success",
        modelRequested: "old-model",
        modelActual: "old-model",
        latencyMs: 50,
        createdAt: recent(2000),
      },
    ]).run();

    const result = await loadAccountModelUsage(account.id, 24);
    expect(result.models).toHaveLength(1);
    expect(result.models[0]!.model).toBe("recent-model");
  });

  it("treats retried/non-success statuses as failures", async () => {
    const site = await db
      .insert(schema.sites)
      .values({
        name: "st-site",
        url: "https://st.example.com",
        platform: "new-api",
        status: "active",
      })
      .returning()
      .get();
    const account = await db
      .insert(schema.accounts)
      .values({
        siteId: site.id,
        username: "st-user",
        accessToken: "st-token",
        status: "active",
      })
      .returning()
      .get();

    const now = new Date();
    const recent = (minsAgo: number) =>
      formatUtcSqlDateTime(new Date(now.getTime() - minsAgo * 60_000));

    await db.insert(schema.proxyLogs).values([
      {
        accountId: account.id,
        status: "retried",
        modelRequested: "m",
        modelActual: "m",
        latencyMs: 100,
        createdAt: recent(5),
      },
      {
        accountId: account.id,
        status: null,
        modelRequested: "m",
        modelActual: "m",
        latencyMs: 200,
        createdAt: recent(8),
      },
    ]).run();

    const result = await loadAccountModelUsage(account.id, 24);
    expect(result.models).toHaveLength(1);
    expect(result.models[0]!.totalRequests).toBe(2);
    expect(result.models[0]!.successCount).toBe(0);
    expect(result.models[0]!.failedCount).toBe(2);
    expect(result.models[0]!.availabilityPercent).toBe(0);
  });
});
