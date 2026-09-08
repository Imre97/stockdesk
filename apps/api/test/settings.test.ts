import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import { authHeader, createAccount, listAccounts, mainAccount, registerUser } from "./helpers.js";

const app = createApp({ rateLimit: { enabled: false } });

interface SettingsBody {
  language: string;
  theme: string;
  defaultAccountId: string | null;
}

function patchSettings(token: string, body: object): request.Test {
  return request(app).patch("/api/v1/settings").set(authHeader(token)).send(body);
}

function readSettings(token: string): request.Test {
  return request(app).get("/api/v1/settings").set(authHeader(token));
}

describe("GET /api/v1/settings", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("rejects an unauthenticated request", async () => {
    const response = await request(app).get("/api/v1/settings");

    expect(response.status).toBe(401);
  });

  it("returns the defaults created at registration", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    const response = await readSettings(registered.accessToken);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      settings: { language: "en", theme: "system", defaultAccountId: account.id },
    });
  });

  it("falls back to the oldest account when the referenced one is gone", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);
    expect((await createAccount(app, registered.accessToken, "Savings")).status).toBe(201);

    const created = await listAccounts(app, registered.accessToken);
    const savings = created.find((item) => item.name === "Savings");
    expect(savings).toBeDefined();

    expect((await patchSettings(registered.accessToken, { defaultAccountId: savings?.id })).status).toBe(200);
    await prisma.account.delete({ where: { id: savings?.id ?? "" } });

    const response = await readSettings(registered.accessToken);

    expect(response.status).toBe(200);
    expect((response.body as { settings: SettingsBody }).settings.defaultAccountId).toBe(account.id);

    const stored = await prisma.userSettings.findUniqueOrThrow({ where: { userId: registered.user.id } });
    expect(stored.defaultAccountId).toBe(savings?.id);
  });
});

describe("PATCH /api/v1/settings", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("persists language and theme", async () => {
    const registered = await registerUser(app);

    const response = await patchSettings(registered.accessToken, { language: "hu", theme: "dark" });

    expect(response.status).toBe(200);
    const settings = (response.body as { settings: SettingsBody }).settings;
    expect(settings.language).toBe("hu");
    expect(settings.theme).toBe("dark");

    const reread = (await readSettings(registered.accessToken)).body as { settings: SettingsBody };
    expect(reread.settings.language).toBe("hu");
    expect(reread.settings.theme).toBe("dark");
  });

  it("lets concurrent language and theme patches both land", async () => {
    const registered = await registerUser(app);

    const [first, second] = await Promise.all([
      patchSettings(registered.accessToken, { language: "hu" }),
      patchSettings(registered.accessToken, { theme: "light" }),
    ]);

    expect([first.status, second.status]).toEqual([200, 200]);

    const stored = await prisma.userSettings.findUniqueOrThrow({ where: { userId: registered.user.id } });
    expect(stored.language).toBe("hu");
    expect(stored.theme).toBe("light");
  });

  it("sets the default account", async () => {
    const registered = await registerUser(app);
    expect((await createAccount(app, registered.accessToken, "Savings")).status).toBe(201);
    const accounts = await listAccounts(app, registered.accessToken);
    const savings = accounts.find((item) => item.name === "Savings");

    const response = await patchSettings(registered.accessToken, { defaultAccountId: savings?.id });

    expect(response.status).toBe(200);
    expect((response.body as { settings: SettingsBody }).settings.defaultAccountId).toBe(savings?.id);
  });

  it("returns 404 for an account of another user", async () => {
    const registered = await registerUser(app);
    const other = await registerUser(app);
    const foreign = await mainAccount(app, other.accessToken);

    const response = await patchSettings(registered.accessToken, { defaultAccountId: foreign.id });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "ACCOUNT_NOT_FOUND" } });
  });

  it("rejects an explicit null default account", async () => {
    const registered = await registerUser(app);

    const response = await patchSettings(registered.accessToken, { defaultAccountId: null });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("rejects an unknown language and an unknown theme", async () => {
    const registered = await registerUser(app);

    const language = await patchSettings(registered.accessToken, { language: "de" });
    const theme = await patchSettings(registered.accessToken, { theme: "neon" });

    expect(language.status).toBe(422);
    expect(language.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(theme.status).toBe(422);
    expect(theme.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("rejects an empty patch", async () => {
    const registered = await registerUser(app);

    const response = await patchSettings(registered.accessToken, {});

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });
});
