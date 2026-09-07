import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type DbModule = typeof import("../../db/index.js");

describe("accounts query endpoint — search + segment + pagination", () => {
  let app: FastifyInstance;
  let db: DbModule["db"];
  let schema: DbModule["schema"];
  let closeDbConnections: DbModule["closeDbConnections"] | undefined;
  let dataDir = "";
  let previousDataDir: string | undefined;

  beforeAll(async () => {
    previousDataDir = process.env.DATA_DIR;
    dataDir = mkdtempSync(join(tmpdir(), "metapi-accounts-query-"));
    process.env.DATA_DIR = dataDir;

    await import("../../db/migrate.js");
    const dbModule = await import("../../db/index.js");
    const routesModule = await import("./accounts.js");
    db = dbModule.db;
    schema = dbModule.schema;
    closeDbConnections = dbModule.closeDbConnections;

    app = Fastify();
    await app.register(routesModule.accountsRoutes);
  });

  beforeEach(async () => {
    await db.delete(schema.accounts).run();
    await db.delete(schema.sites).run();
  });

  afterAll(async () => {
    await app.close();
    if (typeof closeDbConnections === "function") {
      await closeDbConnections();
    }
    if (previousDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = previousDataDir;
    }
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function insertSite(name: string, platform = "new-api", url?: string) {
    const site = await db
      .insert(schema.sites)
      .values({
        name,
        url: url || `https://${name.toLowerCase()}.example.com`,
        platform,
      })
      .returning()
      .get();
    return site;
  }

  async function insertAccount(
    siteId: number,
    username: string,
    options: { accessToken?: string; apiToken?: string; status?: string; balance?: number } = {},
  ) {
    await db
      .insert(schema.accounts)
      .values({
        siteId,
        username,
        accessToken: options.accessToken ?? "",
        apiToken: options.apiToken ?? "",
        status: options.status ?? "active",
        balance: options.balance ?? 0,
      })
      .run();
  }

  it("returns paginated accounts with total count and page metadata", async () => {
    const site = await insertSite("Main Site");
    await insertAccount(site.id, "user-1", { accessToken: "tok-1", balance: 10 });
    await insertAccount(site.id, "user-2", { accessToken: "tok-2", balance: 20 });
    await insertAccount(site.id, "user-3", { accessToken: "tok-3", balance: 30 });

    const response = await app.inject({
      method: "GET",
      url: "/api/accounts/query?segment=session&limit=2&offset=0",
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(3);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(2);
    expect(body.items[0].username).toBe("user-1");
    expect(body.items[1].username).toBe("user-2");
  });

  it("returns second page when offset is provided", async () => {
    const site = await insertSite("Main Site");
    await insertAccount(site.id, "user-1", { accessToken: "tok-1" });
    await insertAccount(site.id, "user-2", { accessToken: "tok-2" });
    await insertAccount(site.id, "user-3", { accessToken: "tok-3" });

    const response = await app.inject({
      method: "GET",
      url: "/api/accounts/query?segment=session&limit=2&offset=2",
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(3);
    expect(body.page).toBe(2);
    expect(body.items[0].username).toBe("user-3");
  });

  it("filters accounts by search keyword on username (case-insensitive)", async () => {
    const site = await insertSite("Main Site");
    await insertAccount(site.id, "alpha-user", { accessToken: "tok" });
    await insertAccount(site.id, "beta-user", { accessToken: "tok" });
    await insertAccount(site.id, "gamma-user", { accessToken: "tok" });

    const response = await app.inject({
      method: "GET",
      url: "/api/accounts/query?search=alpha&segment=session&limit=50&offset=0",
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].username).toBe("alpha-user");
  });

  it("filters accounts by search keyword on site name", async () => {
    const siteA = await insertSite("OpenAI Platform");
    const siteB = await insertSite("Claude Platform");
    await insertAccount(siteA.id, "user-a", { accessToken: "tok" });
    await insertAccount(siteB.id, "user-b", { accessToken: "tok" });

    const response = await app.inject({
      method: "GET",
      url: "/api/accounts/query?search=claude&segment=session&limit=50&offset=0",
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].username).toBe("user-b");
    expect(body.items[0].site.name).toBe("Claude Platform");
  });

  it("filters by segment=session (only accounts with session tokens)", async () => {
    const site = await insertSite("Mixed Site");
    // session account: has accessToken
    await insertAccount(site.id, "session-user", { accessToken: "session-token" });
    // apikey account: only has apiToken, no accessToken
    await insertAccount(site.id, "apikey-user", { apiToken: "api-key-123" });

    const sessionResponse = await app.inject({
      method: "GET",
      url: "/api/accounts/query?segment=session&limit=50&offset=0",
    });
    const sessionBody = JSON.parse(sessionResponse.body);
    expect(sessionBody.items).toHaveLength(1);
    expect(sessionBody.items[0].username).toBe("session-user");

    const apikeyResponse = await app.inject({
      method: "GET",
      url: "/api/accounts/query?segment=apikey&limit=50&offset=0",
    });
    const apikeyBody = JSON.parse(apikeyResponse.body);
    expect(apikeyBody.items).toHaveLength(1);
    expect(apikeyBody.items[0].username).toBe("apikey-user");
  });

  it("returns items with credentialMode and capabilities", async () => {
    const site = await insertSite("Test Site");
    await insertAccount(site.id, "sess-user", { accessToken: "tok" });
    await insertAccount(site.id, "key-user", { apiToken: "key" });

    const response = await app.inject({
      method: "GET",
      url: "/api/accounts/query?limit=50&offset=0",
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items).toHaveLength(2);
    const sessionAccount = body.items.find((a: any) => a.username === "sess-user");
    const apikeyAccount = body.items.find((a: any) => a.username === "key-user");
    expect(sessionAccount.credentialMode).toBe("session");
    expect(sessionAccount.capabilities.proxyOnly).toBe(false);
    expect(apikeyAccount.credentialMode).toBe("apikey");
    expect(apikeyAccount.capabilities.proxyOnly).toBe(true);
  });

  it("returns empty items when search does not match", async () => {
    const site = await insertSite("Test Site");
    await insertAccount(site.id, "real-user", { accessToken: "tok" });

    const response = await app.inject({
      method: "GET",
      url: "/api/accounts/query?search=nonexistent&limit=50&offset=0",
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  it("filters accounts by siteId", async () => {
    const siteA = await insertSite("Site A");
    const siteB = await insertSite("Site B");
    await insertAccount(siteA.id, "user-a", { accessToken: "tok" });
    await insertAccount(siteB.id, "user-b", { accessToken: "tok" });
    await insertAccount(siteB.id, "user-c", { accessToken: "tok" });

    const response = await app.inject({
      method: "GET",
      url: `/api/accounts/query?siteId=${siteB.id}&limit=50&offset=0`,
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.items.every((a: any) => a.site.id === siteB.id)).toBe(true);
  });

  it("filters accounts by status", async () => {
    const site = await insertSite("Status Site");
    await insertAccount(site.id, "active-user", { accessToken: "tok", status: "active" });
    await insertAccount(site.id, "disabled-user", { accessToken: "tok", status: "disabled" });
    await insertAccount(site.id, "expired-user", { accessToken: "tok", status: "expired" });

    const response = await app.inject({
      method: "GET",
      url: "/api/accounts/query?status=expired&limit=50&offset=0",
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.items[0].username).toBe("expired-user");
  });

  it("combines siteId and status filters together", async () => {
    const siteA = await insertSite("Site A");
    const siteB = await insertSite("Site B");
    await insertAccount(siteA.id, "user-a1", { accessToken: "tok", status: "active" });
    await insertAccount(siteA.id, "user-a2", { accessToken: "tok", status: "disabled" });
    await insertAccount(siteB.id, "user-b1", { accessToken: "tok", status: "active" });
    await insertAccount(siteB.id, "user-b2", { accessToken: "tok", status: "disabled" });

    const response = await app.inject({
      method: "GET",
      url: `/api/accounts/query?siteId=${siteA.id}&status=disabled&limit=50&offset=0`,
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.items[0].username).toBe("user-a2");
  });

  it("combines search + siteId + status filters", async () => {
    const siteA = await insertSite("OpenAI Site");
    const siteB = await insertSite("Claude Site");
    await insertAccount(siteA.id, "alpha-user", { accessToken: "tok", status: "active" });
    await insertAccount(siteA.id, "alpha-bot", { accessToken: "tok", status: "disabled" });
    await insertAccount(siteB.id, "alpha-user", { accessToken: "tok", status: "active" });

    const response = await app.inject({
      method: "GET",
      url: `/api/accounts/query?search=alpha&siteId=${siteA.id}&status=active&limit=50&offset=0`,
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].username).toBe("alpha-user");
    expect(body.items[0].site.id).toBe(siteA.id);
    expect(body.items[0].status).toBe("active");
  });
});
