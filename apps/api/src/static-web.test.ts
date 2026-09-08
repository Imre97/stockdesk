import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mountStaticWeb } from "./static-web.js";

const INDEX_MARKER = "<div id=\"root\"></div>";
const ASSET_NAME = "app-abcdef12.js";

let distDir: string;
let app: express.Express;

beforeAll(() => {
  distDir = mkdtempSync(path.join(tmpdir(), "stockdesk-web-"));
  mkdirSync(path.join(distDir, "assets"));
  writeFileSync(path.join(distDir, "index.html"), `<html><body>${INDEX_MARKER}</body></html>`, "utf8");
  writeFileSync(path.join(distDir, "assets", ASSET_NAME), "export const marker = 'asset';", "utf8");

  app = express();
  app.get("/api/v1/health", (_request, response) => {
    response.json({ status: "ok" });
  });
  app.use("/api/v1", (_request, response) => {
    response.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } });
  });
  mountStaticWeb(app, distDir);
});

afterAll(() => {
  rmSync(distDir, { recursive: true, force: true });
});

describe("mountStaticWeb", () => {
  it("serves hashed assets as immutable", async () => {
    const response = await request(app).get(`/assets/${ASSET_NAME}`);

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  it("serves index.html for an application route without caching it", async () => {
    const response = await request(app).get("/login");

    expect(response.status).toBe(200);
    expect(response.text).toContain(INDEX_MARKER);
    expect(response.headers["cache-control"]).toBe("no-cache");
  });

  it("leaves API routes untouched", async () => {
    const handled = await request(app).get("/api/v1/health");
    expect(handled.status).toBe(200);
    expect(handled.body).toEqual({ status: "ok" });

    const unknown = await request(app).get("/api/v1/unknown");
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ error: { code: "NOT_FOUND", message: "Route not found." } });
    expect(unknown.text).not.toContain(INDEX_MARKER);
  });

  it("does not serve the SPA on the WebSocket path", async () => {
    const response = await request(app).get("/ws");

    expect(response.status).toBe(404);
    expect(response.text).not.toContain(INDEX_MARKER);
  });
});
